import { nextRandom } from '@/domain/simulation/rng';

export const ALGORITHMS = [
  'roundRobin',
  'leastConnections',
  'weightedRoundRobin',
  'weightedLeastConnections',
] as const;
export type Algorithm = (typeof ALGORITHMS)[number];

export type ServerSettings = {
  /** Work points done per tick. */
  speed: number;
  /** Share of traffic this server should get under the weighted algorithms. */
  weight: number;
};

export type CostOption = {
  /** Work points a request of this kind needs. */
  cost: number;
  /** Relative chance of this kind. */
  weight: number;
};

export type ServerDown = {
  /** Index of the server that goes down. */
  server: number;
  /** Tick at which it goes down (1-based, inside the run). */
  atTick: number;
  /** Tick at which it takes requests again. Omit to keep it down. */
  backAtTick?: number;
};

export type Settings = {
  algorithm: Algorithm;
  seed: number;
  /** Length of the run in ticks. */
  ticks: number;
  servers: readonly ServerSettings[];
  /** Multiplier on the arrival rate. 1 is the default load profile. */
  arrivalMultiplier: number;
  costMix: readonly CostOption[];
  /** Arrivals per second at the edges of the run and at the peak. */
  baseRate: number;
  peakRate: number;
  peakAtTick: number;
  peakHalfWidthTicks: number;
  ticksPerSecond: number;
  serverDown?: ServerDown;
};

export const DEFAULT_SETTINGS: Settings = {
  algorithm: 'roundRobin',
  seed: 7,
  ticks: 600,
  // fast, steady, slow
  servers: [
    { speed: 4, weight: 4 },
    { speed: 2, weight: 2 },
    { speed: 1, weight: 1 },
  ],
  arrivalMultiplier: 1,
  costMix: [
    { cost: 4, weight: 45 },
    { cost: 14, weight: 30 },
    { cost: 28, weight: 17 },
    { cost: 64, weight: 8 },
  ],
  baseRate: 1.2,
  peakRate: 5.6,
  peakAtTick: 360,
  peakHalfWidthTicks: 300,
  ticksPerSecond: 10,
};

export type Request = {
  id: number;
  cost: number;
  arrivedAt: number;
};

export type Server = {
  speed: number;
  weight: number;
  up: boolean;
  serving: { request: Request; remaining: number } | null;
  queue: Request[];
  /** Requests the balancer sent to this server. */
  received: number;
  finished: number;
  /** Requests lost because this server went down while holding them. */
  failed: number;
};

export type RunState = {
  settings: Settings;
  tick: number;
  rng: number;
  nextId: number;
  /** Next position for round robin. */
  nextTurn: number;
  /** Running totals for smooth weighted round robin. */
  credits: number[];
  arrivals: number;
  finished: number;
  failed: number;
  /** Arrived but not sent anywhere yet (no server is up). */
  unrouted: Request[];
  servers: Server[];
  waitTotal: number;
  waitCount: number;
  waitMax: number;
};

export type ServerStats = {
  queue: number;
  active: number;
  up: boolean;
  received: number;
  finished: number;
  failed: number;
};

export type Stats = {
  tick: number;
  arrivals: number;
  finished: number;
  failed: number;
  /** Requests that have not started service: in a queue or not routed yet. */
  waiting: number;
  /** Ticks from arrival to start of service, over requests that started. */
  averageWait: number;
  maxWait: number;
  servers: ServerStats[];
};

export function validateSettings(settings: Settings): void {
  const fail = (message: string): never => {
    throw new Error(`Invalid settings: ${message}`);
  };
  if (!ALGORITHMS.includes(settings.algorithm)) fail('unknown algorithm');
  if (!Number.isFinite(settings.seed)) fail('seed must be a number');
  if (!Number.isInteger(settings.ticks) || settings.ticks < 1)
    fail('ticks must be a positive whole number');
  if (settings.servers.length < 1) fail('at least one server is needed');
  settings.servers.forEach((s, i) => {
    if (!Number.isFinite(s.speed) || s.speed <= 0)
      fail(`server ${i} speed must be greater than 0`);
    if (!Number.isFinite(s.weight) || s.weight <= 0)
      fail(`server ${i} weight must be greater than 0`);
  });
  if (
    !Number.isFinite(settings.arrivalMultiplier) ||
    settings.arrivalMultiplier < 0
  )
    fail('arrival rate multiplier must not be negative');
  if (settings.costMix.length < 1) fail('request cost mix must not be empty');
  settings.costMix.forEach((c, i) => {
    if (!Number.isFinite(c.cost) || c.cost <= 0)
      fail(`cost option ${i} cost must be greater than 0`);
    if (!Number.isFinite(c.weight) || c.weight < 0)
      fail(`cost option ${i} weight must not be negative`);
  });
  if (settings.costMix.reduce((sum, c) => sum + c.weight, 0) <= 0)
    fail('request cost mix needs a positive total weight');
  if (!Number.isFinite(settings.ticksPerSecond) || settings.ticksPerSecond <= 0)
    fail('ticks per second must be greater than 0');
  if (
    !Number.isFinite(settings.baseRate) ||
    !Number.isFinite(settings.peakRate) ||
    settings.baseRate < 0 ||
    settings.peakRate < 0
  )
    fail('arrival rates must not be negative');
  if (
    !Number.isFinite(settings.peakHalfWidthTicks) ||
    settings.peakHalfWidthTicks <= 0
  )
    fail('peak width must be greater than 0');
  const down = settings.serverDown;
  if (down) {
    if (
      !Number.isInteger(down.server) ||
      down.server < 0 ||
      down.server >= settings.servers.length
    )
      fail('the server that goes down does not exist');
    if (
      !Number.isInteger(down.atTick) ||
      down.atTick < 1 ||
      down.atTick > settings.ticks
    )
      fail('down tick must be inside the run');
    if (down.backAtTick !== undefined) {
      if (
        !Number.isInteger(down.backAtTick) ||
        down.backAtTick <= down.atTick ||
        down.backAtTick > settings.ticks
      )
        fail('back tick must be after the down tick and inside the run');
    }
  }
}

/** Create a run. Throws when the settings are invalid. */
export function createRun(settings: Settings): RunState {
  validateSettings(settings);
  return {
    settings,
    tick: 0,
    rng: settings.seed >>> 0,
    nextId: 1,
    nextTurn: 0,
    credits: settings.servers.map(() => 0),
    arrivals: 0,
    finished: 0,
    failed: 0,
    unrouted: [],
    servers: settings.servers.map((s) => ({
      speed: s.speed,
      weight: s.weight,
      up: true,
      serving: null,
      queue: [],
      received: 0,
      finished: 0,
      failed: 0,
    })),
    waitTotal: 0,
    waitCount: 0,
    waitMax: 0,
  };
}

function arrivalRate(settings: Settings, tick: number): number {
  const distance = Math.abs(tick - settings.peakAtTick);
  const lift = Math.max(0, 1 - distance / settings.peakHalfWidthTicks);
  return (
    (settings.baseRate + (settings.peakRate - settings.baseRate) * lift) *
    settings.arrivalMultiplier
  );
}

/** Requests a server holds: being served plus queued. */
export function load(server: Server): number {
  return server.queue.length + (server.serving ? 1 : 0);
}

function replaceAt<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((existing, i) => (i === index ? item : existing));
}

/** Lowest index with the smallest score among servers that are up. */
function lowestScore(
  servers: readonly Server[],
  score: (server: Server) => number,
): number {
  let best = -1;
  let bestScore = Infinity;
  servers.forEach((server, i) => {
    if (!server.up) return;
    const value = score(server);
    if (value < bestScore) {
      best = i;
      bestScore = value;
    }
  });
  return best;
}

/** Pick a server for the next request. Returns the index, or -1 when none is up. */
function choose(state: RunState): {
  index: number;
  nextTurn: number;
  credits: number[];
} {
  const { servers, settings } = state;
  const keep = { nextTurn: state.nextTurn, credits: state.credits };
  switch (settings.algorithm) {
    case 'roundRobin': {
      for (let step = 0; step < servers.length; step += 1) {
        const index = (state.nextTurn + step) % servers.length;
        if (servers[index]!.up) {
          return { ...keep, index, nextTurn: index + 1 };
        }
      }
      return { ...keep, index: -1 };
    }
    case 'leastConnections':
      return { ...keep, index: lowestScore(servers, load) };
    case 'weightedLeastConnections':
      return {
        ...keep,
        index: lowestScore(servers, (s) => load(s) / s.weight),
      };
    case 'weightedRoundRobin': {
      // Smooth weighted round robin: spreads each server's share through the cycle.
      const credits = state.credits.map((c, i) =>
        servers[i]!.up ? c + servers[i]!.weight : c,
      );
      let index = -1;
      credits.forEach((c, i) => {
        if (servers[i]!.up && (index < 0 || c > credits[index]!)) index = i;
      });
      if (index < 0) return { ...keep, index: -1 };
      const total = servers.reduce((sum, s) => sum + (s.up ? s.weight : 0), 0);
      return {
        ...keep,
        index,
        credits: replaceAt(credits, index, credits[index]! - total),
      };
    }
  }
}

function send(state: RunState, request: Request): RunState {
  const picked = choose(state);
  if (picked.index < 0) {
    return { ...state, unrouted: [...state.unrouted, request] };
  }
  const server = state.servers[picked.index]!;
  return {
    ...state,
    nextTurn: picked.nextTurn,
    credits: picked.credits,
    servers: replaceAt(state.servers, picked.index, {
      ...server,
      queue: [...server.queue, request],
      received: server.received + 1,
    }),
  };
}

/** Apply the server down and back events that happen at this tick. */
function applyOutage(state: RunState, now: number): RunState {
  const down = state.settings.serverDown;
  if (!down) return state;
  let next = state;
  if (now === down.atTick) {
    const server = next.servers[down.server]!;
    const lost = load(server);
    next = {
      ...next,
      failed: next.failed + lost,
      servers: replaceAt(next.servers, down.server, {
        ...server,
        up: false,
        serving: null,
        queue: [],
        failed: server.failed + lost,
      }),
    };
  }
  if (now === down.backAtTick) {
    next = {
      ...next,
      servers: replaceAt(next.servers, down.server, {
        ...next.servers[down.server]!,
        up: true,
      }),
    };
  }
  return next;
}

function maybeArrive(state: RunState, now: number): RunState {
  const { settings } = state;
  const roll = nextRandom(state.rng);
  const rate = arrivalRate(settings, now);
  if (roll.value >= rate / settings.ticksPerSecond) {
    return { ...state, rng: roll.state };
  }
  const pick = nextRandom(roll.state);
  const totalWeight = settings.costMix.reduce((sum, c) => sum + c.weight, 0);
  let target = pick.value * totalWeight;
  let option = settings.costMix[settings.costMix.length - 1]!;
  for (const candidate of settings.costMix) {
    if (target < candidate.weight) {
      option = candidate;
      break;
    }
    target -= candidate.weight;
  }
  const request: Request = {
    id: state.nextId,
    cost: option.cost,
    arrivedAt: now,
  };
  return send(
    {
      ...state,
      rng: pick.state,
      nextId: state.nextId + 1,
      arrivals: state.arrivals + 1,
    },
    request,
  );
}

type Work = { server: Server; finished: number; waited: number | null };

function work(server: Server, now: number): Work {
  if (!server.up) return { server, finished: 0, waited: null };
  let serving = server.serving;
  let queue = server.queue;
  let waited: number | null = null;
  if (!serving && queue.length > 0) {
    const [request, ...rest] = queue;
    serving = { request: request!, remaining: request!.cost };
    queue = rest;
    waited = now - request!.arrivedAt;
  }
  if (!serving) return { server, finished: 0, waited };
  const remaining = serving.remaining - server.speed;
  if (remaining <= 0) {
    return {
      server: {
        ...server,
        serving: null,
        queue,
        finished: server.finished + 1,
      },
      finished: 1,
      waited,
    };
  }
  return {
    server: { ...server, serving: { ...serving, remaining }, queue },
    finished: 0,
    waited,
  };
}

export function isComplete(state: RunState): boolean {
  return state.tick >= state.settings.ticks;
}

/** Advance the run by one tick. Does nothing once the run has its full length. */
export function step(state: RunState): RunState {
  if (isComplete(state)) return state;
  const now = state.tick + 1;
  // Random draws do not depend on the algorithm, so every algorithm sees the same arrivals.
  let next = applyOutage({ ...state, tick: now }, now);

  // Requests that had nowhere to go are sent first, oldest first.
  const held = next.unrouted;
  next = { ...next, unrouted: [] };
  for (const request of held) next = send(next, request);
  next = maybeArrive(next, now);

  let finished = 0;
  let waitTotal = next.waitTotal;
  let waitCount = next.waitCount;
  let waitMax = next.waitMax;
  const servers = next.servers.map((server) => {
    const result = work(server, now);
    finished += result.finished;
    if (result.waited !== null) {
      waitTotal += result.waited;
      waitCount += 1;
      waitMax = Math.max(waitMax, result.waited);
    }
    return result.server;
  });
  return {
    ...next,
    servers,
    finished: next.finished + finished,
    waitTotal,
    waitCount,
    waitMax,
  };
}

/** Run a whole simulation. */
export function runSimulation(settings: Settings): RunState {
  let state = createRun(settings);
  while (!isComplete(state)) state = step(state);
  return state;
}

export function getStats(state: RunState): Stats {
  const queued = state.servers.reduce((sum, s) => sum + s.queue.length, 0);
  return {
    tick: state.tick,
    arrivals: state.arrivals,
    finished: state.finished,
    failed: state.failed,
    waiting: queued + state.unrouted.length,
    averageWait: state.waitCount === 0 ? 0 : state.waitTotal / state.waitCount,
    maxWait: state.waitMax,
    servers: state.servers.map((s) => ({
      queue: s.queue.length,
      active: s.serving ? 1 : 0,
      up: s.up,
      received: s.received,
      finished: s.finished,
      failed: s.failed,
    })),
  };
}
