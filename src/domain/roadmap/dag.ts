export class CycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CycleError';
  }
}

/**
 * 拓撲排序：每條邊的 from 排在 to 之前；無相依關係的節點維持 nodes 中的原始順序。
 */
export function topologicalSort(
  nodes: string[],
  edges: Array<[from: string, to: string]>,
): string[] {
  const known = new Set(nodes);
  for (const [from, to] of edges) {
    for (const id of [from, to]) {
      if (!known.has(id)) throw new Error(`Unknown node in edge: ${id}`);
    }
  }

  const unique = [...known];
  const successors = new Map<string, Set<string>>();
  const predecessors = new Map<string, Set<string>>();
  for (const n of unique) {
    successors.set(n, new Set());
    predecessors.set(n, new Set());
  }
  for (const [from, to] of edges) {
    successors.get(from)?.add(to);
    predecessors.get(to)?.add(from);
  }

  const indegree = new Map<string, number>();
  for (const n of unique) indegree.set(n, predecessors.get(n)?.size ?? 0);

  const done = new Set<string>();
  const result: string[] = [];
  while (result.length < unique.length) {
    const next = unique.find((n) => !done.has(n) && indegree.get(n) === 0);
    if (next === undefined) break;
    done.add(next);
    result.push(next);
    for (const s of successors.get(next) ?? []) {
      indegree.set(s, (indegree.get(s) ?? 0) - 1);
    }
  }

  if (result.length < unique.length) {
    const cycle = findCycle(unique, done, predecessors);
    throw new CycleError(`Cycle detected: ${cycle.join(' -> ')}`);
  }
  return result;
}

function findCycle(
  unique: string[],
  done: Set<string>,
  predecessors: Map<string, Set<string>>,
): string[] {
  // 剩餘節點都至少有一個剩餘的前驅；沿著前驅走必定會繞回已走過的節點。
  let current = unique.find((n) => !done.has(n)) as string;
  const path: string[] = [];
  const seen = new Map<string, number>();
  while (!seen.has(current)) {
    seen.set(current, path.length);
    path.push(current);
    current = [...(predecessors.get(current) ?? [])].find((p) => !done.has(p)) as string;
  }
  // path 沿前驅反向走；反轉成邊的方向。
  const cycle = path.slice(seen.get(current)).reverse();
  return [...cycle, cycle[0]];
}
