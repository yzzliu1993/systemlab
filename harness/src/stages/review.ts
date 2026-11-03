import { worktreePath } from '../config';
import { prepareWorktree } from '../git/worktree';
import { log } from '../log';
import { loadPrompt, renderTemplate } from '../prompts';
import { describeFailure, runAgent, stopForHuman, type StageContext } from './common';

export const REVIEW_TOOLS = {
  allowed: [
    'Read', 'Glob', 'Grep',
    'Bash(git diff*)', 'Bash(git log*)', 'Bash(git show*)',
    'mcp__linear__get_issue', 'mcp__linear__list_issues', 'mcp__linear__save_issue',
  ],
  disallowed: ['Edit', 'Write', 'NotebookEdit'],
};

export type ReviewOutcome =
  | { kind: 'approve'; summary: string }
  | { kind: 'changes_requested'; summary: string }
  | { kind: 'stopped' };

/** Review 階段（HARNESS_SPEC §4.3）：唯讀審查 diff，回傳判定；review 內容由 orchestrator 貼到 PR。 */
export async function review(ctx: StageContext): Promise<ReviewOutcome> {
  const { deps, ticket, store } = ctx;
  const { config, github } = deps;
  const id = ticket.identifier;
  const cwd = worktreePath(config);
  const template = loadPrompt('review');
  const handoff = store.value!;
  const prUrl = handoff.prUrl!;
  const round = handoff.rejections + 1;
  let interrupted = handoff.inFlight?.stage === 'review' ? handoff.inFlight : undefined;

  await store.save({ stage: 'review', nextStep: `第 ${round} 輪 review` });

  for (let attempt = handoff.attempt + 1; attempt <= config.maxAttempts; attempt++) {
    await prepareWorktree(cwd, handoff.branch, config.baseBranch);
    const prompt = renderTemplate(template, {
      branch: handoff.branch,
      baseBranch: config.baseBranch,
      prUrl,
      round,
      maxRounds: config.maxReviewRounds,
      identifier: id,
      title: ticket.title,
      description: ticket.description,
      previousReview: handoff.rejections > 0 && handoff.lastReview ? `## 上一輪的 review\n\n${handoff.lastReview}` : '',
    });

    const outcome = await runAgent(ctx, 'review', attempt, {
      prompt,
      cwd,
      allowedTools: REVIEW_TOOLS.allowed,
      disallowedTools: REVIEW_TOOLS.disallowed,
      maxTurns: config.review.maxTurns,
      timeoutMinutes: config.review.timeoutMinutes,
    }, interrupted && { sessionId: interrupted.sessionId, reason: 'harness 程式被中斷' });
    interrupted = undefined;

    const error = outcome.kind !== 'ok'
      ? describeFailure(outcome)
      : outcome.result.status === 'done'
        ? 'Review agent 回傳了 done；review 只能回傳 approve、changes_requested 或 blocked。'
        : undefined;
    if (error || outcome.kind !== 'ok') {
      await store.save({ attempt: attempt, lastError: error });
      continue;
    }

    const { status, summary, blocked_reason } = outcome.result;
    await github.commentOnPullRequest(prUrl, `## 🤖 Harness Review（第 ${round} 輪）：${status}\n\n${summary}`);
    log({ ticket: id, event: 'review_result', stage: 'review', round, status });
    await store.save({ attempt: 0, lastReview: summary });

    if (status === 'approve') return { kind: 'approve', summary };
    if (status === 'changes_requested') return { kind: 'changes_requested', summary };
    await stopForHuman(ctx, 'review', `Review agent 無法判定：${blocked_reason ?? summary}`);
    return { kind: 'stopped' };
  }

  await stopForHuman(ctx, 'review', `Review agent 已失敗 ${config.maxAttempts} 次。最後的錯誤：\n\n${store.value!.lastError ?? ''}`);
  return { kind: 'stopped' };
}
