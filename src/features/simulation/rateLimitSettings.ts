import { DEFAULT_SETTINGS, PRESETS } from '@/domain/simulation/rateLimit';
import type {
  Client,
  LimiterConfig,
  RetryConfig,
  Settings,
} from '@/domain/simulation/rateLimit';

export const LIMITER_ALGORITHMS = [
  'tokenBucket',
  'leakyBucket',
  'fixedWindow',
] as const;
export const RETRY_MODES = ['none', 'immediate', 'backoff'] as const;
export const SCOPES = ['global', 'perClient'] as const;
export const RL_PRESET_IDS = [
  'burstBiggerThanBucket',
  'noisyClient',
  'retryStorm',
  'loadShedding',
] as const;
export type RateLimitPresetId = (typeof RL_PRESET_IDS)[number];

const LIMITER_DEFAULTS: Record<LimiterConfig['algorithm'], LimiterConfig> = {
  tokenBucket: { algorithm: 'tokenBucket', capacity: 10, refillPerTick: 4 },
  leakyBucket: { algorithm: 'leakyBucket', queueSize: 10, drainPerTick: 4 },
  fixedWindow: { algorithm: 'fixedWindow', limit: 20, windowTicks: 5 },
};

const RETRY_DEFAULTS: Record<RetryConfig['mode'], RetryConfig> = {
  none: { mode: 'none' },
  immediate: { mode: 'immediate', maxAttempts: 5 },
  backoff: {
    mode: 'backoff',
    maxAttempts: 5,
    baseDelayTicks: 2,
    maxDelayTicks: 32,
  },
};

export function limiterDefault(
  algorithm: LimiterConfig['algorithm'],
): LimiterConfig {
  return LIMITER_DEFAULTS[algorithm];
}

export function retryDefault(mode: RetryConfig['mode']): RetryConfig {
  return RETRY_DEFAULTS[mode];
}

/** Settings for a preset. The reader's seed is kept. */
export function applyRateLimitPreset(
  id: RateLimitPresetId,
  seed: number,
): Settings {
  return { ...DEFAULT_SETTINGS, ...PRESETS[id], seed };
}

/**
 * Indexes of clients that send far more than the rest: at least three times
 * the average of the other clients. A lone client is never marked.
 */
export function noisyClients(clients: readonly Client[]): number[] {
  if (clients.length < 2) return [];
  const total = clients.reduce((sum, c) => sum + c.rate, 0);
  return clients.flatMap((c, i) => {
    const others = (total - c.rate) / (clients.length - 1);
    return c.rate > 0 && c.rate >= 3 * others ? [i] : [];
  });
}
