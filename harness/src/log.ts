import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './config';

export type LogEvent =
  | 'claim'
  | 'agent_start'
  | 'agent_end'
  | 'ci_result'
  | 'state_change'
  | 'error'
  | 'circuit_break'
  | 'quota_pause'
  | 'resume'
  | 'pr_created'
  | 'review_result'
  | 'branch_update'
  | 'awaiting_merge';

export interface LogEntry {
  ticket: string;
  event: LogEvent;
  stage?: string;
  attempt?: number;
  [key: string]: unknown;
}

const LOG_DIR = path.join(REPO_ROOT, '.harness', 'logs');
const MAX_FIELD_LENGTH = 20_000;

/** `.harness/logs/YYYY-MM-DD.jsonl`，以本機日期分檔。 */
export function logFileFor(date: Date, dir = LOG_DIR): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return path.join(dir, `${y}-${m}-${d}.jsonl`);
}

/** 保留尾端：錯誤訊息通常在 log 最後面。 */
export function truncate(value: string, max = MAX_FIELD_LENGTH): string {
  return value.length <= max ? value : `…(截斷 ${value.length - max} 字)\n${value.slice(-max)}`;
}

export function log(entry: LogEntry): void {
  const now = new Date();
  const record = Object.fromEntries(
    Object.entries({ ts: now.toISOString(), ...entry }).map(([k, v]) => [
      k,
      typeof v === 'string' ? truncate(v) : v,
    ]),
  );
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(logFileFor(now), `${JSON.stringify(record)}\n`);
  const detail = entry.status ?? entry.error ?? '';
  console.log(`[${now.toLocaleTimeString()}] ${entry.ticket} ${entry.event}${entry.stage ? ` ${entry.stage}` : ''} ${String(detail).split('\n')[0]}`);
}
