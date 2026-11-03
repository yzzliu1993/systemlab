import { worktreePath, type Config } from '../config';
import { runClaudeWithResultFix, type ClaudeRunOutcome } from '../agents/runClaude';
import type { AgentResult } from '../agents/result';
import { remoteBranchSha, prepareWorktree } from '../git/worktree';
import type { GitHub } from '../github/client';
import { LABELS, type Linear, type Ticket } from '../linear/client';
import { log } from '../log';
import { loadPrompt, renderTemplate } from '../prompts';
import { branchNameFor, checkTicket } from '../ticket';

export interface Deps {
  config: Config;
  linear: Linear;
  github: GitHub;
}

export function implementTools(branch: string): { allowed: string[]; disallowed: string[] } {
  return {
    allowed: [
      'Read', 'Glob', 'Grep', 'Edit', 'Write',
      'Bash(npm run *)', 'Bash(npx vitest *)',
      'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git add *)', 'Bash(git commit *)',
      `Bash(git push origin ${branch})`,
      'mcp__linear__get_issue', 'mcp__linear__list_issues', 'mcp__linear__save_issue', 'mcp__linear__save_comment',
    ],
    disallowed: ['Bash(git push --force*)', 'Bash(git push -f*)', 'Bash(git checkout *)', 'Bash(git reset *)'],
  };
}

function describeFailure(outcome: Exclude<ClaudeRunOutcome, { kind: 'ok' }>): string {
  return outcome.kind === 'timeout' ? 'agent 執行逾時' : outcome.error;
}

function feedbackSection(feedback: string | undefined): string {
  return feedback ? `## 上一次嘗試失敗，請先修正這個問題\n\n${feedback}` : '';
}

function prBody(ticket: Ticket, result: AgentResult): string {
  const assumptions = result.assumptions.length
    ? result.assumptions.map((a) => `- ${a}`).join('\n')
    : '- 無';
  return [
    `Linear: ${ticket.url}`,
    '',
    '## 摘要',
    result.summary,
    '',
    '## 假設',
    assumptions,
    '',
    '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].join('\n');
}

async function stopForHuman(deps: Deps, ticket: Ticket, reason: string): Promise<void> {
  await deps.linear.removeLabel(ticket, LABELS.working);
  await deps.linear.addLabel(ticket, LABELS.needsHuman);
  await deps.linear.comment(ticket, `🛑 **Harness 已停止處理此票，需要人工介入**\n\n${reason}`);
  await deps.linear.assignToMe(ticket);
  log({ ticket: ticket.identifier, event: 'circuit_break', stage: 'implement', error: reason });
}

/**
 * Implement 流程（HARNESS_SPEC §3、§10 Phase 1）：
 * 格式檢查 → 認領 → agent 實作並 push → 等 CI（失敗帶 log 重試）→ 開 PR → In Review。
 */
export async function runImplement(deps: Deps, identifier: string): Promise<'pr_created' | 'stopped'> {
  const { config, linear, github } = deps;
  const ticket = await linear.getTicket(identifier);

  const check = checkTicket(ticket.description);
  if (!check.ok) {
    await stopForHuman(deps, ticket, `票券格式不完整（HARNESS_SPEC §2.3），缺少：${check.missing.join('、')}`);
    return 'stopped';
  }

  const branch = branchNameFor(
    ticket.identifier, ticket.branchName, ticket.labelNames, config.branchTypeByLabel, config.defaultBranchType,
  );
  const cwd = worktreePath(config);

  await linear.setState(ticket, 'In Progress');
  await linear.addLabel(ticket, LABELS.working);
  log({ ticket: identifier, event: 'claim', stage: 'implement', branch });

  const tools = implementTools(branch);
  const template = loadPrompt('implement');
  let feedback: string | undefined;
  let lastResult: AgentResult | undefined;
  let ciPassed = false;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    await prepareWorktree(cwd, branch, config.baseBranch);
    const prompt = renderTemplate(template, {
      branch,
      attempt,
      maxAttempts: config.maxAttempts,
      identifier: ticket.identifier,
      title: ticket.title,
      url: ticket.url,
      description: ticket.description,
      feedback: feedbackSection(feedback),
    });

    log({ ticket: identifier, event: 'agent_start', stage: 'implement', attempt });
    const startedAt = Date.now();
    const outcome = await runClaudeWithResultFix(config, {
      prompt,
      cwd,
      allowedTools: tools.allowed,
      disallowedTools: tools.disallowed,
      maxTurns: config.implement.maxTurns,
      timeoutMinutes: config.implement.timeoutMinutes,
    });
    const durationSec = Math.round((Date.now() - startedAt) / 1000);

    if (outcome.kind !== 'ok') {
      feedback = describeFailure(outcome);
      log({
        ticket: identifier, event: 'agent_end', stage: 'implement', attempt, status: 'failed', durationSec,
        turns: 'output' in outcome ? outcome.output?.num_turns : undefined,
        sessionId: 'output' in outcome ? outcome.output?.session_id : undefined,
        error: feedback,
      });
      continue;
    }

    lastResult = outcome.result;
    log({
      ticket: identifier, event: 'agent_end', stage: 'implement', attempt, status: outcome.result.status,
      durationSec, turns: outcome.output.num_turns, sessionId: outcome.output.session_id,
      summary: outcome.result.summary,
    });

    if (outcome.result.status === 'blocked') {
      await stopForHuman(deps, ticket, `Agent 回報無法繼續：${outcome.result.blocked_reason ?? outcome.result.summary}`);
      return 'stopped';
    }

    const [branchSha, baseSha] = await Promise.all([
      remoteBranchSha(cwd, branch),
      remoteBranchSha(cwd, config.baseBranch),
    ]);
    if (!branchSha || branchSha === baseSha) {
      feedback = `你回報完成，但遠端分支 \`${branch}\` 沒有新的 commit。請 commit 後執行 \`git push origin ${branch}\`。`;
      log({ ticket: identifier, event: 'error', stage: 'implement', attempt, error: feedback });
      continue;
    }

    const ci = await github.waitForCi(branchSha, config.ciTimeoutMinutes);
    log({ ticket: identifier, event: 'ci_result', stage: 'wait_ci', attempt, status: ci.kind, sha: branchSha,
      error: ci.kind === 'failure' ? ci.log : undefined });
    if (ci.kind === 'success') {
      ciPassed = true;
      break;
    }
    feedback = ci.kind === 'failure'
      ? `CI（\`npm run harness:verify\`）失敗，失敗的 log 如下：\n\n\`\`\`\n${ci.log}\n\`\`\``
      : `CI 在 ${config.ciTimeoutMinutes} 分鐘內沒有跑完。`;
  }

  if (!ciPassed || !lastResult) {
    await stopForHuman(deps, ticket, `Implement 嘗試 ${config.maxAttempts} 次仍未通過。最後的錯誤：\n\n${feedback ?? '（無）'}`);
    return 'stopped';
  }

  const prUrl = await github.ensurePullRequest({
    head: branch,
    base: config.baseBranch,
    title: `[${ticket.identifier}] ${ticket.title}`,
    body: prBody(ticket, lastResult),
  });
  log({ ticket: identifier, event: 'pr_created', stage: 'implement', pr: prUrl });

  await linear.setState(ticket, 'In Review');
  log({ ticket: identifier, event: 'state_change', status: 'In Review' });
  // Phase 1 沒有 Review agent：釋放認領鎖，交給人 review 與 merge。
  await linear.removeLabel(ticket, LABELS.working);
  await linear.comment(ticket, `✅ **Implement 完成**，PR：${prUrl}\n\n${lastResult.summary}\n\n（Phase 1：請人工 review 並 merge）`);
  await linear.assignToMe(ticket);
  return 'pr_created';
}
