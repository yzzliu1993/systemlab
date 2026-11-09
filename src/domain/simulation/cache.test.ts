import {
  CACHE_PRESETS,
  DEFAULT_CACHE_SETTINGS,
  createCacheRun,
  runCacheSimulation,
  type CacheSettings,
  type CacheStats,
} from '@/domain/simulation/cache';

const base: CacheSettings = DEFAULT_CACHE_SETTINGS;

const sum = (stats: CacheStats[], pick: (s: CacheStats) => number) =>
  stats.reduce((n, s) => n + pick(s), 0);
const rate = (stats: CacheStats[]) =>
  sum(stats, (s) => s.hits) /
  (sum(stats, (s) => s.hits) + sum(stats, (s) => s.misses));
const within = (stats: CacheStats[], from: number, to: number) =>
  stats.filter((s) => s.tick >= from && s.tick <= to);

describe('cache simulation', () => {
  it('T1: same seed and settings give identical stats', () => {
    expect(runCacheSimulation(base)).toEqual(runCacheSimulation(base));
  });

  it('T2: a bigger cache sees the same requests and hits at least as often', () => {
    const small = runCacheSimulation({ ...base, cacheCapacity: 10 });
    const big = runCacheSimulation({ ...base, cacheCapacity: 100 });
    expect(small.map((s) => s.hits + s.misses)).toEqual(
      big.map((s) => s.hits + s.misses),
    );
    expect(rate(big)).toBeGreaterThanOrEqual(rate(small));
  });

  it('T3: a restart drops the hit rate and raises database reads', () => {
    const stats = runCacheSimulation(CACHE_PRESETS.cacheRestart);
    const before = within(stats, 150, 199);
    const after = within(stats, 200, 220);
    expect(rate(after)).toBeLessThan(rate(before));
    expect(sum(after, (s) => s.dbReads) / after.length).toBeGreaterThan(
      sum(before, (s) => s.dbReads) / before.length,
    );
  });

  const hotReads = (stats: CacheStats[]) =>
    within(stats, 200, 230).reduce(
      (n, s) => n + s.dbReadKeys.filter((k) => k === 0).length,
      0,
    );

  it('T4: hot key expiring without coalescing causes several database reads', () => {
    const stats = runCacheSimulation({
      ...CACHE_PRESETS.hotKeyExpires,
      coalescing: false,
    });
    expect(hotReads(stats)).toBeGreaterThan(1);
  });

  it('T5: with coalescing the hot key is read from the database once', () => {
    const stats = runCacheSimulation({
      ...CACHE_PRESETS.hotKeyExpires,
      coalescing: true,
    });
    expect(hotReads(stats)).toBe(1);
  });

  it('T6: writes without invalidation give stale reads', () => {
    const stats = runCacheSimulation(CACHE_PRESETS.noInvalidationOnWrite);
    expect(sum(stats, (s) => s.staleReads)).toBeGreaterThan(0);
  });

  it('T7: writes with invalidation give no stale reads', () => {
    const stats = runCacheSimulation({
      ...CACHE_PRESETS.noInvalidationOnWrite,
      invalidateOnWrite: true,
    });
    expect(sum(stats, (s) => s.staleReads)).toBe(0);
  });

  it('T8: capacity 0 makes every read a miss without error', () => {
    const stats = runCacheSimulation({ ...base, cacheCapacity: 0 });
    expect(sum(stats, (s) => s.hits)).toBe(0);
    expect(sum(stats, (s) => s.misses)).toBeGreaterThan(0);
  });

  it('T9: database capacity 0 is rejected', () => {
    expect(() => createCacheRun({ ...base, dbCapacity: 0 })).toThrow(
      /dbCapacity/,
    );
    expect(() => createCacheRun({ ...base, cacheCapacity: -1 })).toThrow(
      /cacheCapacity/,
    );
    expect(() => createCacheRun({ ...base, writesPerTick: -1 })).toThrow(
      /writesPerTick/,
    );
    expect(() => createCacheRun({ ...base, readsPerTick: -1 })).toThrow(
      /readsPerTick/,
    );
  });

  it('T10: LRU and LFU both run on the same requests and count evictions', () => {
    const lru = runCacheSimulation({
      ...base,
      cacheCapacity: 10,
      eviction: 'lru',
    });
    const lfu = runCacheSimulation({
      ...base,
      cacheCapacity: 10,
      eviction: 'lfu',
    });
    expect(lru.map((s) => s.hits + s.misses)).toEqual(
      lfu.map((s) => s.hits + s.misses),
    );
    expect(sum(lru, (s) => s.evictions)).toBeGreaterThan(0);
    expect(sum(lfu, (s) => s.evictions)).toBeGreaterThan(0);
  });
});
