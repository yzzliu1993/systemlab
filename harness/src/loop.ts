import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { REPO_ROOT } from './config';
import { errorMessage } from './failures';
import { HandoffStore } from './handoff';
import { LABELS } from './linear/client';
import { log } from './log';
import { runTicket } from './pipeline';
import { pickNext, withinActiveHours, type NextAction } from './scheduler';
import type { Deps } from './stages/common';
import { decompose } from './stages/decompose';

const HARNESS_STATE_DIR = path.join(REPO_ROOT, '.harness');
export const PAUSE_FILE = path.join(HARNESS_STATE_DIR, 'PAUSE');
const LOCK_FILE = path.join(HARNESS_STATE_DIR, 'orchestrator.lock');
/** 同一張票連續發生非預期錯誤幾次後交給人，避免每次輪詢都重試同一個壞掉的票。 */
const MAX_CONSECUTIVE_ERRORS = 3;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 同時只能有一個 orchestrator（HARNESS_SPEC §3.1：v1 一次一張票）。 */
export function acquireLock(): () => void {
  mkdirSync(HARNESS_STATE_DIR, { recursive: true });
  if (existsSync(LOCK_FILE)) {
    const pid = Number(readFileSync(LOCK_FILE, 'utf8'));
    if (pid && pid !== process.pid && isAlive(pid)) {
      throw new Error(`已有 orchestrator 在執行（pid ${pid}）。若確定沒有，刪除 ${LOCK_FILE} 後重試。`);
    }
  }
  writeFileSync(LOCK_FILE, String(process.pid));
  return () => rmSync(LOCK_FILE, { force: true });
}

/** 判斷 In Review 的票是否由 harness 處理過；人自己開 PR 的票沒有 handoff，不應被接手。 */
async function isHarnessTicket(deps: Deps, identifier: string): Promise<boolean> {
  const ticket = await deps.linear.getTicket(identifier);
  return (await new HandoffStore(deps.linear, ticket).load()) !== undefined;
}

/** 收尾：已 Done / Canceled 但還留著 harness 標籤的票。 */
async function finalizeClosed(deps: Deps): Promise<void> {
  for (const t of await deps.linear.listClosedWithHarnessLabels()) {
    await runTicket(deps, t.identifier);
  }
}

/** 選出下一個動作；In Review 但沒有認領鎖的票需確認是 harness 的票。 */
export async function planNext(deps: Deps, ignore: Set<string>): Promise<NextAction | undefined> {
  const tickets = await deps.linear.listOpenTickets();
  const graceMs = deps.config.decomposeGraceMinutes * 60_000;
  for (;;) {
    const next = pickNext(tickets, new Date(), graceMs, ignore);
    if (!next) return undefined;
    const summary = tickets.find((t) => t.identifier === next.identifier)!;
    const needsCheck = summary.stateName === 'In Review' && !summary.labelNames.includes(LABELS.working);
    if (!needsCheck || (await isHarnessTicket(deps, next.identifier))) return next;
    ignore.add(next.identifier);
  }
}

async function execute(deps: Deps, next: NextAction): Promise<string> {
  return next.kind === 'decompose' ? decompose(deps, next.identifier) : runTicket(deps, next.identifier);
}

/**
 * 常駐輪詢（HARNESS_SPEC §10 Phase 4）。每輪：
 * 收尾已關閉的票 → 檢查暫停與執行時段 → 選一張票處理到底 → 有做事就立刻下一輪，否則等待 pollSeconds。
 */
export async function runLoop(deps: Deps, shouldStop: () => boolean): Promise<void> {
  const release = acquireLock();
  const errorCounts = new Map<string, number>();
  // 人自己開 PR 的 In Review 票：每次重啟 orchestrator 才重新檢查。
  const ignore = new Set<string>();
  let idleReason = '';
  const idle = (reason: string) => {
    if (reason !== idleReason) console.log(`[${new Date().toLocaleTimeString()}] ${reason}`);
    idleReason = reason;
  };

  console.log(`Harness 開始輪詢（每 ${deps.config.pollSeconds} 秒）。建立 ${PAUSE_FILE} 可暫停，Ctrl+C 結束。`);
  try {
    while (!shouldStop()) {
      let worked = false;
      try {
        await finalizeClosed(deps);
        if (existsSync(PAUSE_FILE)) {
          idle('已暫停（.harness/PAUSE 存在），不認領新票');
        } else if (!withinActiveHours(deps.config.activeHours, new Date())) {
          idle(`不在執行時段（${deps.config.activeHours}），等待中`);
        } else {
          const next = await planNext(deps, ignore);
          if (!next) {
            idle('沒有可處理的票，等待中');
          } else {
            idleReason = '';
            console.log(`[${new Date().toLocaleTimeString()}] 下一張：${next.identifier}（${next.reason}）`);
            try {
              const result = await execute(deps, next);
              console.log(`[${new Date().toLocaleTimeString()}] ${next.identifier}：${result}`);
              errorCounts.delete(next.identifier);
              worked = true;
            } catch (err) {
              const count = (errorCounts.get(next.identifier) ?? 0) + 1;
              errorCounts.set(next.identifier, count);
              log({ ticket: next.identifier, event: 'error', status: `非預期錯誤（連續第 ${count} 次）`, error: errorMessage(err) });
              if (count >= MAX_CONSECUTIVE_ERRORS) await giveUp(deps, next.identifier, err);
            }
          }
        }
      } catch (err) {
        // 輪詢本身的錯誤（例如 Linear 暫時無法連線）：記錄後下一輪再試。
        console.error(`[${new Date().toLocaleTimeString()}] 輪詢失敗：${errorMessage(err)}`);
      }
      if (!worked) await sleep(deps.config.pollSeconds * 1000);
    }
  } finally {
    release();
  }
}

async function giveUp(deps: Deps, identifier: string, err: unknown): Promise<void> {
  const ticket = await deps.linear.getTicket(identifier);
  await deps.linear.removeLabel(ticket, LABELS.working);
  await deps.linear.addLabel(ticket, LABELS.needsHuman);
  await deps.linear.comment(ticket, `🛑 **Harness 處理此票時連續發生 ${MAX_CONSECUTIVE_ERRORS} 次非預期錯誤，已停止**\n\n\`\`\`\n${errorMessage(err)}\n\`\`\`\n\n處理完後移除 \`${LABELS.needsHuman}\` 標籤即可恢復。`);
  await deps.linear.assignToMe(ticket);
  log({ ticket: identifier, event: 'circuit_break', error: errorMessage(err) });
}
