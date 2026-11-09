import {
  DEFAULT_SETTINGS,
  PRESETS,
  runSimulation,
  type Settings,
  type TickStats,
} from '@/domain/simulation/rateLimit';

type Total =
  'sent' | 'retries' | 'firstAttempts' | 'accepted' | 'rejected' | 'shed';
const sum = (stats: TickStats[], key: Total) =>
  stats.reduce((total, s) => total + s[key], 0);
const sumClient = (
  stats: TickStats[],
  client: number,
  key: 'acceptedByClient' | 'firstAttemptsByClient',
) => stats.reduce((total, s) => total + s[key][client]!, 0);
const firstAttempts = (stats: TickStats[]) =>
  stats.map((s) => s.firstAttemptsByClient);
const lastMax = (stats: TickStats[]) => stats[stats.length - 1]!.maxLatency;

describe('rate limit simulation', () => {
  it('T1: same seed and settings give identical stats', () => {
    expect(runSimulation(DEFAULT_SETTINGS)).toEqual(
      runSimulation(DEFAULT_SETTINGS),
    );
    const backoff = PRESETS.burstBiggerThanBucket;
    expect(runSimulation(backoff)).toEqual(runSimulation(backoff));
  });

  it('T2: token bucket and fixed window see the same first attempts', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      clients: [{ rate: 0.4 }, { rate: 2.5 }],
    };
    const a = runSimulation(settings);
    const b = runSimulation({
      ...settings,
      limiter: { algorithm: 'fixedWindow', limit: 3, windowTicks: 4 },
      retry: { mode: 'immediate', maxAttempts: 3 },
    });
    expect(firstAttempts(a)).toEqual(firstAttempts(b));
    expect(sum(a, 'firstAttempts')).toBeGreaterThan(0);
  });

  it('T3: token bucket allows a burst up to capacity, then its rate', () => {
    const stats = runSimulation({
      ...DEFAULT_SETTINGS,
      ticks: 15,
      clients: [{ rate: 0 }],
      burst: { client: 0, startTick: 0, durationTicks: 1, extraPerTick: 30 },
      limiter: { algorithm: 'tokenBucket', capacity: 10, refillPerTick: 1 },
      retry: { mode: 'immediate', maxAttempts: 100 },
    });
    expect(stats[0]!.accepted).toBe(10);
    for (const s of stats.slice(1)) expect(s.accepted).toBe(1);
  });

  it('T4: with a global limit the noisy client has the largest accepted share', () => {
    const stats = runSimulation(PRESETS.noisyClient);
    const accepted = [0, 1, 2, 3].map((c) =>
      sumClient(stats, c, 'acceptedByClient'),
    );
    expect(accepted[0]).toBeGreaterThan(Math.max(...accepted.slice(1)));
    expect(accepted[0]!).toBeGreaterThan(sum(stats, 'accepted') / 2);
  });

  it('T5: with per-client limits quiet clients get all their first attempts accepted', () => {
    const stats = runSimulation({
      ...PRESETS.noisyClient,
      scope: 'perClient',
      limiter: { algorithm: 'tokenBucket', capacity: 5, refillPerTick: 2 },
    });
    for (const c of [1, 2, 3]) {
      const sent = sumClient(stats, c, 'firstAttemptsByClient');
      expect(sent).toBeGreaterThan(0);
      expect(sumClient(stats, c, 'acceptedByClient')).toBe(sent);
    }
    expect(sum(stats, 'rejected')).toBeGreaterThan(0);
  });

  it('T6: immediate retries exceed backoff retries under overload', () => {
    const immediate = runSimulation(PRESETS.retryStorm);
    const backoff = runSimulation({
      ...PRESETS.retryStorm,
      retry: {
        mode: 'backoff',
        maxAttempts: 5,
        baseDelayTicks: 2,
        maxDelayTicks: 32,
      },
    });
    expect(sum(immediate, 'retries')).toBeGreaterThan(sum(backoff, 'retries'));
    expect(sum(backoff, 'retries')).toBeGreaterThan(0);
    expect(sum(immediate, 'sent')).toBeGreaterThan(
      sum(immediate, 'firstAttempts') * 1.5,
    );
  });

  it('T7: shedding bounds max latency under overload, no shedding lets it grow', () => {
    const off = {
      ...PRESETS.loadShedding,
      server: { ...PRESETS.loadShedding.server, loadShedding: false },
    };
    const on = runSimulation(PRESETS.loadShedding);
    const offShort = runSimulation(off);
    const offLong = runSimulation({ ...off, ticks: 400 });
    expect(sum(on, 'shed')).toBeGreaterThan(0);
    expect(lastMax(on)).toBeLessThan(lastMax(offShort));
    expect(lastMax(on)).toBeLessThanOrEqual(15);
    expect(lastMax(offLong)).toBeGreaterThan(lastMax(offShort));
  });

  it('T8: rate 0 for all clients gives no requests', () => {
    const stats = runSimulation({
      ...DEFAULT_SETTINGS,
      clients: [{ rate: 0 }, { rate: 0 }],
    });
    expect(stats).toHaveLength(DEFAULT_SETTINGS.ticks);
    for (const s of stats) {
      expect(s.sent).toBe(0);
      expect(s.accepted).toBe(0);
      expect(s.rejected).toBe(0);
      expect(s.shed).toBe(0);
      expect(s.inFlight).toBe(0);
      expect(s.serverQueue).toBe(0);
      expect(s.averageLatency).toBe(0);
      expect(s.maxLatency).toBe(0);
    }
  });

  it('T9: zero clients or token bucket capacity 0 is rejected', () => {
    expect(() => runSimulation({ ...DEFAULT_SETTINGS, clients: [] })).toThrow(
      /at least one client/,
    );
    expect(() =>
      runSimulation({
        ...DEFAULT_SETTINGS,
        limiter: { algorithm: 'tokenBucket', capacity: 0, refillPerTick: 1 },
      }),
    ).toThrow(/capacity/);
    expect(() =>
      runSimulation({ ...DEFAULT_SETTINGS, clients: [{ rate: -1 }] }),
    ).toThrow(/rate/);
  });

  it('T10: leaky bucket queue 5 holds 5 of a burst of 20 and drains at its rate', () => {
    const stats = runSimulation({
      ...DEFAULT_SETTINGS,
      ticks: 10,
      clients: [{ rate: 0 }],
      burst: { client: 0, startTick: 0, durationTicks: 1, extraPerTick: 20 },
      limiter: { algorithm: 'leakyBucket', queueSize: 5, drainPerTick: 1 },
      retry: { mode: 'none' },
    });
    expect(stats[0]!.rejected).toBe(15);
    expect(stats[0]!.accepted).toBe(1);
    expect(stats[0]!.limiterQueue).toBe(4);
    expect(stats.slice(0, 5).map((s) => s.accepted)).toEqual([1, 1, 1, 1, 1]);
    expect(stats[5]!.accepted).toBe(0);
    expect(stats[4]!.limiterQueue).toBe(0);
    expect(sum(stats, 'accepted')).toBe(5);
  });
});
