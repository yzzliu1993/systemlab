import { DEFAULT_SETTINGS } from '@/domain/simulation/loadBalancer';
import type { Settings } from '@/domain/simulation/loadBalancer';

export const PRESET_IDS = ['heavy', 'slow', 'mixed', 'down'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/** What each preset changes on top of the default settings. */
const OVERRIDES: Record<PresetId, Partial<Settings>> = {
  // Two and a half times the usual arrivals.
  heavy: { arrivalMultiplier: 2.5 },
  // Two steady servers and one very slow one; weights follow speed.
  slow: {
    servers: [
      { speed: 3, weight: 3 },
      { speed: 3, weight: 3 },
      { speed: 0.5, weight: 0.5 },
    ],
  },
  // Many tiny requests and a few huge ones, about the same total work as the default mix.
  mixed: {
    costMix: [
      { cost: 2, weight: 90 },
      { cost: 120, weight: 10 },
    ],
  },
  // The fastest server goes down at tick 200 and stays down.
  down: { serverDown: { server: 0, atTick: 200 } },
};

/** Settings for a preset. The reader's algorithm and seed are kept. */
export function applyPreset(
  id: PresetId,
  keep: Pick<Settings, 'algorithm' | 'seed'>,
): Settings {
  return { ...DEFAULT_SETTINGS, ...keep, ...OVERRIDES[id] };
}
