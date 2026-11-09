import { nextRandom } from '@/domain/simulation/rng';

/**
 * Cache-aside simulation: requests read keys through a cache in front of a database.
 *
 * Order inside one tick: events, writes, read arrivals, then the database serves
 * its queue. A miss therefore takes at least 1 tick; a hit takes 0 ticks.
 * The run state is mutated by `stepCache` (it is a simulation clock, not a value).
 */

export const EVICTIONS = ['lru', 'lfu'] as const;
export type Eviction = (typeof EVICTIONS)[number];

export type HotKeyExpiry = {
  /** Key to expire. Key 0 is the most popular key. */
  key: number;
  /** Tick at which its cache entry is removed (1-based, inside the run). */
  atTick: number;
};

export type CacheSettings = {
  seed: number;
  /** Length of the run in ticks. */
  ticks: number;
  /** Number of distinct keys. Key 0 is the hottest, the last key the coldest. */
  keyCount: number;
  /** Reads per tick. A fraction is a chance of one more read. */
  readsPerTick: number;
  /** Zipf exponent. 0 is uniform; 1 is a strong skew (a few hot keys). */
  skew: number;
  /** Keys with a rank below this count as hot in the cache view. */
  hotKeyCount: number;
  /** Writes per tick, to keys drawn with the same popularity. 0 means no writes. */
  writesPerTick: number;
  /** Cache size in keys. 0 means no cache. */
  cacheCapacity: number;
  eviction: Eviction;
  /** Ticks an entry lives after it is filled. */
  ttl: number;
  /** 0 to 1. Each TTL is shortened by a random share of up to this much. */
  ttlJitter: number;
  /** Database reads served per tick. Extra reads wait in a queue. */
  dbCapacity: number;
  /** A write removes the cached copy of its key. */
  invalidateOnWrite: boolean;
  /** Concurrent misses for one key wait on a single database read. */
  coalescing: boolean;
  /** Tick at which the cache is flushed. */
  restartAtTick?: number;
  hotKeyExpiry?: HotKeyExpiry;
};

export const DEFAULT_CACHE_SETTINGS: CacheSettings = {
  seed: 7,
  ticks: 400,
  keyCount: 1000,
  readsPerTick: 20,
  skew: 1,
  hotKeyCount: 10,
  writesPerTick: 0,
  cacheCapacity: 100,
  eviction: 'lru',
  ttl: 300,
  ttlJitter: 0,
  dbCapacity: 30,
  invalidateOnWrite: true,
  coalescing: false,
};

/** Named starting points for the chapter. Each is a full, plain settings object. */
export const CACHE_PRESETS = {
  /** Room for 10 keys out of 1000: most reads miss and the database works hard. */
  cacheTooSmall: { ...DEFAULT_CACHE_SETTINGS, cacheCapacity: 10 },
  /** The cache is flushed at tick 200: reads fall back on the database. */
  cacheRestart: { ...DEFAULT_CACHE_SETTINGS, restartAtTick: 200 },
  /** The hottest key (key 0) is removed at tick 200, with no coalescing. */
  hotKeyExpires: {
    ...DEFAULT_CACHE_SETTINGS,
    readsPerTick: 40,
    hotKeyExpiry: { key: 0, atTick: 200 },
    coalescing: false,
  },
  /** Writes happen but do not clear the cache, so reads can be stale until the TTL ends. */
  noInvalidationOnWrite: {
    ...DEFAULT_CACHE_SETTINGS,
    writesPerTick: 2,
    invalidateOnWrite: false,
    ttl: 100,
  },
} as const satisfies Record<string, CacheSettings>;

export type CacheEntryView = {
  key: number;
  hot: boolean;
  /** Version held by the cache. */
  version: number;
  /** True when the database has a newer version. */
  stale: boolean;
  uses: number;
};

export type CacheStats = {
  tick: number;
  hits: number;
  misses: number;
  /** hits / (hits + misses), or 0 when there were no reads. */
  hitRate: number;
  /** Database reads served this tick. */
  dbReads: number;
  /** Keys of the database reads served this tick. */
  dbReadKeys: number[];
  /** Database reads waiting after this tick. */
  dbQueue: number;
  /** Ticks from arrival to answer, over reads answered this tick. */
  averageLatency: number;
  maxLatency: number;
  /** Reads answered from a cache entry older than the database version. */
  staleReads: number;
  evictions: number;
  cacheSize: number;
  /** Most used cached keys, at most 10. */
  cacheView: CacheEntryView[];
};

type Entry = {
  version: number;
  expiresAt: number;
  uses: number;
  lastUsed: number;
};

type DbRead = { key: number; waiters: number[] };

export type CacheRun = {
  settings: CacheSettings;
  tick: number;
  /** Stream for reads and writes. Never touched by cache settings. */
  requestRng: number;
  /** Stream for TTL jitter. */
  jitterRng: number;
  cumulative: number[];
  dbVersions: number[];
  cache: Map<number, Entry>;
  queue: DbRead[];
  /** Queued read per key, used for coalescing. */
  pending: Map<number, DbRead>;
  history: CacheStats[];
};

export function validateCacheSettings(s: CacheSettings): void {
  const fail = (message: string): never => {
    throw new Error(`Invalid cache settings: ${message}`);
  };
  const whole = (v: number, min: number) => Number.isInteger(v) && v >= min;
  if (!Number.isFinite(s.seed)) fail('seed must be a number');
  if (!whole(s.ticks, 1)) fail('ticks must be a positive whole number');
  if (!whole(s.keyCount, 1)) fail('keyCount must be a positive whole number');
  if (!Number.isFinite(s.readsPerTick) || s.readsPerTick < 0)
    fail('readsPerTick cannot be below 0');
  if (!Number.isFinite(s.skew) || s.skew < 0) fail('skew cannot be below 0');
  if (!whole(s.hotKeyCount, 0))
    fail('hotKeyCount must be a whole number, 0 or more');
  if (!Number.isFinite(s.writesPerTick) || s.writesPerTick < 0)
    fail('writesPerTick cannot be below 0');
  if (!whole(s.cacheCapacity, 0))
    fail('cacheCapacity must be a whole number, 0 or more');
  if (!EVICTIONS.includes(s.eviction)) fail('unknown eviction');
  if (!whole(s.ttl, 1)) fail('ttl must be a positive whole number');
  if (!Number.isFinite(s.ttlJitter) || s.ttlJitter < 0 || s.ttlJitter > 1)
    fail('ttlJitter must be between 0 and 1');
  if (!whole(s.dbCapacity, 1))
    fail('dbCapacity must be a positive whole number');
  if (s.restartAtTick !== undefined && !whole(s.restartAtTick, 1))
    fail('restartAtTick must be a positive whole number');
  if (s.hotKeyExpiry) {
    if (!whole(s.hotKeyExpiry.atTick, 1))
      fail('hotKeyExpiry.atTick must be a positive whole number');
    if (!whole(s.hotKeyExpiry.key, 0) || s.hotKeyExpiry.key >= s.keyCount)
      fail('hotKeyExpiry.key must be one of the keys');
  }
}

export function createCacheRun(settings: CacheSettings): CacheRun {
  validateCacheSettings(settings);
  const cumulative: number[] = [];
  let total = 0;
  for (let rank = 1; rank <= settings.keyCount; rank++) {
    total += 1 / Math.pow(rank, settings.skew);
    cumulative.push(total);
  }
  return {
    settings,
    tick: 0,
    requestRng: settings.seed >>> 0,
    jitterRng: (settings.seed ^ 0x9e3779b9) >>> 0,
    cumulative,
    dbVersions: new Array<number>(settings.keyCount).fill(0),
    cache: new Map(),
    queue: [],
    pending: new Map(),
    history: [],
  };
}

function drawRandom(run: CacheRun): number {
  const r = nextRandom(run.requestRng);
  run.requestRng = r.state;
  return r.value;
}

function drawKey(run: CacheRun): number {
  const target = drawRandom(run) * run.cumulative[run.cumulative.length - 1];
  let lo = 0;
  let hi = run.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (run.cumulative[mid] > target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Whole count for a per-tick rate: the integer part plus a chance of one more. */
function drawCount(run: CacheRun, rate: number): number {
  const base = Math.floor(rate);
  return base + (drawRandom(run) < rate - base ? 1 : 0);
}

function evictOne(run: CacheRun): void {
  let victim = -1;
  let best: Entry | undefined;
  const lfu = run.settings.eviction === 'lfu';
  for (const [key, e] of run.cache) {
    const worse =
      !best ||
      (lfu
        ? e.uses < best.uses ||
          (e.uses === best.uses && e.lastUsed < best.lastUsed)
        : e.lastUsed < best.lastUsed);
    if (worse) {
      victim = key;
      best = e;
    }
  }
  run.cache.delete(victim);
}

export function isCacheComplete(run: CacheRun): boolean {
  return run.tick >= run.settings.ticks;
}

/** Advance one tick, record its stats and return them. Mutates the run. */
export function stepCache(run: CacheRun): CacheStats {
  const s = run.settings;
  const tick = ++run.tick;
  let hits = 0;
  let misses = 0;
  let stale = 0;
  let evictions = 0;
  let latencyTotal = 0;
  let latencyCount = 0;
  let latencyMax = 0;
  const answer = (latency: number) => {
    latencyTotal += latency;
    latencyCount++;
    if (latency > latencyMax) latencyMax = latency;
  };

  // Events
  if (s.restartAtTick === tick) run.cache.clear();
  if (s.hotKeyExpiry?.atTick === tick) run.cache.delete(s.hotKeyExpiry.key);

  // Writes
  const writes = drawCount(run, s.writesPerTick);
  for (let i = 0; i < writes; i++) {
    const key = drawKey(run);
    run.dbVersions[key]++;
    if (s.invalidateOnWrite) run.cache.delete(key);
  }

  // Read arrivals
  const reads = drawCount(run, s.readsPerTick);
  for (let i = 0; i < reads; i++) {
    const key = drawKey(run);
    let entry = run.cache.get(key);
    if (entry && entry.expiresAt <= tick) {
      run.cache.delete(key);
      entry = undefined;
    }
    if (entry) {
      hits++;
      entry.uses++;
      entry.lastUsed = tick;
      if (entry.version < run.dbVersions[key]) stale++;
      answer(0);
      continue;
    }
    misses++;
    const waiting = s.coalescing ? run.pending.get(key) : undefined;
    if (waiting) {
      waiting.waiters.push(tick);
    } else {
      const read: DbRead = { key, waiters: [tick] };
      run.queue.push(read);
      if (s.coalescing) run.pending.set(key, read);
    }
  }

  // Database serves its queue
  const served = run.queue.splice(0, s.dbCapacity);
  for (const read of served) {
    if (run.pending.get(read.key) === read) run.pending.delete(read.key);
    for (const arrivedAt of read.waiters) answer(tick - arrivedAt + 1);
    if (s.cacheCapacity > 0) {
      const existing = run.cache.get(read.key);
      if (!existing) {
        while (run.cache.size >= s.cacheCapacity) {
          evictOne(run);
          evictions++;
        }
      }
      const jitter = nextRandom(run.jitterRng);
      run.jitterRng = jitter.state;
      const life = Math.max(
        1,
        Math.round(s.ttl * (1 - s.ttlJitter * jitter.value)),
      );
      run.cache.set(read.key, {
        version: run.dbVersions[read.key],
        expiresAt: tick + life,
        uses: existing?.uses ?? 0,
        lastUsed: existing?.lastUsed ?? tick,
      });
    }
  }

  const cacheView = [...run.cache.entries()]
    .sort((a, b) => b[1].uses - a[1].uses || a[0] - b[0])
    .slice(0, 10)
    .map(([key, e]) => ({
      key,
      hot: key < s.hotKeyCount,
      version: e.version,
      stale: e.version < run.dbVersions[key],
      uses: e.uses,
    }));

  const stats: CacheStats = {
    tick,
    hits,
    misses,
    hitRate: hits + misses === 0 ? 0 : hits / (hits + misses),
    dbReads: served.length,
    dbReadKeys: served.map((r) => r.key),
    dbQueue: run.queue.length,
    averageLatency: latencyCount === 0 ? 0 : latencyTotal / latencyCount,
    maxLatency: latencyMax,
    staleReads: stale,
    evictions,
    cacheSize: run.cache.size,
    cacheView,
  };
  run.history.push(stats);
  return stats;
}

/** Run to the end and return the stats of every tick. */
export function runCacheSimulation(settings: CacheSettings): CacheStats[] {
  const run = createCacheRun(settings);
  while (!isCacheComplete(run)) stepCache(run);
  return run.history;
}
