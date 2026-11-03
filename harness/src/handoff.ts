import { z } from 'zod';
import { errorMessage } from './failures';
import type { Linear, Ticket } from './linear/client';

/** Handoff 紀錄（HARNESS_SPEC §6.1）。權威來源是 Linear 上的單一留言。 */
export const HANDOFF_MARKER = '<!-- harness:handoff -->';

const StageSchema = z.enum(['decompose', 'implement', 'review', 'update_branch', 'awaiting_merge', 'done']);
export type HandoffStage = z.infer<typeof StageSchema>;

export const HandoffSchema = z.object({
  version: z.literal(1),
  // 位置
  branch: z.string(),
  prUrl: z.string().optional(),
  lastCommit: z.string().optional(),
  // 進度
  stage: StageSchema,
  done: z.array(z.string()).default([]),
  nextStep: z.string().default(''),
  /** 已 push、等待 CI 的 commit；接續時直接等 CI，不重跑 agent。 */
  pendingCiSha: z.string().optional(),
  /** 重工原因（review 退件意見、衝突說明），Implement 成功後清除。 */
  feedback: z.string().optional(),
  /** 上一次 Implement 嘗試失敗的完整原因（CI log、agent 錯誤），交給下一次嘗試。 */
  lastFailure: z.string().optional(),
  /** 重工時遠端分支不可停留在這個 SHA。 */
  mustChangeFrom: z.string().optional(),
  lastReview: z.string().optional(),
  // 錯誤與計數（熔斷依據，跨執行累計）
  attempt: z.number().int().nonnegative().default(0),
  rejections: z.number().int().nonnegative().default(0),
  fixRounds: z.number().int().nonnegative().default(0),
  lastError: z.string().optional(),
  errorHistory: z.array(z.string()).default([]),
  stoppedForHuman: z.boolean().default(false),
  // 接續
  inFlight: z.object({ stage: StageSchema, sessionId: z.string(), startedAt: z.string() }).optional(),
  heartbeat: z.string(),
});

export type Handoff = z.infer<typeof HandoffSchema>;

const ERROR_SUMMARY_MAX = 200;
const ERROR_HISTORY_MAX = 5;
const LONG_TEXT_MAX = 4_000;

export function summarizeError(message: string): string {
  const oneLine = message.replace(/\s+/g, ' ').trim();
  return oneLine.length > ERROR_SUMMARY_MAX ? `${oneLine.slice(0, ERROR_SUMMARY_MAX - 1)}…` : oneLine;
}

function clip(text: string | undefined): string | undefined {
  if (text === undefined || text.length <= LONG_TEXT_MAX) return text;
  return `…(前段省略，完整內容見本機 log)\n${text.slice(-LONG_TEXT_MAX)}`;
}

const STAGE_LABEL: Record<HandoffStage, string> = {
  decompose: '拆解',
  implement: '實作',
  review: 'Review',
  update_branch: '更新分支 / CI',
  awaiting_merge: '等待 merge',
  done: '完成',
};

/** 轉成 Linear 留言：上半部給人看，下半部的 JSON 給 orchestrator 讀。 */
export function renderHandoff(h: Handoff): string {
  const rows = [
    ['階段', STAGE_LABEL[h.stage] + (h.inFlight ? `（執行中，session \`${h.inFlight.sessionId}\`）` : '')],
    ['分支', h.branch ? `\`${h.branch}\`` : '—'],
    ['PR', h.prUrl ?? '—'],
    ['最後 commit', h.lastCommit ? `\`${h.lastCommit.slice(0, 7)}\`` : '—'],
    ['本階段失敗次數', String(h.attempt)],
    ['Review 退件 / 更新分支修正', `${h.rejections} / ${h.fixRounds}`],
    ['下一步', h.nextStep || '—'],
    ['最近錯誤', h.lastError ?? '—'],
    ['最後更新', h.heartbeat],
  ];
  const table = ['| 項目 | 內容 |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v.replace(/\|/g, '\\|')} |`)];
  return [
    HANDOFF_MARKER,
    '### 🤖 Harness handoff',
    '',
    ...table,
    '',
    '機器讀取用（請勿編輯）：',
    '```json',
    JSON.stringify(h, null, 2),
    '```',
  ].join('\n');
}

/** 從留言內容取回 handoff；不是 handoff 留言或內容損毀時回傳 undefined。 */
export function parseHandoff(body: string): Handoff | undefined {
  if (!body.startsWith(HANDOFF_MARKER)) return undefined;
  const json = /```json\s*([\s\S]*?)```/.exec(body)?.[1];
  if (!json) return undefined;
  try {
    const parsed = HandoffSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** 套用更新並維護長度上限與錯誤歷程。 */
export function applyPatch(current: Handoff, patch: Partial<Handoff>, now: Date): Handoff {
  const next: Handoff = { ...current, ...patch, heartbeat: now.toISOString() };
  if (patch.lastError !== undefined && patch.lastError !== current.lastError) {
    next.lastError = summarizeError(patch.lastError);
    next.errorHistory = [...current.errorHistory, `${now.toISOString()} ${next.lastError}`].slice(-ERROR_HISTORY_MAX);
  }
  next.feedback = clip(next.feedback);
  next.lastFailure = clip(next.lastFailure);
  next.lastReview = clip(next.lastReview);
  return next;
}

export function initialHandoff(branch: string, now: Date): Handoff {
  return HandoffSchema.parse({ version: 1, branch, stage: 'implement', heartbeat: now.toISOString() });
}

/** 讀寫某張票的 handoff 留言；寫入依序執行，避免 heartbeat 與一般更新互相覆蓋。 */
export class HandoffStore {
  private readonly linear: Linear;
  private readonly ticket: Ticket;
  private commentId: string | undefined;
  private current: Handoff | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(linear: Linear, ticket: Ticket) {
    this.linear = linear;
    this.ticket = ticket;
  }

  get value(): Handoff | undefined {
    return this.current;
  }

  async load(): Promise<Handoff | undefined> {
    for (const comment of await this.linear.listComments(this.ticket)) {
      const parsed = parseHandoff(comment.body);
      if (parsed) {
        this.commentId = comment.id;
        this.current = parsed;
        return parsed;
      }
    }
    return undefined;
  }

  /** 沒有紀錄時以 branch 建立初始紀錄。 */
  async init(branch: string): Promise<Handoff> {
    if (!this.current) {
      this.current = initialHandoff(branch, new Date());
      await this.write();
    }
    return this.current;
  }

  save(patch: Partial<Handoff>): Promise<void> {
    if (!this.current) throw new Error('handoff 尚未初始化');
    this.current = applyPatch(this.current, patch, new Date());
    return this.write();
  }

  private write(): Promise<void> {
    const body = renderHandoff(this.current!);
    const task = this.queue.then(async () => {
      if (this.commentId) await this.linear.updateComment(this.commentId, body);
      else this.commentId = await this.linear.comment(this.ticket, body);
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  startHeartbeat(intervalMs = 5 * 60_000): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.current) {
        this.save({}).catch((err: unknown) => console.warn(`heartbeat 更新失敗：${errorMessage(err)}`));
      }
    }, intervalMs);
    this.heartbeatTimer.unref();
  }

  stopHeartbeat(): void {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }
}
