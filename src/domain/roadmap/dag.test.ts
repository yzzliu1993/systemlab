import { CycleError, topologicalSort } from '@/domain/roadmap/dag';

describe('topologicalSort', () => {
  it('T1: 正常流程，每條邊 from 在 to 之前', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'd'],
    ];
    const result = topologicalSort(['a', 'b', 'c', 'd'], edges);
    for (const [from, to] of edges) {
      expect(result.indexOf(from)).toBeLessThan(result.indexOf(to));
    }
    expect(result).toEqual(['a', 'b', 'c', 'd']);
  });

  it('T2: 空圖回傳空陣列', () => {
    expect(topologicalSort([], [])).toEqual([]);
  });

  it('T3: 無邊時維持原始順序', () => {
    expect(topologicalSort(['c', 'a', 'b'], [])).toEqual(['c', 'a', 'b']);
  });

  it('T4: 循環拋出 CycleError，message 包含循環節點', () => {
    const run = () =>
      topologicalSort(
        ['a', 'b', 'c'],
        [
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'a'],
        ],
      );
    expect(run).toThrow(CycleError);
    for (const id of ['a', 'b', 'c']) {
      expect(run).toThrow(id);
    }
  });

  it('T5: 邊引用未知節點拋出 Error，message 包含該節點', () => {
    expect(() => topologicalSort(['a'], [['a', 'x']])).toThrow(/x/);
  });
});
