import { useId, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS } from '@/domain/simulation/replication';
import type {
  ReadRouting,
  ReplicationMode,
} from '@/domain/simulation/replication';
import {
  Playback,
  AdvancedSeed,
  fieldClass,
} from '@/features/simulation/parts';
import ReplicationRunView from '@/features/simulation/ReplicationRunView';
import {
  MODES,
  MODE_KEYS,
  ROUTINGS,
  ROUTING_KEYS,
} from '@/features/simulation/replicationLabels';
import { useReplicationRun } from '@/features/simulation/useReplicationRun';
import { useT } from '@/stores/language';

const KS = Array.from({ length: DEFAULT_SETTINGS.followers }, (_v, i) => i + 1);

/** Section 3: watch the leader and followers, choose mode and read routing. */
export default function ReplicationSimulation() {
  const t = useT();
  const uid = useId();
  const [seed, setSeed] = useState(DEFAULT_SETTINGS.seed);
  const [mode, setMode] = useState<ReplicationMode>(DEFAULT_SETTINGS.mode);
  const [syncFollowers, setSyncFollowers] = useState(
    DEFAULT_SETTINGS.syncFollowers,
  );
  const [readRouting, setReadRouting] = useState<ReadRouting>(
    DEFAULT_SETTINGS.readRouting,
  );
  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, seed, mode, syncFollowers, readRouting }),
    [seed, mode, syncFollowers, readRouting],
  );
  const sim = useReplicationRun(settings);

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.repl.how.title')}</h3>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-mode`} className="text-sm font-medium">
            {t('sim.repl.settings.mode')}
          </label>
          <select
            id={`${uid}-mode`}
            className={fieldClass}
            value={mode}
            onChange={(e) => setMode(e.target.value as ReplicationMode)}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t(MODE_KEYS[m])}
              </option>
            ))}
          </select>
        </div>
        {mode === 'sync' && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-k`} className="text-sm font-medium">
              {t('sim.repl.settings.syncFollowers')}
            </label>
            <select
              id={`${uid}-k`}
              className={fieldClass}
              value={syncFollowers}
              onChange={(e) => setSyncFollowers(Number(e.target.value))}
            >
              {KS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-routing`} className="text-sm font-medium">
            {t('sim.repl.settings.routing')}
          </label>
          <select
            id={`${uid}-routing`}
            className={fieldClass}
            value={readRouting}
            onChange={(e) => setReadRouting(e.target.value as ReadRouting)}
          >
            {ROUTINGS.map((r) => (
              <option key={r} value={r}>
                {t(ROUTING_KEYS[r])}
              </option>
            ))}
          </select>
        </div>
      </div>
      <AdvancedSeed seed={seed} onChange={setSeed} />
      <Playback
        playHintKey="sim.repl.play.hint"
        running={sim.running}
        complete={sim.complete}
        speed={sim.speed}
        onSpeed={sim.setSpeed}
        onPlay={sim.play}
        onPause={sim.pause}
        onStep={sim.step}
        onReset={sim.reset}
      />
      <ReplicationRunView run={sim.run} />
    </section>
  );
}
