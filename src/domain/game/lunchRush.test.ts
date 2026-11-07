import {
  DEFAULT_CONFIG,
  SCENARIO_SEEDS,
  TAKEOUT_RUSH_CONFIG,
  assignNext,
  createGame,
  furthestBehind,
  runRound,
  stillInShop,
  tick,
} from '@/domain/game/lunchRush';
import type {
  ArrivalSpeed,
  Customer,
  GameConfig,
} from '@/domain/game/lunchRush';

const noArrivals: GameConfig = {
  ...DEFAULT_CONFIG,
  baseRate: 0,
  peakRate: 0,
};
const everyTick: GameConfig = {
  ...DEFAULT_CONFIG,
  baseRate: 10,
  peakRate: 10,
};

function customer(id: number, size = 1000): Customer {
  return { id, kind: 'takeout', size, arrivedAt: 0, patience: 100000 };
}

describe('lunch rush simulation', () => {
  it('T1: a whole round ends at the round length and every arrival is accounted for', () => {
    const state = runRound(3, 'inTurn');
    expect(state.done).toBe(true);
    expect(state.tick).toBe(DEFAULT_CONFIG.roundTicks);
    expect(state.arrivals).toBeGreaterThan(0);
    expect(state.served + state.walkedOut + stillInShop(state)).toBe(
      state.arrivals,
    );
  });

  it('T2: the same seed and choices give identical results', () => {
    expect(runRound(5, 'shortest')).toEqual(runRound(5, 'shortest'));
    expect(runRound(5, 'inTurn')).toEqual(runRound(5, 'inTurn'));
  });

  it('T3: in turn gives each counter two of six customers', () => {
    let state = createGame(1, everyTick);
    for (let i = 0; i < 6; i += 1) state = tick(state, 'inTurn');
    expect(state.arrivals).toBe(6);
    expect(state.counters.map((c) => c.taken)).toEqual([2, 2, 2]);
  });

  it('T4: shortest line sends the next customer to the shortest line', () => {
    let state = createGame(1, noArrivals);
    state = {
      ...state,
      counters: state.counters.map((c, i) => ({
        ...c,
        queue: Array.from({ length: [3, 1, 2][i]! }, (_, k) =>
          customer(10 * i + k),
        ),
      })),
      waiting: [customer(99)],
    };
    state = tick(state, 'shortest');
    expect(state.counters.map((c) => c.taken)).toEqual([0, 1, 0]);
    expect(state.waiting).toHaveLength(0);
  });

  it('T5: by hand, the picked counter gets the customer', () => {
    let state = createGame(1, noArrivals);
    state = { ...state, waiting: [customer(1), customer(2)] };
    state = tick(state, 'manual');
    expect(state.waiting).toHaveLength(2);
    state = assignNext(state, 2);
    expect(state.counters.map((c) => c.taken)).toEqual([0, 0, 1]);
    expect(state.counters[2]!.queue[0]!.id).toBe(1);
    expect(state.waiting.map((c) => c.id)).toEqual([2]);
  });

  it('T6: by hand with no pick, a customer walks out and is counted', () => {
    const config: GameConfig = {
      ...everyTick,
      patienceMin: 5,
      patienceMax: 5,
    };
    let state = createGame(1, config);
    for (let i = 0; i < 6; i += 1) state = tick(state, 'manual');
    expect(state.walkedOut).toBe(1);
    expect(state.served + state.walkedOut + stillInShop(state)).toBe(
      state.arrivals,
    );
  });

  it('T7: shortest line loses fewer customers than in turn on every seed', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const turn = runRound(seed, 'inTurn');
      const shortest = runRound(seed, 'shortest');
      expect(turn.walkedOut).toBeGreaterThan(0);
      expect(shortest.walkedOut).toBeLessThan(turn.walkedOut);
    }
  });

  it('T11: arrivals rise from slow to fast on the same seed and every one is accounted for', () => {
    const speeds: ArrivalSpeed[] = ['slow', 'normal', 'fast'];
    for (let seed = 1; seed <= 12; seed += 1) {
      const rounds = speeds.map((s) =>
        runRound(seed, 'inTurn', DEFAULT_CONFIG, s),
      );
      const [slow, normal, fast] = rounds;
      expect(slow!.arrivals).toBeLessThan(normal!.arrivals);
      expect(normal!.arrivals).toBeLessThan(fast!.arrivals);
      for (const r of rounds) {
        expect(r.served + r.walkedOut + stillInShop(r)).toBe(r.arrivals);
      }
      expect(normal!.arrivals).toBe(runRound(seed, 'inTurn').arrivals);
    }
  });
});

describe('least work scenario', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it('T1: least work joins the counter that finishes soonest, not the one with the fewest people', () => {
    let state = createGame(1, noArrivals);
    // Counter 1 (speed 4): 2 people, 8 work. Counter 2 (speed 2): 2 people, 56 work.
    // Counter 3 (speed 1): 1 person, 30 work, so the fewest people but the slowest to finish.
    const sizes = [[4, 4], [28, 28], [30]];
    state = {
      ...state,
      counters: state.counters.map((c, i) => ({
        ...c,
        queue: sizes[i]!.map((size, k) => customer(10 * i + k, size)),
      })),
      waiting: [customer(99, 10)],
    };
    state = tick(state, 'leastWork');
    expect(state.counters.map((c) => c.taken)).toEqual([1, 0, 0]);
  });

  it('T1: remaining work counts the customer being served', () => {
    let state = createGame(1, noArrivals);
    const busy = customer(1, 100);
    state = {
      ...state,
      counters: state.counters.map((c, i) =>
        i === 0 ? { ...c, serving: { customer: busy, remaining: 100 } } : c,
      ),
      waiting: [customer(99, 10)],
    };
    state = tick(state, 'leastWork');
    expect(state.counters.map((c) => c.taken)).toEqual([0, 1, 0]);
  });

  it('T2: in the takeout rush least work loses fewer customers than shortest line on every seed', () => {
    for (const seed of seeds) {
      const shortest = runRound(seed, 'shortest', TAKEOUT_RUSH_CONFIG);
      const least = runRound(seed, 'leastWork', TAKEOUT_RUSH_CONFIG);
      expect(least.walkedOut).toBeLessThan(shortest.walkedOut);
    }
  });

  it('T3: with normal settings shortest line loses fewer customers than in turn on every seed', () => {
    for (const seed of seeds) {
      const turn = runRound(seed, 'inTurn');
      const shortest = runRound(seed, 'shortest');
      expect(shortest.walkedOut).toBeLessThan(turn.walkedOut);
    }
  });

  it('T4: the same seed with least work gives identical results and every arrival is accounted for', () => {
    const a = runRound(4, 'leastWork', TAKEOUT_RUSH_CONFIG);
    const b = runRound(4, 'leastWork', TAKEOUT_RUSH_CONFIG);
    expect(a).toEqual(b);
    expect(a.arrivals).toBeGreaterThan(0);
    expect(a.served + a.walkedOut + stillInShop(a)).toBe(a.arrivals);
    expect(a.arrivals).toBe(
      runRound(4, 'shortest', TAKEOUT_RUSH_CONFIG).arrivals,
    );
  });

  it('T5: counters tied on work divided by speed name the lowest counter number', () => {
    const base = createGame(1, noArrivals).counters;
    // 40/4 = 10, 20/2 = 10, 10/1 = 10
    const tied = base.map((c, i) => ({ ...c, work: [40, 20, 10][i]! }));
    expect(furthestBehind(tied)).toBe(0);
    const clear = base.map((c, i) => ({ ...c, work: [4, 20, 30][i]! }));
    expect(furthestBehind(clear)).toBe(2);
  });

  it('T11: every scenario seed shows shortest line failing in the rush and least work recovering', () => {
    for (const seed of SCENARIO_SEEDS) {
      const normal = runRound(seed, 'shortest').walkedOut;
      const rush = runRound(seed, 'shortest', TAKEOUT_RUSH_CONFIG).walkedOut;
      const least = runRound(seed, 'leastWork', TAKEOUT_RUSH_CONFIG).walkedOut;
      expect(rush - normal).toBeGreaterThanOrEqual(5);
      expect(least).toBeLessThanOrEqual(rush / 2);
    }
  });
});
