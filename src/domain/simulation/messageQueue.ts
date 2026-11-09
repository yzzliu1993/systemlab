import type { CostOption } from '@/domain/simulation/loadBalancer';
import { nextRandom } from '@/domain/simulation/rng';

export type Burst = {
  /** First tick of the burst (1-based). */
  startTick: number;
  /** How many ticks the burst lasts. */
  durationTicks: number;
  /** Messages per tick while the burst lasts. */
  rate: number;
};

export type Settings = {
  seed: number;
  /** Length of the run in ticks. */
  ticks: number;
  /** Messages added per tick. Can be fractional (0.5 is one message every other tick on average). */
  arrivalRate: number;
  burst?: Burst;
  consumers: number;
  /** Ticks a consumer needs for one message. `cost` here is in ticks. */
  processingMix: readonly CostOption[];
  /** Ticks a taken message stays hidden before it becomes visible again. */
  visibilityTimeout: number;
  /** After this many receives a message that is not acknowledged goes to the dead-letter queue. */
  maxReceiveCount: number;
  /** Chance (0 to 1) that one attempt to process a message fails. */
  failureChance: number;
  /** Every Nth message (by id) is a poison message that always fails. Omit for none. */
  poisonEvery?: number;
  /** When on, a consumer skips a message whose side effect is already applied. */
  idempotent: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  seed: 7,
  ticks: 300,
  arrivalRate: 0.8,
  consumers: 3,
  processingMix: [
    { cost: 1, weight: 50 },
    { cost: 3, weight: 35 },
    { cost: 8, weight: 15 },
  ],
  visibilityTimeout: 12,
  maxReceiveCount: 3,
  failureChance: 0.05,
  idempotent: true,
};

/**
 * Plain settings objects the UI can start from. Each one is DEFAULT_SETTINGS plus:
 * - trafficBurst: 0.6 messages per tick, with 3 per tick for 40 ticks from tick 60; 3 consumers.
 * - slowConsumers: 1.2 messages per tick, 2 consumers, processing of 2 / 5 / 12 ticks.
 * - timeoutShorterThanProcessing: 0.4 messages per tick, 4 consumers taking 6 ticks per
 *   message with a visibility timeout of 3, so messages come back while still being worked
 *   on; idempotency off.
 * - poisonMessage: every 25th message always fails; max receive count 3, timeout 6.
 */
export const PRESETS = {
  trafficBurst: {
    ...DEFAULT_SETTINGS,
    arrivalRate: 0.6,
    burst: { startTick: 60, durationTicks: 40, rate: 3 },
    consumers: 3,
  },
  slowConsumers: {
    ...DEFAULT_SETTINGS,
    arrivalRate: 1.2,
    consumers: 2,
    processingMix: [
      { cost: 2, weight: 40 },
      { cost: 5, weight: 40 },
      { cost: 12, weight: 20 },
    ],
  },
  timeoutShorterThanProcessing: {
    ...DEFAULT_SETTINGS,
    arrivalRate: 0.4,
    consumers: 4,
    processingMix: [{ cost: 6, weight: 1 }],
    visibilityTimeout: 3,
    idempotent: false,
  },
  poisonMessage: {
    ...DEFAULT_SETTINGS,
    poisonEvery: 25,
    maxReceiveCount: 3,
    visibilityTimeout: 6,
  },
} as const satisfies Record<string, Settings>;

export type Message = {
  id: number;
  /** Ticks one attempt takes. */
  cost: number;
  arrivedAt: number;
  poison: boolean;
  /** How many times consumers have taken it. */
  receiveCount: number;
  /** Tick at which a taken message becomes visible again. Null while visible. */
  hiddenUntil: number | null;
};

export type Consumer = {
  /** Message being processed, or null when idle. */
  messageId: number | null;
  poison: boolean;
  /** Which receive of the message this attempt is (1-based). */
  attempt: number;
  remaining: number;
};

export type TickStats = {
  tick: number;
  arrivals: number;
  /** Messages visible and waiting to be taken. */
  backlog: number;
  /** Ticks since arrival of the oldest visible message. 0 when none. */
  oldestAge: number;
  /** Taken and hidden, not yet acknowledged or timed out. */
  inFlight: number;
  /** Messages whose side effect was applied for the first time. */
  processed: number;
  failedAttempts: number;
  /** Times a message was taken after its first receive. */
  redeliveries: number;
  /** Side effects applied again for a message already done (idempotency off). */
  duplicateSideEffects: number;
  /** Duplicates a consumer skipped (idempotency on). */
  skippedDuplicates: number;
  deadLettered: number;
  /** Per consumer: idle (null) or busy with this message id. */
  consumers: (number | null)[];
};

export type RunState = {
  settings: Settings;
  tick: number;
  /** Stream for arrivals and costs. Does not depend on consumers, timeout or idempotency. */
  arrivalRng: number;
  nextId: number;
  arrivals: number;
  /** Messages in the queue, visible or hidden, in id order. */
  messages: Message[];
  deadLetters: Message[];
  consumers: Consumer[];
  /** Ids whose side effect has been applied. */
  applied: Record<number, true>;
  processed: number;
  failedAttempts: number;
  redeliveries: number;
  duplicateSideEffects: number;
  skippedDuplicates: number;
  /** One entry per finished tick. */
  history: TickStats[];
};

export function validateSettings(settings: Settings): void {
  const fail = (message: string): never => {
    throw new Error(`Invalid settings: ${message}`);
  };
  if (!Number.isFinite(settings.seed)) fail('seed must be a number');
  if (!Number.isInteger(settings.ticks) || settings.ticks < 1)
    fail('ticks must be a positive whole number');
  if (!Number.isFinite(settings.arrivalRate) || settings.arrivalRate < 0)
    fail('arrival rate must not be negative');
  const burst = settings.burst;
  if (burst) {
    if (!Number.isInteger(burst.startTick) || burst.startTick < 1)
      fail('burst start must be a positive whole number');
    if (!Number.isInteger(burst.durationTicks) || burst.durationTicks < 1)
      fail('burst length must be a positive whole number');
    if (!Number.isFinite(burst.rate) || burst.rate < 0)
      fail('burst rate must not be negative');
  }
  if (!Number.isInteger(settings.consumers) || settings.consumers < 1)
    fail('at least one consumer is needed');
  if (settings.processingMix.length < 1)
    fail('processing mix must not be empty');
  settings.processingMix.forEach((c, i) => {
    if (!Number.isInteger(c.cost) || c.cost < 1)
      fail(
        `processing option ${i} must take a whole number of ticks, 1 or more`,
      );
    if (!Number.isFinite(c.weight) || c.weight < 0)
      fail(`processing option ${i} weight must not be negative`);
  });
  if (settings.processingMix.reduce((sum, c) => sum + c.weight, 0) <= 0)
    fail('processing mix needs a positive total weight');
  if (
    !Number.isInteger(settings.visibilityTimeout) ||
    settings.visibilityTimeout < 1
  )
    fail('visibility timeout must be at least 1 tick');
  if (
    !Number.isInteger(settings.maxReceiveCount) ||
    settings.maxReceiveCount < 1
  )
    fail('max receive count must be at least 1');
  if (
    !Number.isFinite(settings.failureChance) ||
    settings.failureChance < 0 ||
    settings.failureChance > 1
  )
    fail('failure chance must be between 0 and 1');
  if (
    settings.poisonEvery !== undefined &&
    (!Number.isInteger(settings.poisonEvery) || settings.poisonEvery < 1)
  )
    fail('poison interval must be a positive whole number');
}

function idle(): Consumer {
  return { messageId: null, poison: false, attempt: 0, remaining: 0 };
}

/** Create a run. Throws when the settings are invalid. */
export function createRun(settings: Settings): RunState {
  validateSettings(settings);
  return {
    settings,
    tick: 0,
    arrivalRng: settings.seed >>> 0,
    nextId: 1,
    arrivals: 0,
    messages: [],
    deadLetters: [],
    consumers: Array.from({ length: settings.consumers }, () => idle()),
    applied: {},
    processed: 0,
    failedAttempts: 0,
    redeliveries: 0,
    duplicateSideEffects: 0,
    skippedDuplicates: 0,
    history: [],
  };
}

function rateAt(settings: Settings, tick: number): number {
  const burst = settings.burst;
  if (
    burst &&
    tick >= burst.startTick &&
    tick < burst.startTick + burst.durationTicks
  ) {
    return burst.rate;
  }
  return settings.arrivalRate;
}

/**
 * Whether attempt number `attempt` of message `id` fails by chance. Derived from the seed, the id
 * and the attempt, so it does not use up the arrival stream and does not depend on who takes the
 * message.
 */
function attemptFails(
  settings: Settings,
  id: number,
  attempt: number,
): boolean {
  const mixed =
    (settings.seed >>> 0) ^
    Math.imul(id, 0x9e3779b1) ^
    Math.imul(attempt, 0x85ebca6b);
  return nextRandom(mixed >>> 0).value < settings.failureChance;
}

function pickCost(settings: Settings, value: number): number {
  const mix = settings.processingMix;
  let target = value * mix.reduce((sum, c) => sum + c.weight, 0);
  for (const option of mix) {
    if (target < option.weight) return option.cost;
    target -= option.weight;
  }
  return mix[mix.length - 1]!.cost;
}

export function isComplete(state: RunState): boolean {
  return state.tick >= state.settings.ticks;
}

/** Advance the run by one tick. Does nothing once the run has its full length. */
export function step(state: RunState): RunState {
  if (isComplete(state)) return state;
  const { settings } = state;
  const now = state.tick + 1;
  let messages = state.messages;
  let deadLetters = state.deadLetters;
  const applied = { ...state.applied };
  let { processed, failedAttempts, redeliveries } = state;
  let { duplicateSideEffects, skippedDuplicates } = state;

  // 1. Producers add messages. Draws only come from the arrival stream.
  let rng = state.arrivalRng;
  const rate = rateAt(settings, now);
  const roll = nextRandom(rng);
  rng = roll.state;
  const whole = Math.floor(rate);
  const count = whole + (roll.value < rate - whole ? 1 : 0);
  let nextId = state.nextId;
  const added: Message[] = [];
  for (let i = 0; i < count; i += 1) {
    const pick = nextRandom(rng);
    rng = pick.state;
    added.push({
      id: nextId,
      cost: pickCost(settings, pick.value),
      arrivedAt: now,
      poison:
        settings.poisonEvery !== undefined &&
        nextId % settings.poisonEvery === 0,
      receiveCount: 0,
      hiddenUntil: null,
    });
    nextId += 1;
  }
  messages = [...messages, ...added];

  // 2. Consumers work. A consumer that finishes acts even if its message timed out meanwhile.
  const consumers = state.consumers.map((consumer) => {
    if (consumer.messageId === null) return consumer;
    const remaining = consumer.remaining - 1;
    if (remaining > 0) return { ...consumer, remaining };
    const id = consumer.messageId;
    const fails =
      consumer.poison || attemptFails(settings, id, consumer.attempt);
    if (fails) {
      // No acknowledgement: the message stays hidden until its timeout runs out.
      failedAttempts += 1;
    } else {
      if (applied[id]) {
        if (settings.idempotent) skippedDuplicates += 1;
        else duplicateSideEffects += 1;
      } else {
        applied[id] = true;
        processed += 1;
      }
      // Acknowledge: delete the message wherever it is in the queue.
      messages = messages.filter((m) => m.id !== id);
    }
    return idle();
  });

  // 3. Hidden messages whose timeout ran out become visible again, or go to the dead-letter queue.
  const expired = (m: Message) =>
    m.hiddenUntil !== null && m.hiddenUntil <= now;
  const dead = messages.filter(
    (m) => expired(m) && m.receiveCount >= settings.maxReceiveCount,
  );
  if (dead.length > 0) {
    deadLetters = [
      ...deadLetters,
      ...dead.map((m) => ({ ...m, hiddenUntil: null })),
    ];
  }
  messages = messages
    .filter((m) => !dead.includes(m))
    .map((m) => (expired(m) ? { ...m, hiddenUntil: null } : m));

  // 4. Idle consumers take the oldest visible messages.
  const taken = new Map<number, Message>();
  const taking = consumers.map((consumer) => {
    if (consumer.messageId !== null) return consumer;
    const message = messages.find(
      (m) => m.hiddenUntil === null && !taken.has(m.id),
    );
    if (!message) return consumer;
    const receiveCount = message.receiveCount + 1;
    if (receiveCount > 1) redeliveries += 1;
    taken.set(message.id, {
      ...message,
      receiveCount,
      hiddenUntil: now + settings.visibilityTimeout,
    });
    return {
      messageId: message.id,
      poison: message.poison,
      attempt: receiveCount,
      remaining: message.cost,
    };
  });
  messages = messages.map((m) => taken.get(m.id) ?? m);

  const visible = messages.filter((m) => m.hiddenUntil === null);
  const arrivals = state.arrivals + count;
  const stats: TickStats = {
    tick: now,
    arrivals,
    backlog: visible.length,
    oldestAge: visible.length === 0 ? 0 : now - visible[0]!.arrivedAt,
    inFlight: messages.length - visible.length,
    processed,
    failedAttempts,
    redeliveries,
    duplicateSideEffects,
    skippedDuplicates,
    deadLettered: deadLetters.length,
    consumers: taking.map((c) => c.messageId),
  };
  return {
    ...state,
    tick: now,
    arrivalRng: rng,
    nextId,
    arrivals,
    messages,
    deadLetters,
    consumers: taking,
    applied,
    processed,
    failedAttempts,
    redeliveries,
    duplicateSideEffects,
    skippedDuplicates,
    history: [...state.history, stats],
  };
}

/** Run a whole simulation. */
export function runSimulation(settings: Settings): RunState {
  let state = createRun(settings);
  while (!isComplete(state)) state = step(state);
  return state;
}

/** Stats for the latest tick. Before the first tick every count is 0. */
export function getStats(state: RunState): TickStats {
  return (
    state.history[state.history.length - 1] ?? {
      tick: 0,
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
      consumers: state.consumers.map(() => null),
    }
  );
}
