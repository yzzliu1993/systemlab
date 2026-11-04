import { computeLevels } from './dag';
import { parseRoadmap } from './schema';
import type { Roadmap } from './schema';

export class RoadmapReferenceError extends Error {
  readonly nodeId: string;
  readonly missing: string;

  constructor(nodeId: string, missing: string) {
    super(`Node "${nodeId}" references unknown prerequisite "${missing}"`);
    this.name = 'RoadmapReferenceError';
    this.nodeId = nodeId;
    this.missing = missing;
  }
}

export function toGraph(roadmap: Roadmap): {
  nodes: string[];
  edges: Array<[from: string, to: string]>;
} {
  const nodes = roadmap.nodes.map((node) => node.id);
  const edges: Array<[from: string, to: string]> = [];
  for (const node of roadmap.nodes) {
    for (const prerequisite of new Set(node.prerequisites)) {
      edges.push([prerequisite, node.id]);
    }
  }
  return { nodes, edges };
}

export function loadRoadmap(input: unknown): {
  roadmap: Roadmap;
  nodes: string[];
  edges: Array<[string, string]>;
  levels: string[][];
} {
  const roadmap = parseRoadmap(input);
  const { nodes, edges } = toGraph(roadmap);

  const known = new Set(nodes);
  for (const node of roadmap.nodes) {
    for (const prerequisite of node.prerequisites) {
      if (!known.has(prerequisite)) {
        throw new RoadmapReferenceError(node.id, prerequisite);
      }
    }
  }

  const levels = computeLevels(nodes, edges);
  return { roadmap, nodes, edges, levels };
}
