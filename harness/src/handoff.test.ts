import { applyPatch, HANDOFF_MARKER, initialHandoff, parseHandoff, renderHandoff } from './handoff';

const now = new Date('2026-11-04T10:00:00Z');

describe('renderHandoff / parseHandoff', () => {
  it('T1: 轉成留言再解析，內容不變', () => {
    const handoff = {
      ...initialHandoff('feat/you-12/roadmap', now),
      prUrl: 'https://github.com/o/r/pull/12',
      stage: 'review' as const,
      rejections: 1,
      lastReview: '### 必須修正\n1. `a | b` 含有管線符號',
      inFlight: { stage: 'review' as const, sessionId: 'uuid-1', startedAt: now.toISOString() },
    };
    const body = renderHandoff(handoff);
    expect(body.startsWith(HANDOFF_MARKER)).toBe(true);
    expect(parseHandoff(body)).toEqual(handoff);
  });

  it('T2: 一般留言回傳 undefined', () => {
    expect(parseHandoff('✅ Implement 完成')).toBeUndefined();
  });

  it('T2: JSON 損毀回傳 undefined', () => {
    expect(parseHandoff(`${HANDOFF_MARKER}\n\`\`\`json\n{ broken\n\`\`\``)).toBeUndefined();
  });

  it('T2: 欄位不符 schema 回傳 undefined', () => {
    expect(parseHandoff(`${HANDOFF_MARKER}\n\`\`\`json\n{"version":2}\n\`\`\``)).toBeUndefined();
  });
});

describe('applyPatch', () => {
  const base = initialHandoff('b', now);

  it('更新 heartbeat', () => {
    const later = new Date('2026-11-04T10:05:00Z');
    expect(applyPatch(base, {}, later).heartbeat).toBe(later.toISOString());
  });

  it('錯誤摘要限 200 字，歷程最多保留 5 筆', () => {
    let h = base;
    for (let i = 0; i < 7; i++) h = applyPatch(h, { lastError: `錯誤 ${i} ${'x'.repeat(300)}` }, now);
    expect(h.lastError!.length).toBe(200);
    expect(h.errorHistory).toHaveLength(5);
    expect(h.errorHistory[4]).toContain('錯誤 6');
  });

  it('相同錯誤不重複記入歷程', () => {
    const once = applyPatch(base, { lastError: 'A' }, now);
    expect(applyPatch(once, { lastError: 'A' }, now).errorHistory).toHaveLength(1);
  });

  it('過長的 feedback 保留尾端', () => {
    const h = applyPatch(base, { feedback: `${'a'.repeat(5000)}END` }, now);
    expect(h.feedback!.endsWith('END')).toBe(true);
    expect(h.feedback!.length).toBeLessThan(4_100);
  });

  it('可以清除 inFlight', () => {
    const running = applyPatch(base, { inFlight: { stage: 'implement', sessionId: 's', startedAt: '' } }, now);
    expect(applyPatch(running, { inFlight: undefined }, now).inFlight).toBeUndefined();
  });
});
