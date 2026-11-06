import { nextRandom } from '@/domain/game/rng';

export const STRATEGIES = ['inTurn', 'shortest', 'manual'] as const;
export type Strategy = (typeof STRATEGIES)[number];

export type OrderKind = 'drink' | 'combo' | 'family' | 'takeout';

export type Customer = {
  id: number;
  kind: OrderKind;
  /** Work points needed to finish this order. */
  size: number;
  arrivedAt: number;
  /** Ticks the customer is willing to wait before walking out. */
  patience: number;
};

export type Counter = {
  /** Work points done per tick. */
  speed: number;
  serving: { customer: Customer; remaining: number } | null;
  queue: Customer[];
  served: number;
  /** Customers sent to this counter. */
  taken: number;
  /** Work points sent to this counter. */
  work: number;
};

export type GameConfig = {
  roundTicks: number;
  speeds: readonly number[];
  orders: readonly { kind: OrderKind; size: number; weight: number }[];
  /** Arrivals per second at the edges of the round and at the lunch peak. */
  baseRate: number;
  peakRate: number;
  peakAtTick: number;
  peakHalfWidthTicks: number;
  ticksPerSecond: number;
  patienceMin: number;
  patienceMax: number;
};

export const DEFAULT_CONFIG: GameConfig = {
  roundTicks: 600,
  // fast, steady, new
  speeds: [4, 2, 1],
  orders: [
    { kind: 'drink', size: 4, weight: 45 },
    { kind: 'combo', size: 14, weight: 30 },
    { kind: 'family', size: 28, weight: 17 },
    { kind: 'takeout', size: 64, weight: 8 },
  ],
  baseRate: 1.2,
  peakRate: 5.6,
  peakAtTick: 360,
  peakHalfWidthTicks: 300,
  ticksPerSecond: 10,
  patienceMin: 80,
  patienceMax: 140,
};

export type GameState = {
  config: GameConfig;
  tick: number;
  rng: number;
  nextId: number;
  nextTurn: number;
  arrivals: number;
  served: number;
  walkedOut: number;
  /** Customers who arrived but are not sent to a counter yet (by hand). */
  waiting: Customer[];
  counters: Counter[];
  done: boolean;
};

export function createGame(
  seed: number,
  config: GameConfig = DEFAULT_CONFIG,
): GameState {
  return {
    config,
    tick: 0,
    rng: seed >>> 0,
    nextId: 1,
    nextTurn: 0,
    arrivals: 0,
    served: 0,
    walkedOut: 0,
    waiting: [],
    counters: config.speeds.map((speed) => ({
      speed,
      serving: null,
      queue: [],
      served: 0,
      taken: 0,
      work: 0,
    })),
    done: false,
  };
}

function arrivalRate(config: GameConfig, tick: number): number {
  const distance = Math.abs(tick - config.peakAtTick);
  const lift = Math.max(0, 1 - distance / config.peakHalfWidthTicks);
  return config.baseRate + (config.peakRate - config.baseRate) * lift;
}

export function lineLength(counter: Counter): number {
  return counter.queue.length + (counter.serving ? 1 : 0);
}

function join(counter: Counter, customer: Customer): Counter {
  return {
    ...counter,
    queue: [...counter.queue, customer],
    taken: counter.taken + 1,
    work: counter.work + customer.size,
  };
}

function replaceAt<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((existing, i) => (i === index ? item : existing));
}

/** By hand: send the customer who has waited longest to the chosen counter. */
export function assignNext(state: GameState, counterIndex: number): GameState {
  const [customer, ...rest] = state.waiting;
  const counter = state.counters[counterIndex];
  if (!customer || !counter || state.done) return state;
  return {
    ...state,
    waiting: rest,
    counters: replaceAt(state.counters, counterIndex, join(counter, customer)),
  };
}

function route(state: GameState, strategy: Strategy): GameState {
  if (strategy === 'manual') return state;
  let next = state;
  for (const customer of state.waiting) {
    let index: number;
    if (strategy === 'inTurn') {
      index = next.nextTurn % next.counters.length;
      next = { ...next, nextTurn: next.nextTurn + 1 };
    } else {
      index = 0;
      const lines = next.counters.map(lineLength);
      lines.forEach((length, i) => {
        if (length < lines[index]!) index = i;
      });
    }
    next = {
      ...next,
      counters: replaceAt(
        next.counters,
        index,
        join(next.counters[index]!, customer),
      ),
    };
  }
  return { ...next, waiting: [] };
}

function work(counter: Counter): { counter: Counter; served: number } {
  let serving = counter.serving;
  let queue = counter.queue;
  if (!serving && queue.length > 0) {
    const [customer, ...rest] = queue;
    serving = { customer: customer!, remaining: customer!.size };
    queue = rest;
  }
  if (!serving) return { counter, served: 0 };
  const remaining = serving.remaining - counter.speed;
  if (remaining <= 0) {
    return {
      counter: { ...counter, serving: null, queue, served: counter.served + 1 },
      served: 1,
    };
  }
  return {
    counter: { ...counter, serving: { ...serving, remaining }, queue },
    served: 0,
  };
}

function maybeArrive(state: GameState, now: number): GameState {
  const config = state.config;
  const roll = nextRandom(state.rng);
  if (roll.value >= arrivalRate(config, now) / config.ticksPerSecond) {
    return { ...state, rng: roll.state };
  }
  const pick = nextRandom(roll.state);
  const patience = nextRandom(pick.state);
  const totalWeight = config.orders.reduce((sum, o) => sum + o.weight, 0);
  let target = pick.value * totalWeight;
  let order = config.orders[config.orders.length - 1]!;
  for (const candidate of config.orders) {
    if (target < candidate.weight) {
      order = candidate;
      break;
    }
    target -= candidate.weight;
  }
  const customer: Customer = {
    id: state.nextId,
    kind: order.kind,
    size: order.size,
    arrivedAt: now,
    patience:
      config.patienceMin +
      Math.floor(
        patience.value * (config.patienceMax - config.patienceMin + 1),
      ),
  };
  return {
    ...state,
    rng: patience.state,
    nextId: state.nextId + 1,
    arrivals: state.arrivals + 1,
    waiting: [...state.waiting, customer],
  };
}

/** Advance the game by one fixed tick using the chosen strategy. */
export function tick(state: GameState, strategy: Strategy): GameState {
  if (state.done) return state;
  const now = state.tick + 1;
  // Random draws do not depend on the strategy, so strategies face the same crowd.
  let next = route(maybeArrive({ ...state, tick: now }, now), strategy);

  let servedNow = 0;
  const counters = next.counters.map((counter) => {
    const result = work(counter);
    servedNow += result.served;
    return result.counter;
  });
  next = { ...next, counters, served: next.served + servedNow };

  // Customers who still wait (in a line or at the waiting spot) may walk out.
  let walked = 0;
  const stays = (c: Customer) => {
    const leaves = now - c.arrivedAt >= c.patience;
    if (leaves) walked += 1;
    return !leaves;
  };
  const waiting = next.waiting.filter(stays);
  const walkedCounters = next.counters.map((counter) => ({
    ...counter,
    queue: counter.queue.filter(stays),
  }));
  return {
    ...next,
    waiting,
    counters: walkedCounters,
    walkedOut: next.walkedOut + walked,
    done: now >= state.config.roundTicks,
  };
}

/** Customers still in the shop: in a line, being served, or at the waiting spot. */
export function stillInShop(state: GameState): number {
  return (
    state.waiting.length +
    state.counters.reduce((sum, c) => sum + lineLength(c), 0)
  );
}

/** Run a whole round with one strategy. For tests and tuning. */
export function runRound(
  seed: number,
  strategy: Strategy,
  config: GameConfig = DEFAULT_CONFIG,
): GameState {
  let state = createGame(seed, config);
  while (!state.done) state = tick(state, strategy);
  return state;
}
