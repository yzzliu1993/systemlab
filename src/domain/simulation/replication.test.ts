import {
  DEFAULT_SETTINGS,
  PRESETS,
  createRun,
  getTotals,
  runSimulation,
  type Settings,
} from '@/domain/simulation/replication';

const base = DEFAULT_SETTINGS;

describe('replication simulation', () => {
  it('T1: same seed and defaults give identical stats', () => {
    const a = runSimulation(base);
    const b = runSimulation(base);
    expect(a.history).toEqual(b.history);
    expect(getTotals(a)).toEqual(getTotals(b));
  });

  const lagging: Settings = { ...base, followers: 1, followerLags: [20] };

  it('T2: reads from a follower with lag 20 are stale', () => {
    const r = runSimulation({ ...lagging, readRouting: 'anyFollower' });
    expect(getTotals(r).staleReads).toBeGreaterThan(0);
  });

  it('T3: read-your-own-writes gives no stale reads', () => {
    const r = runSimulation({ ...lagging, readRouting: 'readYourOwnWrites' });
    expect(getTotals(r).reads).toBeGreaterThan(0);
    expect(getTotals(r).staleReads).toBe(0);
  });

  it('T4: async with a leader failure loses writes', () => {
    const r = runSimulation(PRESETS.leaderFailsAsync);
    expect(getTotals(r).lostWrites).toBeGreaterThan(0);
  });

  it('T5: sync K=1 with a leader failure loses no writes', () => {
    const r = runSimulation(PRESETS.leaderFailsSync);
    expect(getTotals(r).writesAcked).toBeGreaterThan(0);
    expect(getTotals(r).lostWrites).toBe(0);
  });

  it('T6: sync has higher average write latency than async', () => {
    const a = getTotals(runSimulation(base));
    const s = getTotals(
      runSimulation({ ...base, mode: 'sync', syncFollowers: 1 }),
    );
    expect(s.averageWriteLatency).toBeGreaterThan(a.averageWriteLatency);
  });

  it('T7: partition with auto promote accepts writes on both sides and conflicts', () => {
    const r = runSimulation({
      ...PRESETS.networkPartition,
      partition: { tick: 100 },
    });
    const after = r.writes.filter((w) => w.tick >= 100 && w.ackedAt !== null);
    expect(after.some((w) => w.side === 'a')).toBe(true);
    expect(after.some((w) => w.side === 'b')).toBe(true);
    expect(getTotals(r).conflicts).toBeGreaterThan(0);
  });

  it('T8: partition with auto promote off makes the minority refuse writes', () => {
    const r = runSimulation({
      ...PRESETS.networkPartition,
      autoPromoteWithoutMajority: false,
    });
    const minority = r.writes.filter(
      (w) => w.side === 'a' && w.tick >= 100 && w.tick < 200,
    );
    expect(minority).toHaveLength(0);
    expect(r.writes.some((w) => w.side === 'b' && w.ackedAt !== null)).toBe(
      true,
    );
    expect(getTotals(r).writesRefused).toBeGreaterThan(0);
    expect(getTotals(r).conflicts).toBe(0);
  });

  it('T9: no write is acknowledged during the promotion delay', () => {
    const r = runSimulation({
      ...PRESETS.leaderFailsAsync,
      promotionDelay: 30,
    });
    const window = r.history.filter((h) => h.tick >= 100 && h.tick < 130);
    expect(window).toHaveLength(30);
    expect(window.every((h) => h.writesAcked === 0)).toBe(true);
    expect(window.some((h) => h.writesRefused > 0)).toBe(true);
    expect(r.history.find((h) => h.tick === 130)!.writesAcked).toBeGreaterThan(
      0,
    );
  });

  it('T10: K=3 with 2 followers is rejected', () => {
    expect(() =>
      createRun({
        ...base,
        followers: 2,
        followerLags: [1, 2],
        mode: 'sync',
        syncFollowers: 3,
      }),
    ).toThrow(/Invalid settings/);
  });

  it('rejects 0 followers and negative lag with a clear error', () => {
    expect(() =>
      createRun({ ...base, followers: 0, followerLags: [] }),
    ).toThrow('Invalid settings: at least one follower is needed');
    expect(() => createRun({ ...base, followerLags: [2, -1, 6] })).toThrow(
      'Invalid settings: follower 2 lag',
    );
  });

  it('settings changes do not change the client stream', () => {
    const stream = (s: Settings) =>
      runSimulation(s).history.map((h) => [h.writesSent, h.readsSent]);
    const a = stream(base);
    expect(stream({ ...base, mode: 'sync', followerLags: [9, 9, 9] })).toEqual(
      a,
    );
    expect(stream(PRESETS.leaderFailsAsync)).toEqual(a);
  });

  it('presets are valid', () => {
    for (const p of Object.values(PRESETS)) {
      expect(() => runSimulation(p)).not.toThrow();
    }
  });
});
