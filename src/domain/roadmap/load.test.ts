import sample from '@/content/roadmaps/sample.json';
import { CycleError } from './dag';
import { loadRoadmap, RoadmapReferenceError, toGraph } from './load';
import { parseRoadmap, RoadmapValidationError } from './schema';

const node = (id: string, prerequisites: string[] = []) => ({
  id,
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  prerequisites,
});

const roadmap = (nodes: unknown[]) => ({ id: 'r', title: 'R', nodes });

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error('expected function to throw');
}

describe('loadRoadmap', () => {
  it('T1: happy path: diamond', () => {
    const result = loadRoadmap(
      roadmap([node('a'), node('b', ['a']), node('c', ['a']), node('d', ['b', 'c'])]),
    );
    expect(result.nodes).toEqual(['a', 'b', 'c', 'd']);
    expect(result.edges).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
    expect(result.levels).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('T2: boundary: single node', () => {
    const result = loadRoadmap(roadmap([node('a')]));
    expect(result.levels).toEqual([['a']]);
    expect(result.edges).toEqual([]);
  });

  it('T3: boundary: duplicate prerequisites', () => {
    const parsed = parseRoadmap(roadmap([node('a'), node('b', ['a', 'a'])]));
    expect(toGraph(parsed).edges).toEqual([['a', 'b']]);
  });

  it('T4: sample file', () => {
    const result = loadRoadmap(sample);
    const ids = sample.nodes.map((n) => n.id);
    const flat = result.levels.flat();
    expect(new Set(flat)).toEqual(new Set(ids));
    expect(flat).toHaveLength(ids.length);
  });

  it('T5: error handling: malformed format', () => {
    const bad = roadmap([{ id: 'a', summary: 's', prerequisites: [] }]);
    const error = catchError(() => loadRoadmap(bad));
    expect(error).toBeInstanceOf(RoadmapValidationError);
    expect((error as RoadmapValidationError).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'nodes[0].title' })]),
    );
  });

  it('T6: error handling: missing prerequisite', () => {
    const error = catchError(() => loadRoadmap(roadmap([node('a'), node('b', ['zzz'])])));
    expect(error).toBeInstanceOf(RoadmapReferenceError);
    const ref = error as RoadmapReferenceError;
    expect(ref.name).toBe('RoadmapReferenceError');
    expect(ref.nodeId).toBe('b');
    expect(ref.missing).toBe('zzz');
    expect(ref.message).toBe('Node "b" references unknown prerequisite "zzz"');
  });

  it('T7: error handling: cycle', () => {
    const error = catchError(() => loadRoadmap(roadmap([node('a', ['b']), node('b', ['a'])])));
    expect(error).toBeInstanceOf(CycleError);
    const message = (error as CycleError).message;
    expect(message).toContain('Cycle detected:');
    expect(message).toContain('a');
    expect(message).toContain('b');
  });

  it('T8: error handling: self reference', () => {
    expect(() => loadRoadmap(roadmap([node('a', ['a'])]))).toThrow(CycleError);
  });

  it('T9: error handling: multiple missing', () => {
    const error = catchError(() => loadRoadmap(roadmap([node('a', ['x']), node('b', ['y'])])));
    expect(error).toBeInstanceOf(RoadmapReferenceError);
    expect((error as RoadmapReferenceError).nodeId).toBe('a');
    expect((error as RoadmapReferenceError).missing).toBe('x');
  });
});
