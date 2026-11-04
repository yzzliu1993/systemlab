export class CycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CycleError';
  }
}

/**
 * Topological sort: for every edge, from comes before to; nodes with no dependency relation keep their original order in nodes.
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
  // Every remaining node has at least one remaining predecessor; walking along predecessors must loop back to a visited node.
  let current = unique.find((n) => !done.has(n)) as string;
  const path: string[] = [];
  const seen = new Map<string, number>();
  while (!seen.has(current)) {
    seen.set(current, path.length);
    path.push(current);
    current = [...(predecessors.get(current) ?? [])].find((p) => !done.has(p)) as string;
  }
  // path walks backward along predecessors; reverse it to get the edge direction.
  const cycle = path.slice(seen.get(current)).reverse();
  return [...cycle, cycle[0]];
}

/**
 * Node leveling: nodes with no prerequisites are at level 0; others are the max level of all prerequisites + 1.
 * Within a level, the original order in nodes is kept. Cycle and unknown-node errors are the same as topologicalSort.
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
 * Returns all direct and indirect prerequisites of nodeId (excluding itself), in topologicalSort order.
 * Throws Error if nodeId is not in nodes; throws CycleError on a cycle.
 */
export function getPrerequisites(
  nodeId: string,
  nodes: string[],
  edges: Array<[from: string, to: string]>,
): string[] {
  return reachable(nodeId, nodes, edges, 'backward');
}

/**
 * Returns all direct and indirect dependents of nodeId (excluding itself), in topologicalSort order.
 * Throws Error if nodeId is not in nodes; throws CycleError on a cycle.
 */
export function getDependents(
  nodeId: string,
  nodes: string[],
  edges: Array<[from: string, to: string]>,
): string[] {
  return reachable(nodeId, nodes, edges, 'forward');
}
