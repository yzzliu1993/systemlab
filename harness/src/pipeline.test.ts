import { prNumberFromUrl } from './github/client';
import { decideStart } from './pipeline';

describe('decideStart', () => {
  it('T1: Todo 從 implement 開始', () => {
    expect(decideStart({ stateName: 'Todo', labelNames: [] })).toEqual({ start: 'implement' });
  });

  it('T1: In Progress（中斷或退件後）從 implement 開始', () => {
    expect(decideStart({ stateName: 'In Progress', labelNames: ['agent:working'] })).toEqual({ start: 'implement' });
  });

  it('T2: In Review 從 review 開始', () => {
    expect(decideStart({ stateName: 'In Review', labelNames: [] })).toEqual({ start: 'review' });
  });

  it('T3: Done 不處理', () => {
    expect(decideStart({ stateName: 'Done', labelNames: [] }).start).toBe('skip');
  });

  it('T3: 已有 awaiting-merge 不處理', () => {
    expect(decideStart({ stateName: 'In Review', labelNames: ['awaiting-merge'] }).start).toBe('skip');
  });

  it('T3: 有 needs-human 不處理，並說明如何恢復', () => {
    const decision = decideStart({ stateName: 'In Progress', labelNames: ['needs-human'] });
    expect(decision).toMatchObject({ start: 'skip', reason: expect.stringContaining('移除標籤') });
  });

  it('T3: Backlog 不處理（由 Decompose 負責）', () => {
    expect(decideStart({ stateName: 'Backlog', labelNames: [] }).start).toBe('skip');
  });

  it('merge 後（Done 且仍有 awaiting-merge）進行收尾', () => {
    expect(decideStart({ stateName: 'Done', labelNames: ['awaiting-merge'] })).toEqual({ start: 'finalize' });
  });

  it('Done 且 handoff 停在 awaiting_merge 也進行收尾', () => {
    expect(decideStart({ stateName: 'Done', labelNames: [] }, { stage: 'awaiting_merge' })).toEqual({ start: 'finalize' });
  });

  it('In Review 且 handoff 停在更新分支時，接續更新分支而不重新 review', () => {
    expect(decideStart({ stateName: 'In Review', labelNames: [] }, { stage: 'update_branch' }))
      .toEqual({ start: 'update_branch' });
  });

  it('等 merge 時人移除 awaiting-merge：視為人工退件', () => {
    expect(decideStart({ stateName: 'In Review', labelNames: [] }, { stage: 'awaiting_merge' }))
      .toEqual({ start: 'human_rejected' });
  });

  it('取消的票若仍有 agent:working 則收尾', () => {
    expect(decideStart({ stateName: 'Canceled', labelNames: ['agent:working'] })).toEqual({ start: 'finalize' });
  });

  it('Done 的票即使有 needs-human 也收尾', () => {
    expect(decideStart({ stateName: 'Done', labelNames: ['needs-human', 'awaiting-merge'] })).toEqual({ start: 'finalize' });
  });

  it('In Review 且 handoff 停在 review 時重新 review', () => {
    expect(decideStart({ stateName: 'In Review', labelNames: [] }, { stage: 'review' })).toEqual({ start: 'review' });
  });
});

describe('prNumberFromUrl', () => {
  it('取出 PR 編號', () => {
    expect(prNumberFromUrl('https://github.com/o/r/pull/42')).toBe(42);
  });

  it('容許結尾斜線與換行', () => {
    expect(prNumberFromUrl('https://github.com/o/r/pull/7/\n')).toBe(7);
  });

  it('T4: 格式不符時拋出錯誤', () => {
    expect(() => prNumberFromUrl('https://github.com/o/r/issues/42')).toThrow('無法從 PR URL 取得編號');
  });
});
