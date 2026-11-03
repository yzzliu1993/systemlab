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

/**
 * 節點分層：無前置節點者在第 0 層，其餘 = 所有前置節點最大層級 + 1。
 * 同一層內維持 nodes 中的原始順序。循環或未知節點的錯誤同 topologicalSort。
 */
export function computeLevels(
  nodes: string[],
  edges: Array<[from: string, to: string]>,
): string[][] {
  const order = topologicalSort(nodes, edges);
  const level = new Map<string, number>();
  for (const n of order) level.set(n, 0);
  for (const n of order) {
    const base = level.get(n) ?? 0;
    for (const [from, to] of edges) {
      if (from === n) level.set(to, Math.max(level.get(to) ?? 0, base + 1));
    }
  }

  const levels: string[][] = [];
  for (const n of new Set(nodes)) {
    const l = level.get(n) ?? 0;
    (levels[l] ??= []).push(n);
  }
  return levels;
}

function reachable(
  nodeId: string,
  nodes: string[],
  edges: Array<[from: string, to: string]>,
  direction: 'backward' | 'forward',
): string[] {
  if (!nodes.includes(nodeId)) throw new Error(`Unknown node: ${nodeId}`);
  const order = topologicalSort(nodes, edges);

  const adjacent = new Map<string, string[]>();
  for (const [from, to] of edges) {
    const key = direction === 'backward' ? to : from;
    const value = direction === 'backward' ? from : to;
    const list = adjacent.get(key) ?? [];
    list.push(value);
    adjacent.set(key, list);
  }

  const visited = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const next of adjacent.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        stack.push(next);
      }
    }
  }
  visited.delete(nodeId);
  return order.filter((n) => visited.has(n));
}

/**
 * 回傳 nodeId 所有直接與間接的前置節點（不含自己），依 topologicalSort 順序。
 * nodeId 不在 nodes 中拋出 Error；循環拋出 CycleError。
 */
export function getPrerequisites(
  nodeId: string,
  nodes: string[],
  edges: Array<[from: string, to: string]>,
): string[] {
  return reachable(nodeId, nodes, edges, 'backward');
}

/**
 * 回傳 nodeId 所有直接與間接的後續節點（不含自己），依 topologicalSort 順序。
 * nodeId 不在 nodes 中拋出 Error；循環拋出 CycleError。
 */
export function getDependents(
  nodeId: string,
  nodes: string[],
  edges: Array<[from: string, to: string]>,
): string[] {
  return reachable(nodeId, nodes, edges, 'forward');
}
