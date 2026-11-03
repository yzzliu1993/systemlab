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
  it('T1: 合法 roadmap 回傳與輸入深度相等的資料', () => {
    const input = roadmap([node('a'), node('b', ['a'])]);
    expect(parseRoadmap(input)).toEqual(input);
  });

  it('T2: 無前置節點且只有 1 個節點時不拋錯', () => {
    const result = parseRoadmap(roadmap([node('a', [])]));
    expect(result.nodes).toHaveLength(1);
  });

  it('T3: 缺少 summary 時指出節點與欄位路徑', () => {
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

  it('T4: prerequisites 型別錯誤時指出路徑與 nodeId', () => {
    const error = catchError(roadmap([{ ...node('a'), prerequisites: 'x' }]));
    expect(error.issues).toEqual([
      expect.objectContaining({ nodeId: 'a', path: 'nodes[0].prerequisites' }),
    ]);
  });

  it('T5: 空字串 title 與空 nodes 皆驗證失敗', () => {
    const a = catchError(roadmap([{ ...node('a'), title: '' }]));
    expect(a.issues).toEqual([
      expect.objectContaining({ nodeId: 'a', path: 'nodes[0].title' }),
    ]);

    const b = catchError(roadmap([]));
    expect(b.issues).toEqual([
      expect.objectContaining({ nodeId: null, path: 'nodes' }),
    ]);
  });

  it('T6: 節點 id 重複時指向後出現的節點', () => {
    const error = catchError(roadmap([node('a'), node('a')]));
    expect(error.issues).toEqual([
      expect.objectContaining({ nodeId: 'a', path: 'nodes[1].id' }),
    ]);
  });

  it('T7: 頂層不是物件時 nodeId 為 null', () => {
    const error = catchError(null);
    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues[0]?.nodeId).toBeNull();
  });

  it('T8: sample.json 通過驗證且至少 5 個節點', () => {
    const result = parseRoadmap(sample);
    expect(result.nodes.length).toBeGreaterThanOrEqual(5);
  });
});
