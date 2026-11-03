import { existsSync } from 'node:fs';
import { REPO_ROOT, worktreePath } from '../config';
import type { AgentResult } from '../agents/result';
import { remoteBranchSha, prepareWorktree } from '../git/worktree';
import { LABELS, type Ticket } from '../linear/client';
import { log } from '../log';
import { loadPrompt, renderTemplate } from '../prompts';
import { describeFailure, runAgent, stopForHuman, type StageContext } from './common';

export function implementTools(branch: string, baseBranch: string): { allowed: string[]; disallowed: string[] } {
  return {
    allowed: [
      'Read', 'Glob', 'Grep', 'Edit', 'Write',
      'Bash(npm run *)', 'Bash(npx vitest *)',
      'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git add *)', 'Bash(git commit *)',
      'Bash(git fetch origin*)', `Bash(git merge origin/${baseBranch}*)`,
      `Bash(git push origin ${branch})`,
      'mcp__linear__get_issue', 'mcp__linear__list_issues', 'mcp__linear__save_issue', 'mcp__linear__save_comment',
    ],
    disallowed: ['Bash(git push --force*)', 'Bash(git push -f*)', 'Bash(git checkout *)', 'Bash(git reset *)', 'Bash(git rebase *)'],
  };
}

/** 重工原因（review 退件、衝突）與上一次嘗試的失敗分開呈現，避免後者蓋掉前者。 */
function feedbackSection(rework: string | undefined, lastFailure: string | undefined): string {
  const parts: string[] = [];
  if (rework) parts.push(`## 上一輪的問題，請先處理\n\n${rework}`);
  if (lastFailure) parts.push(`## 上一次嘗試失敗的原因\n\n${lastFailure}`);
  return parts.join('\n\n');
}

function prBody(ticket: Ticket, result: AgentResult | undefined): string {
  const assumptions = result?.assumptions.length
    ? result.assumptions.map((a) => `- ${a}`).join('\n')
    : '- 無';
  return [
    `Linear: ${ticket.url}`,
    '',
    '## 摘要',
    result?.summary ?? '（見 Linear handoff 紀錄）',
    '',
    '## 假設',
    assumptions,
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].join('\n');
}

const ciFeedback = (log: string) => `CI（\`npm run harness:verify\`）失敗，失敗的 log 如下：\n\n\`\`\`\n${log}\n\`\`\``;

export type ImplementOutcome = { kind: 'pr'; prUrl: string; sha: string } | { kind: 'stopped' };

/**
 * Implement 階段（HARNESS_SPEC §3）：
 * In Progress → agent 實作並 push → 等 CI（失敗帶 log 重試）→ 確保 PR 存在 → In Review。
 * 待處理的問題（feedback）、失敗次數、等待中的 CI 都存在 handoff，中斷後可接續。
 */
export async function implement(ctx: StageContext): Promise<ImplementOutcome> {
  const { deps, ticket, store } = ctx;
  const { config, linear, github } = deps;
  const id = ticket.identifier;
  const cwd = worktreePath(config);
  const handoff = store.value!;
  const { branch } = handoff;

  await linear.setState(ticket, 'In Progress');
  await linear.addLabel(ticket, LABELS.working);
  await store.save({ stage: 'implement', nextStep: '實作並通過 CI' });
  log({ ticket: id, event: 'claim', stage: 'implement', branch, attempt: handoff.attempt });

  const tools = implementTools(branch, config.baseBranch);
  const template = loadPrompt('implement');
  let lastResult: AgentResult | undefined;
  let passedSha: string | undefined;
  let interrupted = handoff.inFlight?.stage === 'implement' ? handoff.inFlight : undefined;

  // 上次已 push、還在等 CI 時被中斷：遠端分支沒變就直接等 CI。
  let ciSha = handoff.pendingCiSha && handoff.pendingCiSha === (await remoteBranchSha(gitDir(cwd), branch))
    ? handoff.pendingCiSha
    : undefined;

  for (let attempt = handoff.attempt + 1; attempt <= config.maxAttempts; ) {
    if (!ciSha) {
      await prepareWorktree(cwd, branch, config.baseBranch, { keepLocalChanges: interrupted !== undefined });
      const prompt = renderTemplate(template, {
        branch,
        baseBranch: config.baseBranch,
        attempt,
        maxAttempts: config.maxAttempts,
        identifier: id,
        title: ticket.title,
        url: ticket.url,
        description: ticket.description,
        feedback: feedbackSection(store.value!.feedback, store.value!.lastFailure),
      });
      const outcome = await runAgent(ctx, 'implement', attempt, {
        prompt,
        cwd,
        allowedTools: tools.allowed,
        disallowedTools: tools.disallowed,
        maxTurns: config.implement.maxTurns,
        timeoutMinutes: config.implement.timeoutMinutes,
      }, interrupted && { sessionId: interrupted.sessionId, reason: 'harness 程式被中斷（例如 Ctrl+C 或電腦休眠）' });
      interrupted = undefined;

      if (outcome.kind !== 'ok') {
        await countFailure(describeFailure(outcome));
        attempt++;
        continue;
      }
      lastResult = outcome.result;
      await store.save({ done: [...store.value!.done, outcome.result.summary].slice(-5), nextStep: outcome.result.next_step });

      if (outcome.result.status === 'blocked') {
        await stopForHuman(ctx, 'implement', `Agent 回報無法繼續：${outcome.result.blocked_reason ?? outcome.result.summary}`);
        return { kind: 'stopped' };
      }

      const [branchSha, baseSha] = await Promise.all([
        remoteBranchSha(cwd, branch),
        remoteBranchSha(cwd, config.baseBranch),
      ]);
      if (!branchSha || branchSha === baseSha || branchSha === store.value!.mustChangeFrom) {
        await countFailure(`你回報完成，但遠端分支 \`${branch}\` 沒有新的 commit。請 commit 後執行 \`git push origin ${branch}\`。`);
        attempt++;
        continue;
      }
      ciSha = branchSha;
      await store.save({ pendingCiSha: ciSha, lastCommit: ciSha, nextStep: '等待 CI' });
    }

    const ci = await github.waitForCi(ciSha, config.ciTimeoutMinutes);
    log({ ticket: id, event: 'ci_result', stage: 'implement', attempt, status: ci.kind, sha: ciSha,
      error: ci.kind === 'failure' ? ci.log : undefined });
    if (ci.kind === 'success') {
      passedSha = ciSha;
      break;
    }
    ciSha = undefined;
    await countFailure(ci.kind === 'failure' ? ciFeedback(ci.log) : `CI 在 ${config.ciTimeoutMinutes} 分鐘內沒有跑完。`);
    attempt++;
  }

  if (!passedSha) {
    await stopForHuman(ctx, 'implement', `Implement 已失敗 ${config.maxAttempts} 次。最後的錯誤：\n\n${store.value!.lastFailure ?? '（無）'}`);
    return { kind: 'stopped' };
  }

  const prUrl = await github.ensurePullRequest({
    head: branch,
    base: config.baseBranch,
    title: `[${id}] ${ticket.title}`,
    body: prBody(ticket, lastResult),
  });
  log({ ticket: id, event: 'pr_created', stage: 'implement', pr: prUrl });

  await linear.setState(ticket, 'In Review');
  await store.save({
    stage: 'review', prUrl, lastCommit: passedSha, attempt: 0,
    pendingCiSha: undefined, feedback: undefined, lastFailure: undefined, mustChangeFrom: undefined, nextStep: 'Review',
  });
  log({ ticket: id, event: 'state_change', status: 'In Review' });
  return { kind: 'pr', prUrl, sha: passedSha };

  /** 記一次確定性失敗：累加次數，錯誤內容成為下一次嘗試的 feedback。 */
  async function countFailure(message: string): Promise<void> {
    await store.save({ attempt: store.value!.attempt + 1, lastError: message, lastFailure: message });
    log({ ticket: id, event: 'error', stage: 'implement', attempt: store.value!.attempt, error: message });
  }
}

/** remoteBranchSha 需要一個 git 目錄；worktree 可能還沒建立，此時用主 repo。 */
function gitDir(cwd: string): string {
  return existsSync(cwd) ? cwd : REPO_ROOT;
}
