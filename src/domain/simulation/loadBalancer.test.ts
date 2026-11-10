import {
  DEFAULT_SETTINGS,
  createRun,
  getStats,
  runSimulation,
  step,
} from '@/domain/simulation/loadBalancer';
import type { RunState, Settings } from '@/domain/simulation/loadBalancer';

/** One arrival on every tick. */
const everyTick: Settings = {
  ...DEFAULT_SETTINGS,
  baseRate: 10,
  peakRate: 10,
  // Huge cost so requests stay held and the queues stay visible.
  costMix: [{ cost: 100000, weight: 1 }],
};

function stepN(state: RunState, n: number): RunState {
  let next = state;
  for (let i = 0; i < n; i += 1) next = step(next);
  return next;
}

function received(state: RunState): number[] {
  return state.servers.map((s) => s.received);
}

describe('load balancing simulation', () => {
  it('T1: the same seed and settings give identical stats', () => {
    const settings = { ...DEFAULT_SETTINGS, seed: 7 };
    const first = runSimulation(settings);
    const second = runSimulation(settings);
    expect(getStats(first)).toEqual(getStats(second));
    expect(first).toEqual(second);
    expect(getStats(first).arrivals).toBeGreaterThan(0);
  });

  it('T2: round robin and least connections see the same arrivals', () => {
    const a = runSimulation({ ...DEFAULT_SETTINGS, algorithm: 'roundRobin' });
    const b = runSimulation({
      ...DEFAULT_SETTINGS,
      algorithm: 'leastConnections',
    });
    expect(a.arrivals).toBe(b.arrivals);
    expect(a.nextId).toBe(b.nextId);
  });

  it('T3: round robin gives each of 3 servers 3 of 9 requests, in rotation', () => {
    let state = createRun({ ...everyTick, algorithm: 'roundRobin' });
    const order: number[] = [];
    for (let i = 0; i < 9; i += 1) {
      const before = received(state);
      state = step(state);
      order.push(received(state).findIndex((n, k) => n > before[k]!));
    }
    expect(state.arrivals).toBe(9);
    expect(received(state)).toEqual([3, 3, 3]);
    expect(order).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2]);
  });

  it('T4: least connections sends the next request to the lowest-index idle server', () => {
    const state = createRun({ ...everyTick, algorithm: 'leastConnections' });
    const busy: RunState = {
      ...state,
      servers: state.servers.map((s, i) =>
        i === 0
          ? {
              ...s,
              serving: {
                request: { id: 99, cost: 1000, arrivedAt: 0 },
                remaining: 1000,
              },
            }
          : s,
      ),
    };
    expect(received(step(busy))).toEqual([0, 1, 0]);
  });

  it('T5: weights 3 and 1 split 8 requests as 6 and 2', () => {
    const state = stepN(
      createRun({
        ...everyTick,
        algorithm: 'weightedRoundRobin',
        servers: [
          { speed: 1, weight: 3 },
          { speed: 1, weight: 1 },
        ],
      }),
      8,
    );
    expect(state.arrivals).toBe(8);
    expect(received(state)).toEqual([6, 2]);
  });

  it('T6: weighted least connections favours the weight-2 server at equal load', () => {
    const state = createRun({
      ...everyTick,
      algorithm: 'weightedLeastConnections',
      servers: [
        { speed: 1, weight: 1 },
        { speed: 1, weight: 2 },
      ],
    });
    const loaded: RunState = {
      ...state,
      servers: state.servers.map((s, i) => ({
        ...s,
        queue: [{ id: i + 50, cost: 100000, arrivedAt: 0 }],
      })),
    };
    expect(received(step(loaded))).toEqual([0, 1]);
  });

  it('T7: one server takes every request under any algorithm', () => {
    for (const algorithm of [
      'roundRobin',
      'leastConnections',
      'weightedRoundRobin',
      'weightedLeastConnections',
    ] as const) {
      const state = runSimulation({
        ...DEFAULT_SETTINGS,
        algorithm,
        servers: [{ speed: 2, weight: 1 }],
      });
      expect(state.servers[0]!.received).toBe(state.arrivals);
      expect(state.arrivals).toBeGreaterThan(0);
    }
  });

  it('T8: arrival multiplier 0 gives no arrivals and zero wait stats', () => {
    const stats = getStats(
      runSimulation({ ...DEFAULT_SETTINGS, arrivalMultiplier: 0 }),
    );
    expect(stats.arrivals).toBe(0);
    expect(stats.averageWait).toBe(0);
    expect(stats.maxWait).toBe(0);
  });

  it('T9: zero servers or a non-positive weight or speed is rejected', () => {
    expect(() => createRun({ ...DEFAULT_SETTINGS, servers: [] })).toThrow(
      /at least one server/,
    );
    expect(() =>
      createRun({ ...DEFAULT_SETTINGS, servers: [{ speed: 1, weight: 0 }] }),
    ).toThrow(/weight must be greater than 0/);
    expect(() =>
      createRun({ ...DEFAULT_SETTINGS, servers: [{ speed: 0, weight: 1 }] }),
    ).toThrow(/speed must be greater than 0/);
    expect(() =>
      createRun({ ...DEFAULT_SETTINGS, arrivalMultiplier: -1 }),
    ).toThrow(/must not be negative/);
    expect(() =>
      createRun({
        ...DEFAULT_SETTINGS,
        serverDown: { server: 1, atTick: 601 },
      }),
    ).toThrow(/inside the run/);
    expect(() =>
      createRun({
        ...DEFAULT_SETTINGS,
        serverDown: { server: 1, atTick: 50, backAtTick: 50 },
      }),
    ).toThrow(/back tick/);
  });

  it('T10: stats of a finished run have the listed fields and no score', () => {
    const stats = getStats(runSimulation(DEFAULT_SETTINGS));
    expect(Object.keys(stats).sort()).toEqual(
      [
        'arrivals',
        'averageWait',
        'failed',
        'finished',
        'maxWait',
        'servers',
        'tick',
        'waiting',
      ].sort(),
    );
    expect(Object.keys(stats.servers[0]!).sort()).toEqual(
      ['active', 'failed', 'finished', 'queue', 'received', 'up'].sort(),
    );
    expect(stats).not.toHaveProperty('score');
    expect(stats).not.toHaveProperty('walkedOut');
    expect(stats.tick).toBe(DEFAULT_SETTINGS.ticks);
    const active = stats.servers.reduce((n, s) => n + s.active, 0);
    expect(stats.finished + stats.failed + stats.waiting + active).toBe(
      stats.arrivals,
    );
  });

  it('T11: a server that goes down gets no new requests and its held requests fail', () => {
    const settings: Settings = {
      ...everyTick,
      serverDown: { server: 1, atTick: 50 },
    };
    const before = stepN(createRun(settings), 49);
    const held = getStats(before).servers[1]!;
    expect(held.queue + held.active).toBeGreaterThan(0);

    const atDown = step(before);
    const down = getStats(atDown).servers[1]!;
    expect(down.up).toBe(false);
    expect(down.failed).toBe(held.queue + held.active);
    expect(atDown.failed).toBe(down.failed);

    const end = stepN(atDown, 100);
    expect(end.servers[1]!.received).toBe(atDown.servers[1]!.received);
    expect(end.servers[0]!.received).toBeGreaterThan(
      atDown.servers[0]!.received,
    );
  });

  it('T12: a server takes requests again after it comes back', () => {
    const settings: Settings = {
      ...everyTick,
      serverDown: { server: 1, atTick: 50, backAtTick: 100 },
    };
    const atTick99 = stepN(createRun(settings), 99);
    expect(atTick99.servers[1]!.up).toBe(false);
    const end = stepN(atTick99, 51);
    expect(end.servers[1]!.up).toBe(true);
    expect(end.servers[1]!.received).toBeGreaterThan(
      atTick99.servers[1]!.received,
    );
  });
});

describe('YOU-97: load balancer edge cases', () => {
  it('T1: requests that wait while every server is down are sent first when it returns', () => {
    const settings: Settings = {
      ...everyTick,
      ticks: 30,
      servers: [{ speed: 1, weight: 1 }],
      serverDown: { server: 0, atTick: 10, backAtTick: 20 },
    };
    const atTick19 = stepN(createRun(settings), 19);
    expect(atTick19.servers[0]!.up).toBe(false);
    const waiting = atTick19.unrouted;
    expect(waiting.length).toBeGreaterThan(0);
    expect(atTick19.servers[0]!.received).toBe(
      atTick19.arrivals - waiting.length,
    );

    const atTick20 = step(atTick19);
    expect(atTick20.servers[0]!.up).toBe(true);
    expect(atTick20.unrouted).toEqual([]);
    const server = atTick20.servers[0]!;
    const ids = [server.serving!.request.id, ...server.queue.map((r) => r.id)];
    const waitingIds = waiting.map((r) => r.id);
    const lastWaiting = waitingIds[waitingIds.length - 1]!;
    // The waiting requests start first, oldest first, then newer ones.
    expect(ids.slice(0, waitingIds.length)).toEqual(waitingIds);
    expect(ids.slice(waitingIds.length).every((id) => id > lastWaiting)).toBe(
      true,
    );
  });

  it('T2: a down server index outside the server list is rejected, naming the index', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      serverDown: { server: 5, atTick: 10 },
    };
    expect(settings.servers).toHaveLength(3);
    expect(() => createRun(settings)).toThrow(/index 5/);
  });
});
