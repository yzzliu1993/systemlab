import {
  computeLevels,
  CycleError,
  getDependents,
  getPrerequisites,
  topologicalSort,
} from '@/domain/roadmap/dag';

describe('getPrerequisites / getDependents', () => {
  const nodes = ['a', 'b', 'c', 'd'];

  it('T1: happy path: prerequisites', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'd'],
      ['c', 'd'],
    ];
    expect(getPrerequisites('d', nodes, edges)).toEqual(['a', 'b', 'c']);
  });

  it('T2: happy path: dependents', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'd'],
      ['c', 'd'],
    ];
    expect(getDependents('a', nodes, edges)).toEqual(['b', 'd']);
  });

  it('T3: diamond has no duplicates', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ];
    expect(getPrerequisites('d', nodes, edges)).toEqual(['a', 'b', 'c']);
  });

  it('T4: boundary: isolated node', () => {
    expect(getPrerequisites('a', ['a', 'b'], [])).toEqual([]);
    expect(getDependents('a', ['a', 'b'], [])).toEqual([]);
  });

  it('T5: error handling: unknown node', () => {
    expect(() => getDependents('x', ['a'], [])).toThrow(/x/);
  });

  it('T6: error handling: cycle', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'a'],
    ];
    expect(() => getPrerequisites('a', ['a', 'b'], edges)).toThrow(CycleError);
  });
});

describe('topologicalSort', () => {
  it('T1: happy path, every edge has from before to', () => {
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

  it('T2: empty graph returns empty array', () => {
    expect(topologicalSort([], [])).toEqual([]);
  });

  it('T3: keeps original order when there are no edges', () => {
    expect(topologicalSort(['c', 'a', 'b'], [])).toEqual(['c', 'a', 'b']);
  });

  it('T4: cycle throws CycleError, message contains the cycle nodes', () => {
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

  it('T5: edge referencing an unknown node throws Error, message contains that node', () => {
    expect(() => topologicalSort(['a'], [['a', 'x']])).toThrow(/x/);
  });
});

describe('computeLevels', () => {
  it('T1: happy path', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ];
    expect(computeLevels(['a', 'b', 'c', 'd'], edges)).toEqual([
      ['a'],
      ['b', 'c'],
      ['d'],
    ]);
  });

  it('T2: longest path determines the level', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'c'],
    ];
    expect(computeLevels(['a', 'b', 'c'], edges)).toEqual([
      ['a'],
      ['b'],
      ['c'],
    ]);
  });

  it('T3: boundary: empty graph', () => {
    expect(computeLevels([], [])).toEqual([]);
  });

  it('T4: boundary: no edges, keeps original order', () => {
    expect(computeLevels(['c', 'a', 'b'], [])).toEqual([['c', 'a', 'b']]);
  });

  it('T5: error handling: cycle', () => {
    const edges: Array<[string, string]> = [
      ['a', 'b'],
      ['b', 'a'],
    ];
    expect(() => computeLevels(['a', 'b'], edges)).toThrow(CycleError);
  });
});
