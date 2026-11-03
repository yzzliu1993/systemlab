import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Config } from '../config';
import { runClaudeWithResultFix, type ClaudeRunOptions, type ClaudeRunOutcome } from '../agents/runClaude';
import { BACKOFF_MS, classifyFailure, parseQuotaReset } from '../failures';
import type { GitHub } from '../github/client';
import type { HandoffStage, HandoffStore } from '../handoff';
import { LABELS, type Linear, type Ticket } from '../linear/client';
import { log } from '../log';

export interface Deps {
  config: Config;
  linear: Linear;
  github: GitHub;
}

/** 處理單張票時各階段共用的狀態。 */
export interface StageContext {
  deps: Deps;
  ticket: Ticket;
  store: HandoffStore;
}

export type Stage = 'implement' | 'review' | 'update_branch';

export function describeFailure(outcome: Exclude<ClaudeRunOutcome, { kind: 'ok' }>): string {
  return outcome.kind === 'timeout' ? 'agent 執行逾時' : outcome.error;
}

/** 記錄一次 agent 執行的結果（成功或失敗都記）。 */
export function logAgentEnd(
  ticket: string,
  stage: Stage,
  attempt: number,
  startedAt: number,
  outcome: ClaudeRunOutcome,
): void {
  const durationSec = Math.round((Date.now() - startedAt) / 1000);
  if (outcome.kind === 'ok') {
    log({
      ticket, event: 'agent_end', stage, attempt, status: outcome.result.status, durationSec,
      turns: outcome.output.num_turns, sessionId: outcome.output.session_id, summary: outcome.result.summary,
    });
    return;
  }
  log({
    ticket, event: 'agent_end', stage, attempt, status: 'failed', durationSec,
    turns: 'output' in outcome ? outcome.output?.num_turns : undefined,
    sessionId: 'output' in outcome ? outcome.output?.session_id : undefined,
    error: describeFailure(outcome),
  });
}

/** 停止處理此票並交給人（HARNESS_SPEC §7）。 */
export async function stopForHuman(ctx: StageContext, stage: Stage, reason: string): Promise<void> {
  const { deps, ticket, store } = ctx;
  await store.save({ stoppedForHuman: true, lastError: reason, inFlight: undefined, nextStep: '等待人工處理' });
  await deps.linear.removeLabel(ticket, LABELS.working);
  await deps.linear.addLabel(ticket, LABELS.needsHuman);
  await deps.linear.comment(ticket, `🛑 **Harness 已停止處理此票，需要人工介入**\n\n${reason}\n\n處理完後移除 \`${LABELS.needsHuman}\` 標籤並重新執行，失敗次數會歸零。`);
  await deps.linear.assignToMe(ticket);
  log({ ticket: ticket.identifier, event: 'circuit_break', stage, error: reason });
}

function resumePrompt(reason: string): string {
  return [
    `（harness）你先前的執行被中斷了，原因：${reason}。`,
    '請先確認目前的進度（例如 `git status`、`git log`），從中斷的地方繼續完成原本的任務，',
    '不要重做已完成的部分。最後依原本要求的格式輸出結果 JSON。',
  ].join('\n');
}

/** 暫時性錯誤（API 過載、網路）不計入失敗次數的重試上限。 */
const MAX_TRANSIENT_RETRIES = BACKOFF_MS.length;

/**
 * 執行 agent 並處理外部因素（HARNESS_SPEC §6.4）：
 * - 執行前把 session id 寫進 handoff，程式被中斷時下次能以同一個 session 接續
 * - 額度用完：暫停到重置時間後接續同一個 session
 * - 暫時性錯誤：退避後接續同一個 session
 * 以上都不計入失敗次數。回傳的 outcome 只剩「成功」或「需要計入失敗」的結果。
 */
export async function runAgent(
  ctx: StageContext,
  stage: Stage,
  attempt: number,
  options: Omit<ClaudeRunOptions, 'sessionId' | 'resumeSessionId'>,
  resume?: { sessionId: string; reason: string },
): Promise<ClaudeRunOutcome> {
  const { deps, ticket, store } = ctx;
  const id = ticket.identifier;
  let sessionId = resume?.sessionId ?? randomUUID();
  let resumeReason = resume?.reason;
  let transientRetries = 0;

  for (;;) {
    await store.save({ inFlight: { stage: stage as HandoffStage, sessionId, startedAt: new Date().toISOString() } });
    log({ ticket: id, event: resumeReason ? 'resume' : 'agent_start', stage, attempt, sessionId, status: resumeReason });
    const startedAt = Date.now();
    const outcome = await runClaudeWithResultFix(deps.config, resumeReason
      ? { ...options, prompt: resumePrompt(resumeReason), resumeSessionId: sessionId }
      : { ...options, sessionId });
    logAgentEnd(id, stage, attempt, startedAt, outcome);
    if (outcome.kind === 'ok' && outcome.output.session_id) sessionId = outcome.output.session_id;

    if (outcome.kind === 'failed') {
      const kind = classifyFailure(outcome.error);
      if (kind === 'quota') {
        const resetAt = parseQuotaReset(outcome.error, new Date());
        log({ ticket: id, event: 'quota_pause', stage, attempt, status: `暫停到 ${resetAt.toLocaleString()}`, error: outcome.error });
        console.log(`Claude 額度已用完，暫停到 ${resetAt.toLocaleString()} 後自動繼續（Ctrl+C 可中止，之後重新執行會接續）`);
        await store.save({ lastError: `額度用完，暫停到 ${resetAt.toLocaleString()}`, nextStep: '額度重置後接續' });
        await sleep(Math.max(0, resetAt.getTime() - Date.now()));
        resumeReason = 'Claude 額度用完，已重置';
        continue;
      }
      if (kind === 'transient' && transientRetries < MAX_TRANSIENT_RETRIES) {
        const delay = BACKOFF_MS[transientRetries++];
        log({ ticket: id, event: 'error', stage, attempt, status: `暫時性錯誤，${delay / 60_000} 分鐘後重試`, error: outcome.error });
        await sleep(delay);
        resumeReason = '暫時性錯誤（API 過載或網路問題）';
        continue;
      }
    }

    await store.save({ inFlight: undefined });
    return outcome;
  }
}
