import { LABELS, type Ticket } from './linear/client';
import { log } from './log';
import { stopForHuman, type Deps } from './stages/common';
import { implement } from './stages/implement';
import { review } from './stages/review';
import { updateBranch } from './stages/updateBranch';
import { branchNameFor, checkTicket } from './ticket';

export type StartDecision = { start: 'implement' | 'review' } | { start: 'skip'; reason: string };

/** 依票的目前狀態與標籤決定從哪個階段開始（HARNESS_SPEC §3.1）。 */
export function decideStart(ticket: Pick<Ticket, 'stateName' | 'labelNames'>): StartDecision {
  if (ticket.labelNames.includes(LABELS.needsHuman)) {
    return { start: 'skip', reason: `有 ${LABELS.needsHuman} 標籤，處理完後移除標籤即可重新執行` };
  }
  if (ticket.labelNames.includes(LABELS.awaitingMerge)) {
    return { start: 'skip', reason: '已通過 review，等待人工 merge' };
  }
  switch (ticket.stateName) {
    case 'Todo':
    case 'In Progress':
      return { start: 'implement' };
    case 'In Review':
      return { start: 'review' };
    default:
      return { start: 'skip', reason: `狀態為 ${ticket.stateName}，只處理 Todo、In Progress、In Review` };
  }
}

export type PipelineResult = 'awaiting_merge' | 'stopped' | 'skipped';

/**
 * 一張票的完整流程：Implement ⇄ Review（退件迴圈）→ 更新分支 + CI → awaiting-merge。
 * 退件與「更新分支後需要修正」各自最多 maxReviewRounds 次。
 */
export async function runTicket(deps: Deps, identifier: string): Promise<PipelineResult> {
  const { config, linear, github } = deps;
  const ticket = await linear.getTicket(identifier);
  const id = ticket.identifier;

  const decision = decideStart(ticket);
  if (decision.start === 'skip') {
    console.log(`${id}：略過（${decision.reason}）`);
    return 'skipped';
  }

  const check = checkTicket(ticket.description);
  if (!check.ok) {
    await stopForHuman(deps, ticket, 'implement', `票券格式不完整（HARNESS_SPEC §2.3），缺少：${check.missing.join('、')}`);
    return 'stopped';
  }

  const branch = branchNameFor(id, ticket.branchName, ticket.labelNames, config.branchTypeByLabel, config.defaultBranchType);
  let prUrl = decision.start === 'review' ? await github.findOpenPullRequest(branch) : undefined;
  if (decision.start === 'review' && !prUrl) {
    await stopForHuman(deps, ticket, 'review', `票在 In Review，但分支 \`${branch}\` 沒有開著的 PR。`);
    return 'stopped';
  }

  let stage: 'implement' | 'review' = decision.start;
  let feedback: string | undefined;
  let mustChangeFrom: string | undefined;
  let previousReview: string | undefined;
  let rejections = 0;
  let fixRounds = 0;

  for (;;) {
    if (stage === 'implement') {
      const result = await implement(deps, ticket, { branch, feedback, mustChangeFrom });
      if (result.kind === 'stopped') return 'stopped';
      prUrl = result.prUrl;
    }
    if (!prUrl) throw new Error('內部錯誤：進入 review 時沒有 PR');

    await linear.addLabel(ticket, LABELS.working);
    const reviewed = await review(deps, ticket, { branch, prUrl, round: rejections + 1, previousReview });
    if (reviewed.kind === 'stopped') return 'stopped';

    if (reviewed.kind === 'changes_requested') {
      rejections++;
      if (rejections >= config.maxReviewRounds) {
        await stopForHuman(deps, ticket, 'review', `Review 已退件 ${rejections} 次，最後一次的意見：\n\n${reviewed.summary}`);
        return 'stopped';
      }
      previousReview = reviewed.summary;
      feedback = `Review 退件（第 ${rejections} 次），意見如下：\n\n${reviewed.summary}`;
      mustChangeFrom = (await github.pullRequestState(prUrl)).headSha;
      stage = 'implement';
      continue;
    }

    const updated = await updateBranch(deps, ticket, prUrl);
    if (updated.kind === 'needs_fix') {
      fixRounds++;
      if (fixRounds >= config.maxReviewRounds) {
        await stopForHuman(deps, ticket, 'update_branch', `更新分支後已修正 ${fixRounds} 次仍未通過：\n\n${updated.feedback}`);
        return 'stopped';
      }
      feedback = updated.feedback;
      mustChangeFrom = (await github.pullRequestState(prUrl)).headSha;
      previousReview = reviewed.summary;
      stage = 'implement';
      continue;
    }

    await linear.setState(ticket, 'In Review');
    await linear.removeLabel(ticket, LABELS.working);
    await linear.addLabel(ticket, LABELS.awaitingMerge);
    await linear.comment(ticket, `✅ **Review 通過，CI 綠燈，等待你 merge**\n\nPR：${prUrl}\n\n${reviewed.summary}`);
    await linear.assignToMe(ticket);
    log({ ticket: id, event: 'awaiting_merge', pr: prUrl, sha: updated.sha });
    return 'awaiting_merge';
  }
}
