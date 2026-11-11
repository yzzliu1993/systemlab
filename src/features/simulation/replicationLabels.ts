import type {
  PRESETS,
  ReadRouting,
  ReplicationMode,
} from '@/domain/simulation/replication';

/** Locale keys written out in full so the locale key check can see them. */
export const MODE_KEYS: Record<ReplicationMode, string> = {
  async: 'sim.repl.mode.async',
  sync: 'sim.repl.mode.sync',
};

export const ROUTING_KEYS: Record<ReadRouting, string> = {
  leader: 'sim.repl.routing.leader',
  anyFollower: 'sim.repl.routing.anyFollower',
  readYourOwnWrites: 'sim.repl.routing.readYourOwnWrites',
};

export const PRESET_KEYS: Record<keyof typeof PRESETS, string> = {
  laggingFollower: 'sim.repl.preset.laggingFollower',
  leaderFailsAsync: 'sim.repl.preset.leaderFailsAsync',
  leaderFailsSync: 'sim.repl.preset.leaderFailsSync',
  networkPartition: 'sim.repl.preset.networkPartition',
};

export const MODES = Object.keys(MODE_KEYS) as ReplicationMode[];
export const ROUTINGS = Object.keys(ROUTING_KEYS) as ReadRouting[];
