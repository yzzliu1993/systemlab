import {
  DEFAULT_CONFIG,
  assignNext,
  createGame,
  runRound,
  stillInShop,
  tick,
} from '@/domain/game/lunchRush';
import type { Customer, GameConfig } from '@/domain/game/lunchRush';

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
});
