import { nextRandom } from '@/domain/simulation/rng';

/**
 * Replication model: node 0 starts as the leader, nodes 1..N are followers.
 *
 * Simplifications (kept on purpose so the lessons stay visible):
 * - One shared value; a read is stale when the node it hits lacks the write that the same
 *   client last had acknowledged.
 * - Followers apply the leader's writes in order, each after the follower's lag plus jitter.
 * - When a leader fails, writes still in flight to followers are dropped.
 * - When a follower is promoted, the other followers on its side resync to it instantly.
 * - A failed leader stays down. Only one event kind (failure or partition) per run.
 */

export type ReplicationMode = 'async' | 'sync';
export type ReadRouting = 'leader' | 'anyFollower' | 'readYourOwnWrites';

export type Settings = {
  seed: number;
  /** Length of the run in ticks. */
  ticks: number;
  /** Number of followers (the leader is extra). */
  followers: number;
  /** Ticks a write takes to reach each follower. One entry per follower (node 1..N). */
  followerLags: readonly number[];
  /** Each write gets 0..jitter extra ticks per follower (delivery order is kept). */
  jitter: number;
  /** async: acknowledged at once. sync: acknowledged once `syncFollowers` followers have it. */
  mode: ReplicationMode;
  /** K for sync mode. Must be between 1 and `followers`. Ignored in async mode. */
  syncFollowers: number;
  clients: number;
  /** Chance per client per tick of sending a write. */
  writeChance: number;
  /** Chance per client per tick of sending a read. */
  readChance: number;
  readRouting: ReadRouting;
  /** Read-your-own-writes: ticks after its own write that a client reads from the leader. */
  readYourWritesWindow: number;
  /** Leader fails at this tick. Writes are refused until the promotion delay has passed. */
  failure?: { tick: number };
  /**
   * Network partition from `tick`. The leader keeps a minority of the followers (clients with
   * an even index stay on the leader's side, odd ones go to the majority side). The majority
   * side promotes a new leader after the promotion delay. Needs 2+ followers and 2+ clients.
   */
  partition?: { tick: number; healTick?: number };
  /** Ticks between the leader being lost (or cut off) and a new leader taking writes. */
  promotionDelay: number;
  /** Follower that gets promoted: 'mostCaughtUp' (longest log, lowest node on a tie) or a node 1..N. */
  promoteTarget: 'mostCaughtUp' | number;
  /**
   * Partition only. On: the old leader keeps accepting writes while the other side promotes
   * a new one (split brain). Off: the old leader steps down at once and refuses writes.
   */
  autoPromoteWithoutMajority: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  seed: 7,
  ticks: 300,
  followers: 3,
  followerLags: [2, 4, 6],
  jitter: 0,
  mode: 'async',
  syncFollowers: 1,
  clients: 4,
  writeChance: 0.3,
  readChance: 0.5,
  readRouting: 'leader',
  readYourWritesWindow: 10,
  promotionDelay: 10,
  promoteTarget: 'mostCaughtUp',
  autoPromoteWithoutMajority: false,
};

/**
 * Plain settings objects the UI can start from. Each one is DEFAULT_SETTINGS plus:
 * - laggingFollower: 2 followers with lag 1 and 25, jitter 3, reads from any follower.
 * - leaderFailsAsync: asynchronous, leader fails at tick 100, promotion delay 10.
 * - leaderFailsSync: as above but synchronous with 1 follower.
 * - networkPartition: 4 followers (lags 2 to 5), partition at tick 100 healing at tick 200,
 *   promotion delay 10, auto promote without majority on (split brain).
 */
export const PRESETS = {
  laggingFollower: {
    ...DEFAULT_SETTINGS,
    followers: 2,
    followerLags: [1, 25],
    jitter: 3,
    readRouting: 'anyFollower',
  },
  leaderFailsAsync: {
    ...DEFAULT_SETTINGS,
    mode: 'async',
    failure: { tick: 100 },
  },
  leaderFailsSync: {
    ...DEFAULT_SETTINGS,
    mode: 'sync',
    syncFollowers: 1,
    failure: { tick: 100 },
  },
  networkPartition: {
    ...DEFAULT_SETTINGS,
    followers: 4,
    followerLags: [2, 3, 4, 5],
    partition: { tick: 100, healTick: 200 },
    autoPromoteWithoutMajority: true,
  },
} as const satisfies Record<string, Settings>;

type Side = 'a' | 'b';

export type Write = {
  id: number;
  client: number;
  tick: number;
  /** Node that accepted it. */
  leader: number;
  side: Side;
  ackedAt: number | null;
  /** Acknowledged by a leader whose history was then replaced. */
  lost: boolean;
  /** Never acknowledged because its leader went away. */
  dropped: boolean;
};

export type NodeState = {
  alive: boolean;
  side: Side;
  /** Write ids in the order this node applied them. */
  log: number[];
  have: Record<number, true>;
  /** Writes on their way, in order. */
  pending: { id: number; applyAt: number }[];
  lastApplyAt: number;
};

export type ClientState = {
  lastAcked: number | null;
  lastWriteTick: number | null;
};

export type FollowerLag = {
  node: number;
  writesBehind: number;
  /** Age in ticks of the oldest write this node has not applied. 0 when caught up. */
  ticksBehind: number;
};

export type TickStats = {
  tick: number;
  writesSent: number;
  readsSent: number;
  writesAcked: number;
  writesRefused: number;
  reads: number;
  staleReads: number;
  lostWrites: number;
  conflicts: number;
  /** Over all writes acknowledged so far. */
  averageWriteLatency: number;
  maxWriteLatency: number;
  lag: FollowerLag[];
  /** Leader on each side. Null while there is none. `b` only exists during a partition. */
  leaders: { a: number | null; b: number | null };
};

export type Totals = {
  writesSent: number;
  readsSent: number;
  writesAcked: number;
  writesRefused: number;
  reads: number;
  staleReads: number;
  lostWrites: number;
  conflicts: number;
  averageWriteLatency: number;
  maxWriteLatency: number;
};

export type RunState = {
  settings: Settings;
  tick: number;
  /** Stream for writes and reads. Draws a fixed number of values per client per tick. */
  clientRng: number;
  /** Stream for jitter. */
  replicationRng: number;
  nextId: number;
  nodes: NodeState[];
  clients: ClientState[];
  /** Index is id - 1. */
  writes: Write[];
  /** Ids of sync writes waiting for enough followers. */
  unacked: number[];
  leaderA: number | null;
  leaderB: number | null;
  partitioned: boolean;
  promotionAt: number | null;
  totals: {
    writesSent: number;
    readsSent: number;
    writesAcked: number;
    writesRefused: number;
    reads: number;
    staleReads: number;
    lostWrites: number;
    conflicts: number;
    latencySum: number;
    maxLatency: number;
  };
  history: TickStats[];
};

export function validateSettings(settings: Settings): void {
  const fail = (message: string): never => {
    throw new Error(`Invalid settings: ${message}`);
  };
  const whole = (v: number, min: number) => Number.isInteger(v) && v >= min;
  const chance = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
  if (!Number.isFinite(settings.seed)) fail('seed must be a number');
  if (!whole(settings.ticks, 1)) fail('ticks must be a positive whole number');
  if (!whole(settings.followers, 1)) fail('at least one follower is needed');
  if (settings.followerLags.length !== settings.followers)
    fail('there must be one lag per follower');
  settings.followerLags.forEach((lag, i) => {
    if (!whole(lag, 0))
      fail(`follower ${i + 1} lag must be a whole number of ticks, 0 or more`);
  });
  if (!whole(settings.jitter, 0))
    fail('jitter must be a whole number of ticks, 0 or more');
  if (settings.mode !== 'async' && settings.mode !== 'sync')
    fail('mode must be async or sync');
  if (
    settings.mode === 'sync' &&
    (!whole(settings.syncFollowers, 1) ||
      settings.syncFollowers > settings.followers)
  )
    fail(
      `synchronous replication needs between 1 and ${settings.followers} followers to confirm, got ${settings.syncFollowers}`,
    );
  if (!whole(settings.clients, 1)) fail('at least one client is needed');
  if (!chance(settings.writeChance)) fail('write chance must be 0 to 1');
  if (!chance(settings.readChance)) fail('read chance must be 0 to 1');
  if (
    !['leader', 'anyFollower', 'readYourOwnWrites'].includes(
      settings.readRouting,
    )
  )
    fail('unknown read routing');
  if (!whole(settings.readYourWritesWindow, 0))
    fail('read-your-own-writes window must be 0 or more ticks');
  if (!whole(settings.promotionDelay, 0))
    fail('promotion delay must be 0 or more ticks');
  if (
    settings.promoteTarget !== 'mostCaughtUp' &&
    (!whole(settings.promoteTarget, 1) ||
      settings.promoteTarget > settings.followers)
  )
    fail('promote target must be mostCaughtUp or a follower number');
  if (settings.failure && settings.partition)
    fail('use either a leader failure or a partition, not both');
  if (settings.failure && !whole(settings.failure.tick, 1))
    fail('failure tick must be a positive whole number');
  if (settings.partition) {
    const p = settings.partition;
    if (!whole(p.tick, 1))
      fail('partition tick must be a positive whole number');
    if (
      p.healTick !== undefined &&
      (!whole(p.healTick, 1) || p.healTick <= p.tick)
    )
      fail('partition must heal after it starts');
    if (settings.followers < 2) fail('a partition needs at least 2 followers');
    if (settings.clients < 2) fail('a partition needs at least 2 clients');
  }
}

/** Followers that stay with the leader in a partition, so the other side holds a majority. */
function leaderSideFollowers(followers: number): number {
  return Math.max(0, Math.ceil((followers - 1) / 2) - 1);
}

function clientSide(state: RunState, client: number): Side {
  return state.partitioned && client % 2 === 1 ? 'b' : 'a';
}

function leaderOf(state: RunState, side: Side): number | null {
  return side === 'a' ? state.leaderA : state.leaderB;
}

export function createRun(settings: Settings): RunState {
  validateSettings(settings);
  const seed = settings.seed >>> 0;
  return {
    settings,
    tick: 0,
    clientRng: seed,
    replicationRng: (seed ^ 0x9e3779b9) >>> 0,
    nextId: 1,
    nodes: Array.from({ length: settings.followers + 1 }, () => ({
      alive: true,
      side: 'a' as Side,
      log: [],
      have: {},
      pending: [],
      lastApplyAt: 0,
    })),
    clients: Array.from({ length: settings.clients }, () => ({
      lastAcked: null,
      lastWriteTick: null,
    })),
    writes: [],
    unacked: [],
    leaderA: 0,
    leaderB: null,
    partitioned: false,
    promotionAt: null,
    totals: {
      writesSent: 0,
      readsSent: 0,
      writesAcked: 0,
      writesRefused: 0,
      reads: 0,
      staleReads: 0,
      lostWrites: 0,
      conflicts: 0,
      latencySum: 0,
      maxLatency: 0,
    },
    history: [],
  };
}

export function isComplete(state: RunState): boolean {
  return state.tick >= state.settings.ticks;
}

function copyLog(from: NodeState, to: NodeState, tick: number): void {
  to.log = [...from.log];
  to.have = { ...from.have };
  to.pending = [];
  to.lastApplyAt = tick;
}

function longestLog(state: RunState, candidates: number[]): number {
  let best = candidates[0]!;
  for (const n of candidates) {
    if (state.nodes[n]!.log.length > state.nodes[best]!.log.length) best = n;
  }
  return best;
}

export function step(state: RunState): RunState {
  // Copy only what step may change. History entries and write-less data are shared, not cloned.
  const s: RunState = {
    ...state,
    nodes: state.nodes.map((n) => ({
      ...n,
      log: n.log.slice(),
      have: { ...n.have },
      pending: n.pending.slice(),
    })),
    clients: state.clients.map((c) => ({ ...c })),
    writes: state.writes.map((w) => ({ ...w })),
    unacked: state.unacked.slice(),
    totals: { ...state.totals },
  };
  const { settings } = s;
  const t = ++s.tick;
  let acked = 0;
  let refused = 0;
  let writesSent = 0;
  let readsSent = 0;
  let reads = 0;
  let stale = 0;
  let lost = 0;
  let conflicts = 0;

  const ack = (w: Write) => {
    w.ackedAt = t;
    acked++;
    const latency = t - w.tick;
    s.totals.latencySum += latency;
    s.totals.maxLatency = Math.max(s.totals.maxLatency, latency);
    s.clients[w.client]!.lastAcked = w.id;
  };
  const markLost = (oldLeader: number, newLeader: number) => {
    const have = s.nodes[newLeader]!.have;
    for (const w of s.writes) {
      if (
        w.leader === oldLeader &&
        w.ackedAt !== null &&
        !w.lost &&
        !have[w.id]
      ) {
        w.lost = true;
        lost++;
      }
    }
  };
  const dropUnacked = (leader: number) => {
    for (const w of s.writes) {
      if (w.leader === leader && w.ackedAt === null) w.dropped = true;
    }
    s.unacked = s.unacked.filter((id) => !s.writes[id - 1]!.dropped);
  };
  const choose = (candidates: number[]): number => {
    const target = settings.promoteTarget;
    if (target !== 'mostCaughtUp' && candidates.includes(target)) return target;
    return longestLog(s, candidates);
  };

  // Events.
  if (settings.failure && t === settings.failure.tick && s.leaderA !== null) {
    const dead = s.leaderA;
    s.nodes[dead]!.alive = false;
    for (const n of s.nodes) n.pending = [];
    dropUnacked(dead);
    s.leaderA = null;
    s.promotionAt = t + settings.promotionDelay;
  }
  if (settings.partition && t === settings.partition.tick) {
    const keep = leaderSideFollowers(settings.followers);
    s.partitioned = true;
    s.nodes.forEach((n, i) => {
      n.side = i <= keep ? 'a' : 'b';
      if (n.side === 'b') n.pending = [];
    });
    s.promotionAt = t + settings.promotionDelay;
    if (!settings.autoPromoteWithoutMajority && s.leaderA !== null) {
      dropUnacked(s.leaderA);
      s.leaderA = null;
    }
  }
  if (s.promotionAt !== null && t >= s.promotionAt) {
    s.promotionAt = null;
    if (!s.partitioned) {
      const candidates = s.nodes.flatMap((n, i) => (n.alive ? [i] : []));
      const chosen = choose(candidates);
      markLost(0, chosen);
      s.nodes.forEach((n, i) => {
        if (n.alive && i !== chosen) copyLog(s.nodes[chosen]!, n, t);
      });
      s.leaderA = chosen;
    } else {
      const candidates = s.nodes.flatMap((n, i) =>
        n.alive && n.side === 'b' ? [i] : [],
      );
      const chosen = choose(candidates);
      s.nodes.forEach((n, i) => {
        if (n.side === 'b' && i !== chosen) copyLog(s.nodes[chosen]!, n, t);
      });
      s.nodes[chosen]!.pending = [];
      s.leaderB = chosen;
      if (!settings.autoPromoteWithoutMajority) markLost(0, chosen);
    }
  }
  if (settings.partition?.healTick === t && s.partitioned) {
    s.promotionAt = null;
    if (s.leaderB !== null) {
      markLost(0, s.leaderB);
      dropUnacked(0);
      s.leaderA = s.leaderB;
      s.leaderB = null;
    } else if (s.leaderA === null) {
      s.leaderA = 0;
    }
    const leader = s.leaderA!;
    s.nodes.forEach((n, i) => {
      n.side = 'a';
      if (n.alive && i !== leader) copyLog(s.nodes[leader]!, n, t);
    });
    s.partitioned = false;
  }

  // Clients.
  const replicate = (leader: number, id: number) => {
    const from = s.nodes[leader]!;
    s.nodes.forEach((n, i) => {
      if (i === leader || !n.alive || n.side !== from.side) return;
      const lag =
        settings.followerLags[
          (i - 1 + settings.followers) % settings.followers
        ]!;
      const r = nextRandom(s.replicationRng);
      s.replicationRng = r.state;
      const jitter = Math.floor(r.value * (settings.jitter + 1));
      const applyAt = Math.max(n.lastApplyAt, t + lag + jitter);
      n.lastApplyAt = applyAt;
      n.pending.push({ id, applyAt });
    });
  };
  for (let c = 0; c < settings.clients; c++) {
    const draws: number[] = [];
    for (let k = 0; k < 3; k++) {
      const r = nextRandom(s.clientRng);
      s.clientRng = r.state;
      draws.push(r.value);
    }
    const [wU, rU, pU] = draws as [number, number, number];
    const side = clientSide(s, c);
    const leader = leaderOf(s, side);
    const client = s.clients[c]!;
    if (wU < settings.writeChance) {
      writesSent++;
      if (leader === null) {
        refused++;
      } else {
        const w: Write = {
          id: s.nextId++,
          client: c,
          tick: t,
          leader,
          side,
          ackedAt: null,
          lost: false,
          dropped: false,
        };
        s.writes.push(w);
        const node = s.nodes[leader]!;
        node.log.push(w.id);
        node.have[w.id] = true;
        replicate(leader, w.id);
        client.lastWriteTick = t;
        if (s.leaderA !== null && s.leaderB !== null) conflicts++;
        if (settings.mode === 'async') ack(w);
        else s.unacked.push(w.id);
      }
    }
    if (rU < settings.readChance) {
      readsSent++;
      const followers = s.nodes.flatMap((n, i) =>
        n.alive && n.side === side && i !== leader ? [i] : [],
      );
      const pick = (list: number[]) => list[Math.floor(pU * list.length)]!;
      let target: number | null = null;
      if (settings.readRouting === 'leader') {
        target = leader;
      } else if (settings.readRouting === 'anyFollower') {
        target = followers.length > 0 ? pick(followers) : leader;
      } else if (
        client.lastWriteTick !== null &&
        t - client.lastWriteTick <= settings.readYourWritesWindow
      ) {
        target = leader ?? (followers.length > 0 ? pick(followers) : null);
      } else {
        const last = client.lastAcked;
        const caughtUp = followers.filter(
          (i) => last === null || s.nodes[i]!.have[last],
        );
        target = caughtUp.length > 0 ? pick(caughtUp) : leader;
      }
      if (target !== null) {
        reads++;
        const last = client.lastAcked;
        if (last !== null && !s.nodes[target]!.have[last]) stale++;
      }
    }
  }

  // Replication.
  for (const n of s.nodes) {
    if (!n.alive) continue;
    while (n.pending.length > 0 && n.pending[0]!.applyAt <= t) {
      const { id } = n.pending.shift()!;
      if (!n.have[id]) {
        n.have[id] = true;
        n.log.push(id);
      }
    }
  }

  // Synchronous acknowledgements.
  if (settings.mode === 'sync') {
    s.unacked = s.unacked.filter((id) => {
      const w = s.writes[id - 1]!;
      const side = s.nodes[w.leader]!.side;
      const count = s.nodes.filter(
        (n, i) => i !== w.leader && n.alive && n.side === side && n.have[id],
      ).length;
      if (count >= settings.syncFollowers) {
        ack(w);
        return false;
      }
      return true;
    });
  }

  // Stats.
  const lag: FollowerLag[] = [];
  s.nodes.forEach((n, i) => {
    if (!n.alive || i === s.leaderA || i === s.leaderB) return;
    const sameSide = s.nodes.flatMap((m, j) =>
      m.alive && m.side === n.side ? [j] : [],
    );
    const refIndex = leaderOf(s, n.side) ?? longestLog(s, sameSide);
    if (refIndex === i) return;
    const ref = s.nodes[refIndex]!;
    const behind = Math.max(0, ref.log.length - n.log.length);
    const oldest = behind > 0 ? s.writes[ref.log[n.log.length]! - 1]! : null;
    lag.push({
      node: i,
      writesBehind: behind,
      ticksBehind: oldest ? t - oldest.tick : 0,
    });
  });
  const totals = s.totals;
  totals.writesSent += writesSent;
  totals.readsSent += readsSent;
  totals.writesAcked += acked;
  totals.writesRefused += refused;
  totals.reads += reads;
  totals.staleReads += stale;
  totals.lostWrites += lost;
  totals.conflicts += conflicts;
  s.history = [
    ...state.history,
    {
      tick: t,
      writesSent,
      readsSent,
      writesAcked: acked,
      writesRefused: refused,
      reads,
      staleReads: stale,
      lostWrites: lost,
      conflicts,
      averageWriteLatency:
        totals.writesAcked > 0 ? totals.latencySum / totals.writesAcked : 0,
      maxWriteLatency: totals.maxLatency,
      lag,
      leaders: { a: s.leaderA, b: s.leaderB },
    },
  ];
  return s;
}

export function runSimulation(settings: Settings): RunState {
  let state = createRun(settings);
  while (!isComplete(state)) state = step(state);
  return state;
}

export function getTotals(state: RunState): Totals {
  const t = state.totals;
  return {
    writesSent: t.writesSent,
    readsSent: t.readsSent,
    writesAcked: t.writesAcked,
    writesRefused: t.writesRefused,
    reads: t.reads,
    staleReads: t.staleReads,
    lostWrites: t.lostWrites,
    conflicts: t.conflicts,
    averageWriteLatency: t.writesAcked > 0 ? t.latencySum / t.writesAcked : 0,
    maxWriteLatency: t.maxLatency,
  };
}
