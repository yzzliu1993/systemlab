import sample from '@/content/roadmaps/sample.json';
import { parseRoadmap, RoadmapValidationError } from './schema';

const node = (id: string, prerequisites: string[] = []) => ({
  id,
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  prerequisites,
});

const roadmap = (nodes: unknown[]) => ({ id: 'r', title: 'R', nodes });

function catchError(input: unknown): RoadmapValidationError {
  try {
    parseRoadmap(input);
  } catch (e) {
    expect(e).toBeInstanceOf(RoadmapValidationError);
    return e as RoadmapValidationError;
  }
  throw new Error('expected parseRoadmap to throw');
}

describe('parseRoadmap', () => {
  it('T1: valid roadmap returns data deeply equal to the input', () => {
    const input = roadmap([node('a'), node('b', ['a'])]);
    expect(parseRoadmap(input)).toEqual(input);
  });

  it('T2: does not throw with a single node that has no prerequisites', () => {
    const result = parseRoadmap(roadmap([node('a', [])]));
    expect(result.nodes).toHaveLength(1);
  });

  it('T3: missing summary reports the node and field path', () => {
    const { summary: _summary, ...broken } = node('b');
    const error = catchError(roadmap([node('a'), broken]));
    expect(error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'b', path: 'nodes[1].summary' }),
      ]),
    );
    for (const issue of error.issues) {
      expect(issue.message.startsWith(issue.path)).toBe(true);
    }
  });

  it('T4: wrong prerequisites type reports the path and nodeId', () => {
    const error = catchError(roadmap([{ ...node('a'), prerequisites: 'x' }]));
    expect(error.issues).toEqual([
      expect.objectContaining({ nodeId: 'a', path: 'nodes[0].prerequisites' }),
    ]);
  });

  it('T5: empty title and empty nodes both fail validation', () => {
    const a = catchError(roadmap([{ ...node('a'), title: '' }]));
    expect(a.issues).toEqual([
      expect.objectContaining({ nodeId: 'a', path: 'nodes[0].title' }),
    ]);

    const b = catchError(roadmap([]));
    expect(b.issues).toEqual([
      expect.objectContaining({ nodeId: null, path: 'nodes' }),
    ]);
  });

  it('T6: duplicate node id points to the later node', () => {
    const error = catchError(roadmap([node('a'), node('a')]));
    expect(error.issues).toEqual([
      expect.objectContaining({ nodeId: 'a', path: 'nodes[1].id' }),
    ]);
  });

  it('T7: nodeId is null when the top level is not an object', () => {
    const error = catchError(null);
    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues[0]?.nodeId).toBeNull();
  });

  it('T8: sample.json passes validation and has at least 5 nodes', () => {
    const result = parseRoadmap(sample);
    expect(result.nodes.length).toBeGreaterThanOrEqual(5);
  });
});
