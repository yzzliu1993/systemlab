import { z } from 'zod';

const nonEmpty = z.string().min(1, 'must not be empty');

const roadmapNodeSchema = z.object({
  id: nonEmpty,
  title: nonEmpty,
  summary: nonEmpty,
  prerequisites: z.array(nonEmpty),
});

const roadmapSchema = z
  .object({
    id: nonEmpty,
    title: nonEmpty,
    nodes: z.array(roadmapNodeSchema).min(1, 'must contain at least one node'),
  })
  .superRefine((roadmap, ctx) => {
    const seen = new Set<string>();
    roadmap.nodes.forEach((node, index) => {
      if (seen.has(node.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', index, 'id'],
          message: `duplicate node id "${node.id}"`,
        });
      }
      seen.add(node.id);
    });
  });

export type Roadmap = z.infer<typeof roadmapSchema>;
export type RoadmapNode = z.infer<typeof roadmapNodeSchema>;

export type RoadmapValidationIssue = {
  nodeId: string | null;
  path: string;
  message: string;
};

export class RoadmapValidationError extends Error {
  readonly issues: RoadmapValidationIssue[];

  constructor(issues: RoadmapValidationIssue[]) {
    super(
      `Invalid roadmap:\n${issues.map((issue) => `- ${issue.message}`).join('\n')}`,
    );
    this.name = 'RoadmapValidationError';
    this.issues = issues;
  }
}

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') return `${acc}[${segment}]`;
    const key = String(segment);
    return acc === '' ? key : `${acc}.${key}`;
  }, '');
}

function findNodeId(
  input: unknown,
  path: ReadonlyArray<PropertyKey>,
): string | null {
  if (path[0] !== 'nodes' || typeof path[1] !== 'number') return null;
  if (typeof input !== 'object' || input === null) return null;
  const nodes = (input as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return null;
  const node: unknown = nodes[path[1]];
  if (typeof node !== 'object' || node === null) return null;
  const id = (node as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

export function parseRoadmap(input: unknown): Roadmap {
  const result = roadmapSchema.safeParse(input);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => {
    const path = formatPath(issue.path);
    return {
      nodeId: findNodeId(input, issue.path),
      path,
      message: path === '' ? issue.message : `${path}: ${issue.message}`,
    };
  });
  throw new RoadmapValidationError(issues);
}
