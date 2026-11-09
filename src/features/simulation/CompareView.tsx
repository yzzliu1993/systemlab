import { useMemo, useState } from 'react';
import type { Algorithm, Settings } from '@/domain/simulation/loadBalancer';
import {
  AlgorithmPicker,
  Playback,
  RunView,
  fill,
} from '@/features/simulation/parts';
import { useRuns } from '@/features/simulation/useRuns';
import { useT } from '@/stores/language';

/** Two algorithms on the same seed and settings, side by side. */
export default function CompareView({ settings }: { settings: Settings }) {
  const t = useT();
  const [left, setLeft] = useState<Algorithm>('roundRobin');
  const [right, setRight] = useState<Algorithm>('leastConnections');
  const list = useMemo(
    () => [
      { ...settings, algorithm: left },
      { ...settings, algorithm: right },
    ],
    [settings, left, right],
  );
  const sim = useRuns(list);

  return (
    <section
      aria-label={t('sim.compare.title')}
      className="flex flex-col gap-3"
    >
      <h4 className="font-semibold">{t('sim.compare.title')}</h4>
      <Playback
        running={sim.running}
        complete={sim.complete}
        speed={sim.speed}
        onSpeed={sim.setSpeed}
        onPlay={sim.play}
        onPause={sim.pause}
        onStep={sim.step}
        onReset={sim.reset}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { side: 'left', value: left, set: setLeft },
          { side: 'right', value: right, set: setRight },
        ].map(({ side, value, set }, i) => (
          <section
            key={side}
            aria-label={fill(t('sim.compare.run'), {
              algorithm: t(`sim.algorithm.${value}`),
            })}
            className="flex flex-col gap-2"
          >
            <AlgorithmPicker
              label={t(`sim.compare.${side}`)}
              value={value}
              onChange={set}
            />
            <RunView run={sim.runs[i]!} />
          </section>
        ))}
      </div>
    </section>
  );
}
