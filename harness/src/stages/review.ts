import { worktreePath } from '../config';
import { runClaudeWithResultFix } from '../agents/runClaude';
import { prepareWorktree } from '../git/worktree';
import type { Ticket } from '../linear/client';
import { log } from '../log';
import { loadPrompt, renderTemplate } from '../prompts';
import { describeFailure, logAgentEnd, stopForHuman, type Deps } from './common';

export const REVIEW_TOOLS = {
  allowed: [
    'Read', 'Glob', 'Grep',
    'Bash(git diff*)', 'Bash(git log*)', 'Bash(git show*)',
    'mcp__linear__get_issue', 'mcp__linear__list_issues', 'mcp__linear__save_issue',
  ],
  disallowed: ['Edit', 'Write', 'NotebookEdit'],
};

export interface ReviewInput {
  branch: string;
  prUrl: string;
  /** 第幾輪 review（從 1 開始）。 */
  round: number;
  /** 上一輪的 review 內容，讓這一輪確認是否已處理。 */
  previousReview?: string;
}

export type ReviewOutcome =
  | { kind: 'approve'; summary: string }
  | { kind: 'changes_requested'; summary: string }
  | { kind: 'stopped' };

/** Review 階段（HARNESS_SPEC §4.3）：唯讀審查 diff，回傳判定；review 內容由 orchestrator 貼到 PR。 */
export async function review(deps: Deps, ticket: Ticket, input: ReviewInput): Promise<ReviewOutcome> {
  const { config, github } = deps;
  const id = ticket.identifier;
  const cwd = worktreePath(config);
  const template = loadPrompt('review');
  let lastError = '';

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    await prepareWorktree(cwd, input.branch, config.baseBranch);
    const prompt = renderTemplate(template, {
      branch: input.branch,
      baseBranch: config.baseBranch,
      prUrl: input.prUrl,
      round: input.round,
      maxRounds: config.maxReviewRounds,
      identifier: id,
      title: ticket.title,
      description: ticket.description,
      previousReview: input.previousReview ? `## 上一輪的 review\n\n${input.previousReview}` : '',
    });

    log({ ticket: id, event: 'agent_start', stage: 'review', attempt, round: input.round });
    const startedAt = Date.now();
    const outcome = await runClaudeWithResultFix(config, {
      prompt,
      cwd,
      allowedTools: REVIEW_TOOLS.allowed,
      disallowedTools: REVIEW_TOOLS.disallowed,
      maxTurns: config.review.maxTurns,
      timeoutMinutes: config.review.timeoutMinutes,
    });
    logAgentEnd(id, 'review', attempt, startedAt, outcome);

    if (outcome.kind !== 'ok') {
      lastError = describeFailure(outcome);
      continue;
    }

    const { status, summary, blocked_reason } = outcome.result;
    if (status === 'done') {
      lastError = 'Review agent 回傳了 done；review 只能回傳 approve、changes_requested 或 blocked。';
      continue;
    }
    await github.commentOnPullRequest(input.prUrl, `## 🤖 Harness Review（第 ${input.round} 輪）：${status}\n\n${summary}`);
    log({ ticket: id, event: 'review_result', stage: 'review', round: input.round, status });

    if (status === 'approve') return { kind: 'approve', summary };
    if (status === 'changes_requested') return { kind: 'changes_requested', summary };
    await stopForHuman(deps, ticket, 'review', `Review agent 無法判定：${blocked_reason ?? summary}`);
    return { kind: 'stopped' };
  }

  await stopForHuman(deps, ticket, 'review', `Review agent 執行 ${config.maxAttempts} 次都失敗。最後的錯誤：\n\n${lastError}`);
  return { kind: 'stopped' };
}
