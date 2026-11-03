import { setTimeout as defaultSleep } from 'node:timers/promises';

/** 失敗分類（HARNESS_SPEC §6.4）。 */
export type FailureKind = 'quota' | 'transient' | 'deterministic';

const QUOTA_PATTERN = /usage limit|limit reached|hit your (?:usage )?limit|out of (?:extra )?usage|weekly limit|5-hour limit/i;
const TRANSIENT_PATTERN =
  /overloaded|\b(?:429|500|502|503|504|529)\b|rate.?limit|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|fetch failed|network|timed? ?out|temporarily unavailable|internal server error|bad gateway|service unavailable/i;

export function classifyFailure(message: string): FailureKind {
  if (QUOTA_PATTERN.test(message)) return 'quota';
  if (TRANSIENT_PATTERN.test(message)) return 'transient';
  return 'deterministic';
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** 解析不到重置時間時的預設暫停長度。 */
export const QUOTA_FALLBACK_MS = 30 * 60_000;
/** 重置後多等一分鐘，避免剛好卡在邊界。 */
const QUOTA_BUFFER_MS = 60_000;

/**
 * 從用量上限訊息解析重置時間。支援的格式：
 * - `...usage limit reached|1793750400`（Unix 秒）
 * - `...resets 3pm`、`resets at 3:30 pm`、`resets Nov 6, 3pm`（本機時間）
 * 解析不到時回傳 now + 30 分鐘。
 */
export function parseQuotaReset(message: string, now: Date): Date {
  const unix = /\|(\d{10})\b/.exec(message);
  if (unix) return new Date(Number(unix[1]) * 1000 + QUOTA_BUFFER_MS);

  const match = /resets?\s+(?:at\s+)?(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(message);
  if (!match) return new Date(now.getTime() + QUOTA_FALLBACK_MS);

  const [, monthName, day, hourText, minuteText, meridiem] = match;
  let hour = Number(hourText) % 12;
  if (meridiem.toLowerCase() === 'pm') hour += 12;
  const reset = new Date(now);
  reset.setHours(hour, Number(minuteText ?? 0), 0, 0);

  const month = monthName ? MONTHS.indexOf(monthName.toLowerCase()) : -1;
  if (month >= 0) {
    reset.setMonth(month, Number(day));
    if (reset.getTime() < now.getTime()) reset.setFullYear(reset.getFullYear() + 1);
  } else if (reset.getTime() <= now.getTime()) {
    reset.setDate(reset.getDate() + 1);
  }
  return new Date(reset.getTime() + QUOTA_BUFFER_MS);
}

/** 暫時性錯誤的退避間隔：1 → 2 → 4 → 8 → 16 分鐘（HARNESS_SPEC §6.4）。 */
export const BACKOFF_MS = [1, 2, 4, 8, 16].map((m) => m * 60_000);

export interface RetryOptions {
  delaysMs?: number[];
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<unknown>;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 暫時性錯誤以退避重試；其他錯誤直接拋出。 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const delays = options.delaysMs ?? BACKOFF_MS;
  const isRetryable = options.isRetryable ?? ((err) => classifyFailure(errorMessage(err)) === 'transient');
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= delays.length || !isRetryable(err)) throw err;
      options.onRetry?.(err, attempt + 1, delays[attempt]);
      await sleep(delays[attempt]);
    }
  }
}
