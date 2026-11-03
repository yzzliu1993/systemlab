import { pickNext, withinActiveHours, type TicketSummary } from './scheduler';

const now = new Date('2026-11-04T12:00:00Z');
const hour = 3_600_000;
const grace = 30 * 60_000;

function ticket(identifier: string, overrides: Partial<TicketSummary> = {}): TicketSummary {
  return {
    identifier,
    stateName: 'Todo',
    labelNames: [],
    priority: 0,
    createdAt: new Date(now.getTime() - 10 * hour),
    updatedAt: new Date(now.getTime() - 2 * hour),
    openBlockers: 0,
    ...overrides,
  };
}

describe('pickNext', () => {
  it('T1: Todo 優先於 Backlog 拆解', () => {
    const next = pickNext([ticket('B-1', { stateName: 'Backlog' }), ticket('T-1')], now, grace);
    expect(next).toMatchObject({ kind: 'run', identifier: 'T-1' });
  });

  it('T1: priority 高者優先，未設定排最後，同 priority 舊的先', () => {
    const tickets = [
      ticket('NONE', { priority: 0, createdAt: new Date(now.getTime() - 99 * hour) }),
      ticket('LOW', { priority: 4 }),
      ticket('HIGH-NEW', { priority: 2, createdAt: new Date(now.getTime() - 1 * hour) }),
      ticket('HIGH-OLD', { priority: 2, createdAt: new Date(now.getTime() - 5 * hour) }),
    ];
    expect(pickNext(tickets, now, grace)?.identifier).toBe('HIGH-OLD');
  });

  it('T1: 沒有 Todo 時拆解最舊的 Backlog', () => {
    const tickets = [
      ticket('B-new', { stateName: 'Backlog', createdAt: new Date(now.getTime() - 3 * hour) }),
      ticket('B-old', { stateName: 'Backlog', createdAt: new Date(now.getTime() - 9 * hour) }),
    ];
    expect(pickNext(tickets, now, grace)).toMatchObject({ kind: 'decompose', identifier: 'B-old' });
  });

  it('T2: 剛編輯過的 Backlog 不拆解', () => {
    const fresh = ticket('B-1', { stateName: 'Backlog', updatedAt: new Date(now.getTime() - 10 * 60_000) });
    expect(pickNext([fresh], now, grace)).toBeUndefined();
  });

  it('T2: 已拆解過的 Backlog 不再拆', () => {
    expect(pickNext([ticket('B-1', { stateName: 'Backlog', labelNames: ['decomposed'] })], now, grace)).toBeUndefined();
  });

  it('T3: blocked-by 未完成的 Todo 跳過', () => {
    const tickets = [ticket('BLOCKED', { openBlockers: 1, priority: 1 }), ticket('FREE', { priority: 4 })];
    expect(pickNext(tickets, now, grace)?.identifier).toBe('FREE');
  });

  it('T4: 有 agent:working 的票優先接續', () => {
    const tickets = [ticket('T-1', { priority: 1 }), ticket('W-1', { stateName: 'In Progress', labelNames: ['agent:working'] })];
    expect(pickNext(tickets, now, grace)).toMatchObject({ kind: 'run', identifier: 'W-1' });
  });

  it('T4: Backlog 上中斷的拆解以 decompose 接續', () => {
    const working = ticket('B-1', { stateName: 'Backlog', labelNames: ['agent:working'], updatedAt: now });
    expect(pickNext([working], now, grace)).toMatchObject({ kind: 'decompose', identifier: 'B-1' });
  });

  it('沒有 agent:working 的 In Progress 是人在做的票，不認領', () => {
    expect(pickNext([ticket('P-1', { stateName: 'In Progress' })], now, grace)).toBeUndefined();
  });

  it('ignore 清單中的票不選', () => {
    const tickets = [ticket('T-1', { priority: 1 }), ticket('T-2', { priority: 2 })];
    expect(pickNext(tickets, now, grace, new Set(['T-1']))?.identifier).toBe('T-2');
  });

  it('In Review（未等 merge）優先於 Todo', () => {
    const tickets = [ticket('T-1', { priority: 1 }), ticket('R-1', { stateName: 'In Review' })];
    expect(pickNext(tickets, now, grace)?.identifier).toBe('R-1');
  });

  it('等待 merge 的票不處理', () => {
    expect(pickNext([ticket('R-1', { stateName: 'In Review', labelNames: ['awaiting-merge'] })], now, grace)).toBeUndefined();
  });

  it.each(['needs-human', 'agent-proposed', 'spec-needed', 'draft'])('T5: 帶有 %s 的票不處理', (label) => {
    const tickets = [
      ticket('T-1', { labelNames: [label] }),
      ticket('B-1', { stateName: 'Backlog', labelNames: [label] }),
      ticket('R-1', { stateName: 'In Review', labelNames: [label] }),
    ];
    expect(pickNext(tickets, now, grace)).toBeUndefined();
  });

  it('T5: needs-human 的中斷工作不接續', () => {
    const t = ticket('W-1', { stateName: 'In Progress', labelNames: ['agent:working', 'needs-human'] });
    expect(pickNext([t], now, grace)).toBeUndefined();
  });
});

describe('withinActiveHours', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 4, h, m);

  it('未設定代表全天', () => {
    expect(withinActiveHours(undefined, at(3))).toBe(true);
  });

  it('同日區間', () => {
    expect(withinActiveHours('09:00-18:00', at(9))).toBe(true);
    expect(withinActiveHours('09:00-18:00', at(18))).toBe(false);
  });

  it('跨午夜區間', () => {
    expect(withinActiveHours('22:00-08:00', at(23, 30))).toBe(true);
    expect(withinActiveHours('22:00-08:00', at(7, 59))).toBe(true);
    expect(withinActiveHours('22:00-08:00', at(12))).toBe(false);
  });

  it('格式錯誤時拋出', () => {
    expect(() => withinActiveHours('10pm-8am', at(1))).toThrow('activeHours 格式錯誤');
  });
});
