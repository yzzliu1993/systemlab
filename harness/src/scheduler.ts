import { LABELS } from './linear/client';

/** 輪詢時每張票需要的資訊（一次 GraphQL 查詢取得）。 */
export interface TicketSummary {
  identifier: string;
  stateName: string;
  labelNames: string[];
  /** Linear priority：1 Urgent … 4 Low，0 為未設定。 */
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  /** 尚未完成（非 Done / Canceled）的 blocked-by 票數。 */
  openBlockers: number;
}

export type NextAction = { kind: 'run' | 'decompose'; identifier: string; reason: string };

/** 這些標籤代表「等人決定」，不自動處理（HARNESS_SPEC §8）。 */
const HUMAN_GATED = [LABELS.needsHuman, LABELS.agentProposed, LABELS.specNeeded, LABELS.draft];

const has = (t: TicketSummary, label: string) => t.labelNames.includes(label);
const gated = (t: TicketSummary) => HUMAN_GATED.some((l) => has(t, l));
const ACTIVE_STATES = ['Todo', 'In Progress', 'In Review'];

/** priority 1 最高、0（未設定）排最後；同 priority 舊的先（HARNESS_SPEC §3.3）。 */
function byPriorityThenAge(a: TicketSummary, b: TicketSummary): number {
  const rank = (p: number) => (p === 0 ? 5 : p);
  return rank(a.priority) - rank(b.priority) || a.createdAt.getTime() - b.createdAt.getTime();
}

const byAge = (a: TicketSummary, b: TicketSummary) => a.createdAt.getTime() - b.createdAt.getTime();

/**
 * 決定下一個要處理的票（HARNESS_SPEC §3.1）：
 * 1. 中斷的工作（有 agent:working）
 * 2. In Review 但還沒等 merge（待 review，或人移除 awaiting-merge 表示退件）
 * 3. Todo（相依票都完成）
 * 4. 人開的 Backlog 票，最後編輯已超過 graceMs → 拆解
 */
export function pickNext(
  tickets: TicketSummary[],
  now: Date,
  decomposeGraceMs: number,
  ignore: ReadonlySet<string> = new Set(),
): NextAction | undefined {
  tickets = tickets.filter((t) => !ignore.has(t.identifier));
  const interrupted = tickets.find((t) => has(t, LABELS.working) && !has(t, LABELS.needsHuman));
  if (interrupted) {
    return interrupted.stateName === 'Backlog'
      ? { kind: 'decompose', identifier: interrupted.identifier, reason: '接續中斷的拆解' }
      : ACTIVE_STATES.includes(interrupted.stateName)
        ? { kind: 'run', identifier: interrupted.identifier, reason: '接續中斷的工作' }
        : undefined;
  }

  const inReview = tickets
    .filter((t) => t.stateName === 'In Review' && !gated(t) && !has(t, LABELS.awaitingMerge))
    .sort(byPriorityThenAge)[0];
  if (inReview) return { kind: 'run', identifier: inReview.identifier, reason: 'In Review 等待 review 或人工退件' };

  // 只認領 Todo：沒有 agent:working 的 In Progress 是人自己在做的票。
  const todo = tickets
    .filter((t) => t.stateName === 'Todo' && !gated(t) && !has(t, LABELS.awaitingMerge) && t.openBlockers === 0)
    .sort(byPriorityThenAge)[0];
  if (todo) return { kind: 'run', identifier: todo.identifier, reason: `Todo（priority ${todo.priority || '未設定'}）` };

  const backlog = tickets
    .filter((t) => t.stateName === 'Backlog' && !gated(t) && !has(t, LABELS.decomposed))
    .filter((t) => now.getTime() - t.updatedAt.getTime() >= decomposeGraceMs)
    .sort(byAge)[0];
  if (backlog) return { kind: 'decompose', identifier: backlog.identifier, reason: 'Backlog 拆解' };

  return undefined;
}

/** `HH:MM-HH:MM`（可跨午夜）。未設定代表全天。 */
export function withinActiveHours(range: string | undefined, now: Date): boolean {
  if (!range) return true;
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(range);
  if (!match) throw new Error(`activeHours 格式錯誤：${range}（例：22:00-08:00）`);
  const [start, end] = [Number(match[1]) * 60 + Number(match[2]), Number(match[3]) * 60 + Number(match[4])];
  const minutes = now.getHours() * 60 + now.getMinutes();
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
