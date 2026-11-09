import { nextRandom } from '@/domain/simulation/rng';

export type Client = {
  /** Average first attempts per tick. Fractions are allowed (0.5 is one every other tick on average). */
  rate: number;
};

export type Burst = {
  /** Index of the client that sends the extra requests. */
  client: number;
  /** First tick of the burst (0-based). */
  startTick: number;
  /** How many ticks the burst lasts. 1 means all extra requests land on one tick. */
  durationTicks: number;
  /** Extra first attempts per tick while the burst lasts. */
  extraPerTick: number;
};

export type LimiterConfig =
  | {
      algorithm: 'tokenBucket';
      /** Tokens the bucket holds. It starts full. */
      capacity: number;
      /** Tokens added per tick. */
      refillPerTick: number;
    }
  | {
      algorithm: 'leakyBucket';
      /** Requests that can wait in the bucket. Overflow is rejected (429). */
      queueSize: number;
      /** Requests let out per tick. Fractions are allowed. */
      drainPerTick: number;
    }
  | {
      algorithm: 'fixedWindow';
      /** Requests allowed per window. */
      limit: number;
      /** Window length in ticks. */
      windowTicks: number;
    };

export type LimiterScope = 'global' | 'perClient';

export type RetryConfig =
  | { mode: 'none' }
  | { mode: 'immediate'; maxAttempts: number }
  | {
      mode: 'backoff';
      /** Total attempts including the first one. */
      maxAttempts: number;
      /** Delay ceiling after the first failure, in ticks. It doubles each failure. */
      baseDelayTicks: number;
      maxDelayTicks: number;
    };

export type ServerConfig = {
  /** Requests processed at the same time. */
  concurrency: number;
  /** Ticks one request takes once it starts. */
  processingTicks: number;
  /** When on, requests beyond maxQueue get 503 right away instead of waiting. */
  loadShedding: boolean;
  /** Longest server queue allowed while load shedding is on. */
  maxQueue: number;
};

export type Settings = {
  seed: number;
  /** Length of the run in ticks (ticks 0 to ticks - 1). */
  ticks: number;
  clients: readonly Client[];
  burst?: Burst;
  limiter: LimiterConfig;
  scope: LimiterScope;
  server: ServerConfig;
  retry: RetryConfig;
};

export const DEFAULT_SETTINGS: Settings = {
  seed: 7,
  ticks: 200,
  clients: [{ rate: 1 }, { rate: 1 }, { rate: 1 }],
  limiter: { algorithm: 'tokenBucket', capacity: 10, refillPerTick: 4 },
  scope: 'global',
  server: {
    concurrency: 4,
    processingTicks: 1,
    loadShedding: false,
    maxQueue: 20,
  },
  retry: { mode: 'none' },
};

/**
 * Presets. The UI shows them as scenarios; all other values come from
 * DEFAULT_SETTINGS.
 */
export const PRESETS = {
  /**
   * Two quiet clients (0.5 per tick each) and a 30 request burst from client 0
   * at tick 20. The bucket holds 10 and refills 1 per tick, so most of the
   * burst is rejected and retries with backoff come back later.
   */
  burstBiggerThanBucket: {
    ...DEFAULT_SETTINGS,
    ticks: 120,
    clients: [{ rate: 0.5 }, { rate: 0.5 }],
    burst: { client: 0, startTick: 20, durationTicks: 1, extraPerTick: 30 },
    limiter: { algorithm: 'tokenBucket', capacity: 10, refillPerTick: 1 },
    retry: {
      mode: 'backoff',
      maxAttempts: 4,
      baseDelayTicks: 2,
      maxDelayTicks: 32,
    },
  },
  /**
   * Client 0 sends 10 per tick, three quiet clients send 1 per tick each.
   * One global bucket refills 8 per tick, so the noisy client crowds the
   * others out. Switch the scope to perClient to protect the quiet ones.
   */
  noisyClient: {
    ...DEFAULT_SETTINGS,
    clients: [{ rate: 10 }, { rate: 1 }, { rate: 1 }, { rate: 1 }],
    limiter: { algorithm: 'tokenBucket', capacity: 20, refillPerTick: 8 },
    scope: 'global',
    server: { ...DEFAULT_SETTINGS.server, concurrency: 16 },
  },
  /**
   * Five clients send 2 per tick each (10 total) against a fixed window of 20
   * requests per 5 ticks (4 per tick). Immediate retries (up to 5 attempts)
   * pile onto the overload.
   */
  retryStorm: {
    ...DEFAULT_SETTINGS,
    clients: [{ rate: 2 }, { rate: 2 }, { rate: 2 }, { rate: 2 }, { rate: 2 }],
    limiter: { algorithm: 'fixedWindow', limit: 20, windowTicks: 5 },
    retry: { mode: 'immediate', maxAttempts: 5 },
  },
  /**
   * Four clients send 1.5 per tick each (6 total). The limiter is wide open
   * and the server finishes 2 per tick (4 slots, 2 ticks each), so it is
   * overloaded. Shedding is on with a queue of 10; the UI compares it with
   * loadShedding set to false.
   */
  loadShedding: {
    ...DEFAULT_SETTINGS,
    clients: [{ rate: 1.5 }, { rate: 1.5 }, { rate: 1.5 }, { rate: 1.5 }],
    limiter: { algorithm: 'tokenBucket', capacity: 100, refillPerTick: 100 },
    server: {
      concurrency: 4,
      processingTicks: 2,
      loadShedding: true,
      maxQueue: 10,
    },
  },
} as const satisfies Record<string, Settings>;

export type TickStats = {
  tick: number;
  /** All attempts that reached the limiter this tick (first attempts and retries). */
  sent: number;
  firstAttempts: number;
  /** Requests that passed the limiter and got into the server (running or queued). */
  accepted: number;
  /** Rejected by the limiter (429). */
  rejected: number;
  /** Rejected by the server queue limit (503). */
  shed: number;
  retries: number;
  inFlight: number;
  serverQueue: number;
  /** Requests waiting inside a leaky bucket. Always 0 for other algorithms. */
  limiterQueue: number;
  /** Over all requests completed so far, first attempt to completion, in ticks. */
  averageLatency: number;
  maxLatency: number;
  firstAttemptsByClient: number[];
  acceptedByClient: number[];
};

export function validateSettings(settings: Settings): void {
  const fail = (message: string): never => {
    throw new Error(`Invalid settings: ${message}`);
  };
  const whole = (v: number, min: number) => Number.isInteger(v) && v >= min;
  const num = (v: number, min: number) => Number.isFinite(v) && v >= min;

  if (!Number.isFinite(settings.seed)) fail('seed must be a number');
  if (!whole(settings.ticks, 1)) fail('ticks must be a positive whole number');
  if (settings.clients.length < 1) fail('at least one client is needed');
  settings.clients.forEach((c, i) => {
    if (!num(c.rate, 0)) fail(`client ${i} rate must not be negative`);
  });
  const b = settings.burst;
  if (b) {
    if (!whole(b.client, 0) || b.client >= settings.clients.length)
      fail('the burst client does not exist');
    if (!whole(b.startTick, 0)) fail('burst start must be a whole tick');
    if (!whole(b.durationTicks, 1))
      fail('burst duration must be a positive whole number');
    if (!num(b.extraPerTick, 0)) fail('burst size must not be negative');
  }
  const l = settings.limiter;
  if (l.algorithm === 'tokenBucket') {
    if (!num(l.capacity, 1)) fail('token bucket capacity must be at least 1');
    if (!num(l.refillPerTick, 0)) fail('refill rate must not be negative');
  } else if (l.algorithm === 'leakyBucket') {
    if (!whole(l.queueSize, 1))
      fail('leaky bucket queue size must be a positive whole number');
    if (!num(l.drainPerTick, 0)) fail('drain rate must not be negative');
  } else if (l.algorithm === 'fixedWindow') {
    if (!whole(l.limit, 0)) fail('window limit must not be negative');
    if (!whole(l.windowTicks, 1))
      fail('window length must be a positive whole number');
  } else {
    fail('unknown limiter algorithm');
  }
  if (settings.scope !== 'global' && settings.scope !== 'perClient')
    fail('unknown limiter scope');
  const s = settings.server;
  if (!whole(s.concurrency, 1))
    fail('server concurrency must be a positive whole number');
  if (!whole(s.processingTicks, 1))
    fail('processing time must be a positive whole number of ticks');
  if (!whole(s.maxQueue, 0)) fail('max queue must not be negative');
  const r = settings.retry;
  if (r.mode === 'immediate' || r.mode === 'backoff') {
    if (!whole(r.maxAttempts, 1))
      fail('max attempts must be a positive whole number');
  }
  if (r.mode === 'backoff') {
    if (!whole(r.baseDelayTicks, 1))
      fail('backoff base delay must be a positive whole number');
    if (!whole(r.maxDelayTicks, 1))
      fail('backoff max delay must be a positive whole number');
  } else if (r.mode !== 'none' && r.mode !== 'immediate') {
    fail('unknown retry mode');
  }
}

type Req = { client: number; firstTick: number; attempt: number };
type Verdict = 'pass' | 'queued' | 'reject';

type Limiter = {
  beginTick(tick: number): void;
  offer(req: Req): Verdict;
  /** Requests a leaky bucket lets out this tick. Empty for other algorithms. */
  drain(): Req[];
  queued(): number;
};

function createLimiter(config: LimiterConfig): Limiter {
  if (config.algorithm === 'tokenBucket') {
    let tokens = config.capacity;
    return {
      beginTick: (tick) => {
        if (tick > 0)
          tokens = Math.min(config.capacity, tokens + config.refillPerTick);
      },
      offer: () => {
        if (tokens >= 1) {
          tokens -= 1;
          return 'pass';
        }
        return 'reject';
      },
      drain: () => [],
      queued: () => 0,
    };
  }
  if (config.algorithm === 'leakyBucket') {
    const queue: Req[] = [];
    let credit = 0;
    return {
      beginTick: () => {},
      offer: (req) => {
        if (queue.length >= config.queueSize) return 'reject';
        queue.push(req);
        return 'queued';
      },
      drain: () => {
        credit += config.drainPerTick;
        const n = Math.min(Math.floor(credit), queue.length);
        // Unused credit does not pile up while the bucket is empty.
        credit = queue.length > n ? credit - n : 0;
        return queue.splice(0, n);
      },
      queued: () => queue.length,
    };
  }
  let window = -1;
  let used = 0;
  return {
    beginTick: (tick) => {
      const w = Math.floor(tick / config.windowTicks);
      if (w !== window) {
        window = w;
        used = 0;
      }
    },
    offer: () => {
      if (used < config.limit) {
        used += 1;
        return 'pass';
      }
      return 'reject';
    },
    drain: () => [],
    queued: () => 0,
  };
}

/**
 * Runs the whole simulation and returns one stats entry per tick.
 * First attempts use their own random stream, and backoff jitter another, so
 * changing the limiter, server or retry settings never changes first attempts.
 */
export function runSimulation(settings: Settings): TickStats[] {
  validateSettings(settings);
  const { clients, server, retry } = settings;
  let arrivalRng = settings.seed >>> 0;
  let jitterRng = (settings.seed ^ 0x9e3779b9) >>> 0;

  const limiters =
    settings.scope === 'global'
      ? [createLimiter(settings.limiter)]
      : clients.map(() => createLimiter(settings.limiter));
  const limiterFor = (client: number) =>
    settings.scope === 'global' ? limiters[0]! : limiters[client]!;

  const retries: { req: Req; dueTick: number }[] = [];
  const queue: Req[] = [];
  const running: { req: Req; finishTick: number }[] = [];
  let latencyTotal = 0;
  let latencyCount = 0;
  let latencyMax = 0;
  const result: TickStats[] = [];

  for (let tick = 0; tick < settings.ticks; tick++) {
    const acceptedByClient = clients.map(() => 0);
    const firstAttemptsByClient = clients.map(() => 0);
    let rejected = 0;
    let shed = 0;
    let accepted = 0;

    // 1. Finish work, then use the freed slots.
    for (let i = running.length - 1; i >= 0; i--) {
      const r = running[i]!;
      if (r.finishTick <= tick) {
        const latency = tick - r.req.firstTick;
        latencyTotal += latency;
        latencyCount += 1;
        latencyMax = Math.max(latencyMax, latency);
        running.splice(i, 1);
      }
    }
    while (running.length < server.concurrency && queue.length > 0) {
      running.push({
        req: queue.shift()!,
        finishTick: tick + server.processingTicks,
      });
    }

    for (const l of limiters) l.beginTick(tick);

    const failed = (req: Req) => {
      if (retry.mode === 'none' || req.attempt >= retry.maxAttempts) return;
      let delay = 1;
      if (retry.mode === 'backoff') {
        const ceiling = Math.min(
          retry.maxDelayTicks,
          retry.baseDelayTicks * 2 ** (req.attempt - 1),
        );
        const draw = nextRandom(jitterRng);
        jitterRng = draw.state;
        delay = 1 + Math.floor(draw.value * ceiling);
      }
      retries.push({
        req: { ...req, attempt: req.attempt + 1 },
        dueTick: tick + delay,
      });
    };

    const admit = (req: Req) => {
      if (running.length < server.concurrency) {
        running.push({ req, finishTick: tick + server.processingTicks });
      } else if (server.loadShedding && queue.length >= server.maxQueue) {
        shed += 1;
        failed(req);
        return;
      } else {
        queue.push(req);
      }
      accepted += 1;
      acceptedByClient[req.client]! += 1;
    };

    // 2. Collect attempts: due retries first, then first attempts.
    const due: Req[] = [];
    for (let i = 0; i < retries.length;) {
      if (retries[i]!.dueTick <= tick) due.push(retries.splice(i, 1)[0]!.req);
      else i++;
    }
    const first: Req[] = [];
    clients.forEach((c, client) => {
      // One draw per client per tick, whatever the rate, to keep the stream aligned.
      const draw = nextRandom(arrivalRng);
      arrivalRng = draw.state;
      let count = Math.floor(c.rate) + (draw.value < c.rate % 1 ? 1 : 0);
      const b = settings.burst;
      if (
        b &&
        b.client === client &&
        tick >= b.startTick &&
        tick < b.startTick + b.durationTicks
      )
        count += b.extraPerTick;
      firstAttemptsByClient[client] = count;
      for (let k = 0; k < count; k++)
        first.push({ client, firstTick: tick, attempt: 1 });
    });

    // 3. Limiter decides.
    for (const req of [...due, ...first]) {
      const verdict = limiterFor(req.client).offer(req);
      if (verdict === 'pass') admit(req);
      else if (verdict === 'reject') {
        rejected += 1;
        failed(req);
      }
    }
    // 4. Leaky buckets let requests out.
    for (const l of limiters) for (const req of l.drain()) admit(req);

    result.push({
      tick,
      sent: due.length + first.length,
      firstAttempts: first.length,
      accepted,
      rejected,
      shed,
      retries: due.length,
      inFlight: running.length,
      serverQueue: queue.length,
      limiterQueue: limiters.reduce((sum, l) => sum + l.queued(), 0),
      averageLatency: latencyCount === 0 ? 0 : latencyTotal / latencyCount,
      maxLatency: latencyMax,
      firstAttemptsByClient,
      acceptedByClient,
    });
  }
  return result;
}
