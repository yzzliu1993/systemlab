import { nextRandom } from '@/domain/simulation/rng';

export const STRATEGIES = ['modulo', 'ring', 'rendezvous'] as const;
export type Strategy = (typeof STRATEGIES)[number];

export type Change = { type: 'add' } | { type: 'remove'; nodeId: string };

export type Settings = {
  strategy: Strategy;
  seed: number;
  /** Number of distinct keys. */
  keys: number;
  /** Stable node names, for example n0, n1. Order matters for modulo. */
  nodeIds: readonly string[];
  /** Positions each node takes on the ring. 1 is a plain ring. Only the ring uses it. */
  virtualNodes: number;
  /** Ticks the request stream covers. */
  ticks: number;
  requestsPerTick: number;
  /** Zipf exponent for key popularity. 0 is uniform, larger is more skewed. */
  skew: number;
  /** Share of all requests that go to key k0 (the hot key), from 0 to 1. 0 means no forced hot key. */
  hotKeyShare: number;
  /** Optional node change applied after the first run. */
  change?: Change;
};

export const DEFAULT_SETTINGS: Settings = {
  strategy: 'ring',
  seed: 7,
  keys: 1000,
  nodeIds: ['n0', 'n1', 'n2', 'n3'],
  virtualNodes: 100,
  ticks: 100,
  requestsPerTick: 50,
  skew: 1,
  hotKeyShare: 0,
};

/** Presets are plain overrides: spread them over DEFAULT_SETTINGS. */
export const PRESETS = {
  /** A fifth node joins the four default nodes. */
  addNode: { change: { type: 'add' } },
  /** Five nodes; n2 leaves. */
  removeNode: {
    nodeIds: ['n0', 'n1', 'n2', 'n3', 'n4'],
    change: { type: 'remove', nodeId: 'n2' },
  },
  /** A plain ring: one position per node, so the load is uneven. */
  noVirtualNodes: { strategy: 'ring', virtualNodes: 1 },
  /** Key k0 takes 30% of all requests. */
  hotKey: { hotKeyShare: 0.3 },
} as const satisfies Record<string, Partial<Settings>>;

export type NodeStats = {
  nodeId: string;
  keys: number;
  requestsPerTick: number;
};

export type Stats = {
  nodes: NodeStats[];
  /** Largest keys-per-node divided by the average. 1 is perfectly even. */
  keyMaxAvg: number;
  requestMaxAvg: number;
  /** Node that owns each key, by key index. */
  owners: string[];
};

export type ChangeReport = {
  change: Change;
  /** The node that joined or left. */
  nodeId: string;
  keysMoved: number;
  /** keysMoved divided by the number of keys. */
  shareMoved: number;
  /** For a removal: how many of the removed node's keys went to each other node. */
  removedKeysTo: Record<string, number>;
};

export type Result = {
  before: Stats;
  /** Present when settings.change is set. */
  after?: Stats;
  report?: ChangeReport;
};

export type RingPosition = {
  /** Position on the ring, in [0, 1). */
  position: number;
  nodeId: string;
  vnodeIndex: number;
};

/** FNV-1a 32 bit with a murmur-style final mix, so close names spread out. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function validateSettings(settings: Settings): void {
  const fail = (message: string): never => {
    throw new Error(`Invalid settings: ${message}`);
  };
  if (!STRATEGIES.includes(settings.strategy)) fail('unknown strategy');
  if (!Number.isInteger(settings.keys) || settings.keys < 1) {
    fail('keys must be an integer of at least 1');
  }
  if (settings.nodeIds.length < 1) fail('at least 1 node is needed');
  if (new Set(settings.nodeIds).size !== settings.nodeIds.length)
    fail('node ids must be unique');
  if (!Number.isInteger(settings.virtualNodes) || settings.virtualNodes < 1) {
    fail('virtualNodes must be an integer of at least 1');
  }
  if (!Number.isInteger(settings.ticks) || settings.ticks < 1) {
    fail('ticks must be an integer of at least 1');
  }
  if (
    !Number.isInteger(settings.requestsPerTick) ||
    settings.requestsPerTick < 0
  ) {
    fail('requestsPerTick must be a non-negative integer');
  }
  if (!(settings.skew >= 0)) fail('skew must be 0 or more');
  if (!(settings.hotKeyShare >= 0 && settings.hotKeyShare <= 1)) {
    fail('hotKeyShare must be between 0 and 1');
  }
  const change = settings.change;
  if (change?.type === 'remove') {
    if (!settings.nodeIds.includes(change.nodeId)) {
      fail(`cannot remove unknown node ${change.nodeId}`);
    }
    if (settings.nodeIds.length < 2) fail('cannot remove the last node');
  }
}

function keyName(settings: Settings, index: number): string {
  return `${settings.seed}:k${index}`;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function ringPoints(
  nodeIds: readonly string[],
  virtualNodes: number,
): RingPosition[] {
  const points: RingPosition[] = [];
  for (const nodeId of nodeIds) {
    for (let v = 0; v < virtualNodes; v++) {
      points.push({
        position: hash32(`${nodeId}#${v}`) / 4294967296,
        nodeId,
        vnodeIndex: v,
      });
    }
  }
  return points.sort(
    (a, b) =>
      a.position - b.position ||
      compareText(a.nodeId, b.nodeId) ||
      a.vnodeIndex - b.vnodeIndex,
  );
}

/** Ring positions for a UI, sorted by position. */
export function ringPositions(
  settings: Pick<Settings, 'nodeIds' | 'virtualNodes'>,
): RingPosition[] {
  if (settings.nodeIds.length < 1)
    throw new Error('Invalid settings: at least 1 node is needed');
  if (!Number.isInteger(settings.virtualNodes) || settings.virtualNodes < 1) {
    throw new Error(
      'Invalid settings: virtualNodes must be an integer of at least 1',
    );
  }
  return ringPoints(settings.nodeIds, settings.virtualNodes);
}

/** Owner of every key, by key index, for the given nodes. */
export function assignKeys(
  settings: Settings,
  nodeIds: readonly string[],
): string[] {
  const owners: string[] = [];
  const points =
    settings.strategy === 'ring'
      ? ringPoints(nodeIds, settings.virtualNodes)
      : [];
  for (let i = 0; i < settings.keys; i++) {
    const name = keyName(settings, i);
    const h = hash32(name);
    if (settings.strategy === 'modulo') {
      owners.push(nodeIds[h % nodeIds.length]);
    } else if (settings.strategy === 'ring') {
      const at = h / 4294967296;
      // First position at or after the key, wrapping to the start.
      let lo = 0;
      let hi = points.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (points[mid].position < at) lo = mid + 1;
        else hi = mid;
      }
      owners.push(points[lo % points.length].nodeId);
    } else {
      let best = nodeIds[0];
      let bestWeight = -1;
      for (const nodeId of nodeIds) {
        const weight = hash32(`${name}|${nodeId}`);
        if (weight > bestWeight || (weight === bestWeight && nodeId < best)) {
          best = nodeId;
          bestWeight = weight;
        }
      }
      owners.push(best);
    }
  }
  return owners;
}

/** Requests per key over the whole run. Does not depend on the strategy or the nodes. */
function requestCounts(settings: Settings): number[] {
  const popularity: number[] = [];
  let total = 0;
  for (let i = 0; i < settings.keys; i++) {
    const w = 1 / Math.pow(i + 1, settings.skew);
    popularity.push(w);
    total += w;
  }
  // With a forced hot key, k0 gets hotKeyShare and the others split the rest by popularity.
  const forceHot = settings.hotKeyShare > 0 && settings.keys > 1;
  const othersTotal = total - popularity[0];
  const cumulative: number[] = [];
  let sum = 0;
  for (let i = 0; i < settings.keys; i++) {
    if (forceHot) {
      sum +=
        i === 0
          ? settings.hotKeyShare
          : ((1 - settings.hotKeyShare) * popularity[i]) / othersTotal;
    } else {
      sum += popularity[i] / total;
    }
    cumulative.push(sum);
  }
  const counts = new Array<number>(settings.keys).fill(0);
  let rng = settings.seed >>> 0;
  const requests = settings.ticks * settings.requestsPerTick;
  for (let r = 0; r < requests; r++) {
    const draw = nextRandom(rng);
    rng = draw.state;
    const target = draw.value * sum;
    let lo = 0;
    let hi = settings.keys - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cumulative[mid] <= target) lo = mid + 1;
      else hi = mid;
    }
    counts[lo]++;
  }
  return counts;
}

function buildStats(
  settings: Settings,
  nodeIds: readonly string[],
  owners: string[],
  counts: number[],
): Stats {
  const keys = new Map(nodeIds.map((id) => [id, 0]));
  const requests = new Map(nodeIds.map((id) => [id, 0]));
  owners.forEach((owner, i) => {
    keys.set(owner, (keys.get(owner) ?? 0) + 1);
    requests.set(owner, (requests.get(owner) ?? 0) + counts[i]);
  });
  const nodes = nodeIds.map((nodeId) => ({
    nodeId,
    keys: keys.get(nodeId) ?? 0,
    requestsPerTick: (requests.get(nodeId) ?? 0) / settings.ticks,
  }));
  const maxAvg = (values: number[]): number => {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return avg === 0 ? 1 : Math.max(...values) / avg;
  };
  return {
    nodes,
    keyMaxAvg: maxAvg(nodes.map((n) => n.keys)),
    requestMaxAvg: maxAvg(nodes.map((n) => n.requestsPerTick)),
    owners,
  };
}

function nextNodeId(nodeIds: readonly string[]): string {
  let n = nodeIds.length;
  while (nodeIds.includes(`n${n}`)) n++;
  return `n${n}`;
}

export function simulate(settings: Settings): Result {
  validateSettings(settings);
  const counts = requestCounts(settings);
  const beforeOwners = assignKeys(settings, settings.nodeIds);
  const before = buildStats(settings, settings.nodeIds, beforeOwners, counts);
  const change = settings.change;
  if (!change) return { before };

  const nodeId =
    change.type === 'add' ? nextNodeId(settings.nodeIds) : change.nodeId;
  const afterIds =
    change.type === 'add'
      ? [...settings.nodeIds, nodeId]
      : settings.nodeIds.filter((id) => id !== nodeId);
  const afterOwners = assignKeys(settings, afterIds);
  const after = buildStats(settings, afterIds, afterOwners, counts);

  let keysMoved = 0;
  const removedKeysTo: Record<string, number> = {};
  afterOwners.forEach((owner, i) => {
    if (owner === beforeOwners[i]) return;
    keysMoved++;
    if (change.type === 'remove' && beforeOwners[i] === nodeId) {
      removedKeysTo[owner] = (removedKeysTo[owner] ?? 0) + 1;
    }
  });
  return {
    before,
    after,
    report: {
      change,
      nodeId,
      keysMoved,
      shareMoved: keysMoved / settings.keys,
      removedKeysTo,
    },
  };
}
