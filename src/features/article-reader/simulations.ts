import type { ComponentType } from 'react';
import CacheExtremePanel from '@/features/simulation/CacheExtremePanel';
import CacheSimulation from '@/features/simulation/CacheSimulation';
import ExtremeCasesPanel from '@/features/simulation/ExtremeCasesPanel';
import HashingExtremePanel from '@/features/simulation/HashingExtremePanel';
import HashingSimulation from '@/features/simulation/HashingSimulation';
import LoadBalancerSimulation from '@/features/simulation/LoadBalancerSimulation';
import MessageQueueSimulation from '@/features/simulation/MessageQueueSimulation';
import QueueExtremePanel from '@/features/simulation/QueueExtremePanel';
import RateLimitExtremePanel from '@/features/simulation/RateLimitExtremePanel';
import RateLimitSimulation from '@/features/simulation/RateLimitSimulation';

export type SlotName = 'how' | 'extreme';
export type ChapterSimulations = Readonly<
  Record<string, Partial<Record<SlotName, ComponentType>>>
>;

/** Maps chapter id to the simulation shown in each slot. Add entries for new chapters. */
export const simulations: ChapterSimulations = {
  'load-balancing': {
    how: LoadBalancerSimulation,
    extreme: ExtremeCasesPanel,
  },
  'message-queue': {
    how: MessageQueueSimulation,
    extreme: QueueExtremePanel,
  },
  caching: {
    how: CacheSimulation,
    extreme: CacheExtremePanel,
  },
  'rate-limiting': {
    how: RateLimitSimulation,
    extreme: RateLimitExtremePanel,
  },
  'consistent-hashing': {
    how: HashingSimulation,
    extreme: HashingExtremePanel,
  },
};
