import type { Config } from '../config';
import type { ClaudeRunOutcome } from '../agents/runClaude';
import type { GitHub } from '../github/client';
import { LABELS, type Linear, type Ticket } from '../linear/client';
import { log } from '../log';

export interface Deps {
  config: Config;
  linear: Linear;
  github: GitHub;
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
export async function stopForHuman(deps: Deps, ticket: Ticket, stage: Stage, reason: string): Promise<void> {
  await deps.linear.removeLabel(ticket, LABELS.working);
  await deps.linear.addLabel(ticket, LABELS.needsHuman);
  await deps.linear.comment(ticket, `🛑 **Harness 已停止處理此票，需要人工介入**\n\n${reason}`);
  await deps.linear.assignToMe(ticket);
  log({ ticket: ticket.identifier, event: 'circuit_break', stage, error: reason });
}
