import {
  computeLevels,
  CycleError,
  getDependents,
  getPrerequisites,
  topologicalSort,
} from '@/domain/roadmap/dag';

describe('getPrerequisites / getDependents', () => {
  const nodes = ['a', 'b', 'c', 'd'];

  it('T1: 正常流程：前置', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'd'],
      ['c', 'd'],
    ];
    expect(getPrerequisites('d', nodes, edges)).toEqual(['a', 'b', 'c']);
  });

  it('T2: 正常流程：後續', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'd'],
      ['c', 'd'],
    ];
    expect(getDependents('a', nodes, edges)).toEqual(['b', 'd']);
  });

  it('T3: 菱形不重複', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ];
    expect(getPrerequisites('d', nodes, edges)).toEqual(['a', 'b', 'c']);
  });

  it('T4: 邊界值：孤立節點', () => {
    expect(getPrerequisites('a', ['a', 'b'], [])).toEqual([]);
    expect(getDependents('a', ['a', 'b'], [])).toEqual([]);
  });

  it('T5: 錯誤處理：未知節點', () => {
    expect(() => getDependents('x', ['a'], [])).toThrow(/x/);
  });

  it('T6: 錯誤處理：循環', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'a'],
    ];
    expect(() => getPrerequisites('a', ['a', 'b'], edges)).toThrow(CycleError);
  });
});

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

describe('computeLevels', () => {
  it('T1: 正常流程', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ];
    expect(computeLevels(['a', 'b', 'c', 'd'], edges)).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('T2: 最長路徑決定層級', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'c'],
    ];
    expect(computeLevels(['a', 'b', 'c'], edges)).toEqual([['a'], ['b'], ['c']]);
  });

  it('T3: 邊界值：空圖', () => {
    expect(computeLevels([], [])).toEqual([]);
  });

  it('T4: 邊界值：無邊，維持原始順序', () => {
    expect(computeLevels(['c', 'a', 'b'], [])).toEqual([['c', 'a', 'b']]);
  });

  it('T5: 錯誤處理：循環', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'a'],
    ];
    expect(() => computeLevels(['a', 'b'], edges)).toThrow(CycleError);
  });
});
