import {
  DEFAULT_SETTINGS,
  PRESETS,
  createRun,
  getStats,
  runSimulation,
} from '@/domain/simulation/messageQueue';
import type { Settings } from '@/domain/simulation/messageQueue';

const calm: Settings = {
  ...DEFAULT_SETTINGS,
  failureChance: 0,
  poisonEvery: undefined,
};

const slowTimeout: Settings = {
  ...calm,
  visibilityTimeout: 3,
  processingMix: [{ cost: 5, weight: 1 }],
  arrivalRate: 0.5,
};

describe('message queue simulation', () => {
  it('T1: the same seed and settings give identical stats', () => {
    const settings = { ...DEFAULT_SETTINGS, seed: 7 };
    const first = runSimulation(settings);
    const second = runSimulation(settings);
    expect(first.history).toEqual(second.history);
    expect(getStats(first).arrivals).toBeGreaterThan(0);
  });

  it('T2: runs with 2 and 4 consumers see the same arrivals', () => {
    const a = runSimulation({ ...DEFAULT_SETTINGS, seed: 7, consumers: 2 });
    const b = runSimulation({ ...DEFAULT_SETTINGS, seed: 7, consumers: 4 });
    expect(a.history.map((h) => h.arrivals)).toEqual(
      b.history.map((h) => h.arrivals),
    );
    expect(a.nextId).toBe(b.nextId);
    expect(a.nextId).toBeGreaterThan(1);
  });

  it('T3: backlog and oldest age grow when producers outpace consumers', () => {
    const run = runSimulation({
      ...calm,
      arrivalRate: 2,
      consumers: 2,
      processingMix: [{ cost: 3, weight: 1 }],
      ticks: 200,
    });
    const at = (tick: number) => run.history[tick - 1]!;
    expect(at(200).backlog).toBeGreaterThan(at(100).backlog);
    expect(at(100).backlog).toBeGreaterThan(at(20).backlog);
    expect(at(200).oldestAge).toBeGreaterThan(at(100).oldestAge);
    expect(at(100).oldestAge).toBeGreaterThan(at(20).oldestAge);
  });

  it('T4: with enough consumers the backlog stays bounded and ends near 0', () => {
    const run = runSimulation({
      ...calm,
      arrivalRate: 0.5,
      consumers: 4,
      processingMix: [{ cost: 2, weight: 1 }],
      ticks: 300,
    });
    const peak = Math.max(...run.history.map((h) => h.backlog));
    expect(peak).toBeLessThan(10);
    expect(getStats(run).backlog).toBeLessThanOrEqual(1);
  });

  it('T5: a timeout shorter than processing causes redeliveries', () => {
    const run = runSimulation(slowTimeout);
    expect(getStats(run).redeliveries).toBeGreaterThan(0);
  });

  it('T6: redeliveries with idempotency off produce duplicate side effects', () => {
    const stats = getStats(
      runSimulation({ ...slowTimeout, idempotent: false }),
    );
    expect(stats.redeliveries).toBeGreaterThan(0);
    expect(stats.duplicateSideEffects).toBeGreaterThan(0);
    expect(stats.skippedDuplicates).toBe(0);
  });

  it('T7: with idempotency on, duplicates are skipped and none are applied', () => {
    const stats = getStats(runSimulation({ ...slowTimeout, idempotent: true }));
    expect(stats.duplicateSideEffects).toBe(0);
    expect(stats.skippedDuplicates).toBeGreaterThan(0);
  });

  it('T8: a poison message is dead-lettered after max receive count and not taken again', () => {
    const run = runSimulation({
      ...calm,
      arrivalRate: 1,
      poisonEvery: 10,
      maxReceiveCount: 3,
      visibilityTimeout: 4,
      processingMix: [{ cost: 1, weight: 1 }],
      consumers: 3,
      ticks: 60,
    });
    const poison = run.deadLetters.find((m) => m.id === 10);
    expect(poison).toBeDefined();
    expect(poison!.receiveCount).toBe(3);
    expect(run.deadLetters.every((m) => m.id % 10 === 0)).toBe(true);
    expect(run.messages.some((m) => m.id === 10)).toBe(false);
    expect(run.consumers.some((c) => c.messageId === 10)).toBe(false);
    // Once it is dead-lettered no consumer holds it again.
    const after = run.history.filter((h) => h.deadLettered >= 1);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((h) => !h.consumers.includes(10))).toBe(true);
  });

  it('T9: invalid settings are rejected when creating a run', () => {
    expect(() => createRun({ ...DEFAULT_SETTINGS, consumers: 0 })).toThrow(
      /at least one consumer/,
    );
    expect(() =>
      createRun({ ...DEFAULT_SETTINGS, maxReceiveCount: 0 }),
    ).toThrow(/max receive count/);
    expect(() =>
      createRun({ ...DEFAULT_SETTINGS, visibilityTimeout: 0 }),
    ).toThrow(/visibility timeout/);
    expect(() => createRun({ ...DEFAULT_SETTINGS, arrivalRate: -1 })).toThrow(
      /arrival rate/,
    );
  });

  it('T10: a rate of 0 gives no messages and all stats 0', () => {
    const run = runSimulation({ ...DEFAULT_SETTINGS, arrivalRate: 0 });
    expect(run.history).toHaveLength(DEFAULT_SETTINGS.ticks);
    expect(getStats(run)).toMatchObject({
      arrivals: 0,
      backlog: 0,
      oldestAge: 0,
      inFlight: 0,
      processed: 0,
      failedAttempts: 0,
      redeliveries: 0,
      duplicateSideEffects: 0,
      skippedDuplicates: 0,
      deadLettered: 0,
    });
  });

  it('presets are valid settings', () => {
    for (const settings of Object.values(PRESETS)) {
      expect(() => createRun(settings)).not.toThrow();
    }
  });
});
