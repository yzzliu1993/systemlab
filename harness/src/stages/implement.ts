import { worktreePath } from '../config';
import { runClaudeWithResultFix } from '../agents/runClaude';
import type { AgentResult } from '../agents/result';
import { remoteBranchSha, prepareWorktree } from '../git/worktree';
import { LABELS, type Ticket } from '../linear/client';
import { log } from '../log';
import { loadPrompt, renderTemplate } from '../prompts';
import { describeFailure, logAgentEnd, stopForHuman, type Deps } from './common';

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

function feedbackSection(feedback: string | undefined): string {
  return feedback ? `## 上一輪的問題，請先處理\n\n${feedback}` : '';
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

export interface ImplementInput {
  branch: string;
  /** 上一輪 review 退件意見、CI log 或衝突說明。 */
  feedback?: string;
  /** 重工時必須產生新 commit：遠端分支不可停留在這個 SHA。 */
  mustChangeFrom?: string;
}

export type ImplementOutcome = { kind: 'pr'; prUrl: string; sha: string } | { kind: 'stopped' };

/**
 * Implement 階段（HARNESS_SPEC §3）：
 * In Progress → agent 實作並 push → 等 CI（失敗帶 log 重試）→ 確保 PR 存在 → In Review。
 */
export async function implement(deps: Deps, ticket: Ticket, input: ImplementInput): Promise<ImplementOutcome> {
  const { config, linear, github } = deps;
  const { branch } = input;
  const id = ticket.identifier;
  const cwd = worktreePath(config);

  await linear.setState(ticket, 'In Progress');
  await linear.addLabel(ticket, LABELS.working);
  log({ ticket: id, event: 'claim', stage: 'implement', branch });

  const tools = implementTools(branch, config.baseBranch);
  const template = loadPrompt('implement');
  let feedback = input.feedback;
  let lastResult: AgentResult | undefined;
  let passedSha: string | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    await prepareWorktree(cwd, branch, config.baseBranch);
    const prompt = renderTemplate(template, {
      branch,
      baseBranch: config.baseBranch,
      attempt,
      maxAttempts: config.maxAttempts,
      identifier: id,
      title: ticket.title,
      url: ticket.url,
      description: ticket.description,
      feedback: feedbackSection(feedback),
    });

    log({ ticket: id, event: 'agent_start', stage: 'implement', attempt });
    const startedAt = Date.now();
    const outcome = await runClaudeWithResultFix(config, {
      prompt,
      cwd,
      allowedTools: tools.allowed,
      disallowedTools: tools.disallowed,
      maxTurns: config.implement.maxTurns,
      timeoutMinutes: config.implement.timeoutMinutes,
    });
    logAgentEnd(id, 'implement', attempt, startedAt, outcome);

    if (outcome.kind !== 'ok') {
      feedback = describeFailure(outcome);
      continue;
    }
    lastResult = outcome.result;

    if (outcome.result.status === 'blocked') {
      await stopForHuman(deps, ticket, 'implement', `Agent 回報無法繼續：${outcome.result.blocked_reason ?? outcome.result.summary}`);
      return { kind: 'stopped' };
    }

    const [branchSha, baseSha] = await Promise.all([
      remoteBranchSha(cwd, branch),
      remoteBranchSha(cwd, config.baseBranch),
    ]);
    if (!branchSha || branchSha === baseSha || branchSha === input.mustChangeFrom) {
      feedback = `你回報完成，但遠端分支 \`${branch}\` 沒有新的 commit。請 commit 後執行 \`git push origin ${branch}\`。`;
      log({ ticket: id, event: 'error', stage: 'implement', attempt, error: feedback });
      continue;
    }

    const ci = await github.waitForCi(branchSha, config.ciTimeoutMinutes);
    log({ ticket: id, event: 'ci_result', stage: 'implement', attempt, status: ci.kind, sha: branchSha,
      error: ci.kind === 'failure' ? ci.log : undefined });
    if (ci.kind === 'success') {
      passedSha = branchSha;
      break;
    }
    feedback = ci.kind === 'failure'
      ? `CI（\`npm run harness:verify\`）失敗，失敗的 log 如下：\n\n\`\`\`\n${ci.log}\n\`\`\``
      : `CI 在 ${config.ciTimeoutMinutes} 分鐘內沒有跑完。`;
  }

  if (!passedSha || !lastResult) {
    await stopForHuman(deps, ticket, 'implement', `Implement 嘗試 ${config.maxAttempts} 次仍未通過。最後的錯誤：\n\n${feedback ?? '（無）'}`);
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
  log({ ticket: id, event: 'state_change', status: 'In Review' });
  return { kind: 'pr', prUrl, sha: passedSha };
}
