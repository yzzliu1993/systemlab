import { HandoffStore, type Handoff } from './handoff';
import { LABELS, type Ticket } from './linear/client';
import { log } from './log';
import { stopForHuman, TicketCanceledError, type Deps, type StageContext } from './stages/common';
import { implement } from './stages/implement';
import { HARNESS_REVIEW_PREFIX, review } from './stages/review';
import { updateBranch } from './stages/updateBranch';
import { branchNameFor, checkTicket } from './ticket';

export type StartDecision =
  | { start: 'implement' | 'review' | 'update_branch' | 'finalize' | 'human_rejected' }
  | { start: 'skip'; reason: string };

/** 依票的狀態、標籤與 handoff 紀錄決定從哪個階段開始（HARNESS_SPEC §3.1、§6.2）。 */
export function decideStart(
  ticket: Pick<Ticket, 'stateName' | 'labelNames'>,
  handoff?: Pick<Handoff, 'stage'>,
): StartDecision {
  const hasLabel = (name: string) => ticket.labelNames.includes(name);
  const closed = ticket.stateName === 'Done' || ticket.stateName === 'Canceled';
  if (closed && (hasLabel(LABELS.awaitingMerge) || hasLabel(LABELS.working) || handoff?.stage === 'awaiting_merge')) {
    return { start: 'finalize' };
  }
  if (hasLabel(LABELS.needsHuman)) {
    return { start: 'skip', reason: `有 ${LABELS.needsHuman} 標籤，處理完後移除標籤即可重新執行` };
  }
  if (hasLabel(LABELS.awaitingMerge)) return { start: 'skip', reason: '已通過 review，等待人工 merge' };
  switch (ticket.stateName) {
    case 'Todo':
    case 'In Progress':
      return { start: 'implement' };
    case 'In Review':
      // 等 merge 時人移除了 awaiting-merge 標籤：視為人工退件（HARNESS_SPEC §5）。
      if (handoff?.stage === 'awaiting_merge') return { start: 'human_rejected' };
      return { start: handoff?.stage === 'update_branch' ? 'update_branch' : 'review' };
    default:
      return { start: 'skip', reason: `狀態為 ${ticket.stateName}，只處理 Todo、In Progress、In Review` };
  }
}

export type PipelineResult = 'awaiting_merge' | 'stopped' | 'skipped' | 'finalized' | 'canceled';

/** Merge 或取消後收尾：移除標籤，handoff 改寫為最終狀態。 */
async function finalize(deps: Deps, ticket: Ticket, store: HandoffStore): Promise<void> {
  await deps.linear.removeLabel(ticket, LABELS.awaitingMerge);
  await deps.linear.removeLabel(ticket, LABELS.working);
  if (store.value) {
    await store.save({ stage: 'done', inFlight: undefined, nextStep: ticket.stateName === 'Canceled' ? '票已取消，分支保留' : '—' });
  }
  log({ ticket: ticket.identifier, event: 'state_change', status: `${ticket.stateName}（收尾完成）` });
}

/** 人移除 awaiting-merge：把 PR 上的人工意見當作退件意見交給 Implement。 */
async function takeHumanRejection(ctx: StageContext): Promise<'implement' | 'stopped'> {
  const { deps, store } = ctx;
  const prUrl = store.value!.prUrl!;
  const comments = await deps.github.humanFeedback(prUrl, HARNESS_REVIEW_PREFIX);
  if (comments.length === 0) {
    await stopForHuman(ctx, 'review', `偵測到 \`${LABELS.awaitingMerge}\` 被移除（人工退件），但 PR 上沒有人工留言。請在 ${prUrl} 留下要修改的地方後移除 \`${LABELS.needsHuman}\`。`);
    return 'stopped';
  }
  const rejections = store.value!.rejections + 1;
  await store.save({
    rejections,
    feedback: `人工 review 退件，PR 上的意見如下（以這些為準，優先於先前的 harness review）：\n\n${comments.map((c) => `- ${c}`).join('\n')}`,
    mustChangeFrom: (await deps.github.pullRequestState(prUrl)).headSha,
  });
  log({ ticket: ctx.ticket.identifier, event: 'review_result', stage: 'review', status: 'human_rejected', round: rejections });
  return 'implement';
}

/**
 * 一張票的完整流程：Implement ⇄ Review（退件迴圈）→ 更新分支 + CI → awaiting-merge。
 * 進度與計數存在 Linear 的 handoff 留言，中斷後重新執行會從紀錄的階段接續。
 */
export async function runTicket(deps: Deps, identifier: string): Promise<PipelineResult> {
  const { config, linear, github } = deps;
  const ticket = await linear.getTicket(identifier);
  const id = ticket.identifier;
  const store = new HandoffStore(linear, ticket);
  const previous = await store.load();

  const decision = decideStart(ticket, previous);
  if (decision.start === 'skip') {
    console.log(`${id}：略過（${decision.reason}）`);
    return 'skipped';
  }
  if (decision.start === 'finalize') {
    await finalize(deps, ticket, store);
    return 'finalized';
  }

  const ctx: StageContext = { deps, ticket, store };
  const check = checkTicket(ticket.description);
  if (!check.ok) {
    await store.init(branchFor(deps, ticket));
    await stopForHuman(ctx, 'implement', `票券格式不完整（HARNESS_SPEC §2.3），缺少：${check.missing.join('、')}`);
    return 'stopped';
  }

  const handoff = await store.init(previous?.branch ?? branchFor(deps, ticket));
  if (handoff.stoppedForHuman) {
    // 人移除了 needs-human：依 HARNESS_SPEC §7 失敗次數歸零後接續。
    await store.save({ stoppedForHuman: false, attempt: 0, rejections: 0, fixRounds: 0 });
    log({ ticket: id, event: 'resume', status: '人工處理後重新開始，失敗次數歸零' });
  } else if (previous) {
    log({ ticket: id, event: 'resume', stage: previous.stage, status: `從 handoff 接續（${previous.nextStep || previous.stage}）` });
  }

  store.startHeartbeat();
  try {
    let stage: 'implement' | 'review' | 'update_branch' = decision.start === 'human_rejected' ? 'implement' : decision.start;
    if (decision.start !== 'implement' && !store.value!.prUrl) {
      const prUrl = await github.findOpenPullRequest(store.value!.branch);
      if (!prUrl) {
        await stopForHuman(ctx, 'review', `票在 In Review，但分支 \`${store.value!.branch}\` 沒有開著的 PR。`);
        return 'stopped';
      }
      await store.save({ prUrl });
    }
    if (decision.start === 'human_rejected' && (await takeHumanRejection(ctx)) === 'stopped') return 'stopped';

    for (;;) {
      if (stage === 'implement') {
        const result = await implement(ctx);
        if (result.kind === 'stopped') return 'stopped';
        stage = 'review';
      }

      if (stage === 'review') {
        await linear.addLabel(ticket, LABELS.working);
        const reviewed = await review(ctx);
        if (reviewed.kind === 'stopped') return 'stopped';
        if (reviewed.kind === 'changes_requested') {
          const rejections = store.value!.rejections + 1;
          await store.save({ rejections });
          if (rejections >= config.maxReviewRounds) {
            await stopForHuman(ctx, 'review', `Review 已退件 ${rejections} 次，最後一次的意見：\n\n${reviewed.summary}`);
            return 'stopped';
          }
          await store.save({
            feedback: `Review 退件（第 ${rejections} 次），意見如下：\n\n${reviewed.summary}`,
            mustChangeFrom: (await github.pullRequestState(store.value!.prUrl!)).headSha,
          });
          stage = 'implement';
          continue;
        }
        stage = 'update_branch';
      }

      const updated = await updateBranch(ctx);
      if (updated.kind === 'needs_fix') {
        const fixRounds = store.value!.fixRounds + 1;
        await store.save({ fixRounds });
        if (fixRounds >= config.maxReviewRounds) {
          await stopForHuman(ctx, 'update_branch', `更新分支後已修正 ${fixRounds} 次仍未通過：\n\n${updated.feedback}`);
          return 'stopped';
        }
        await store.save({
          feedback: updated.feedback,
          mustChangeFrom: (await github.pullRequestState(store.value!.prUrl!)).headSha,
        });
        stage = 'implement';
        continue;
      }

      const prUrl = store.value!.prUrl!;
      await linear.setState(ticket, 'In Review');
      await linear.removeLabel(ticket, LABELS.working);
      await linear.addLabel(ticket, LABELS.awaitingMerge);
      await store.save({ stage: 'awaiting_merge', lastCommit: updated.sha, inFlight: undefined, nextStep: '等待人工 merge' });
      await linear.comment(ticket, `✅ **Review 通過，CI 綠燈，等待你 merge**\n\nPR：${prUrl}\n\n${store.value!.lastReview ?? ''}`);
      await linear.assignToMe(ticket);
      log({ ticket: id, event: 'awaiting_merge', pr: prUrl, sha: updated.sha });
      return 'awaiting_merge';
    }
  } catch (err) {
    if (!(err instanceof TicketCanceledError)) throw err;
    // 票被取消：agent 已終止，保留分支與 handoff，移除認領鎖（HARNESS_SPEC §3.5）。
    log({ ticket: id, event: 'state_change', status: 'Canceled，已終止 agent' });
    await finalize(deps, await linear.getTicket(id), store);
    return 'canceled';
  } finally {
    store.stopHeartbeat();
  }
}

function branchFor(deps: Deps, ticket: Ticket): string {
  const { config } = deps;
  return branchNameFor(ticket.identifier, ticket.branchName, ticket.labelNames, config.branchTypeByLabel, config.defaultBranchType);
}
