import type { ComponentType } from 'react';
import ExtremeCasesPanel from '@/features/simulation/ExtremeCasesPanel';
import LoadBalancerSimulation from '@/features/simulation/LoadBalancerSimulation';

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
};
