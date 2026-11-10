import { useMemo, useState } from 'react';
import { DEFAULT_SETTINGS } from '@/domain/simulation/loadBalancer';
import type { Algorithm } from '@/domain/simulation/loadBalancer';
import {
  AlgorithmPicker,
  Playback,
  RunView,
  AdvancedSeed,
} from '@/features/simulation/parts';
import { useRuns } from '@/features/simulation/useRuns';
import { useT } from '@/stores/language';

/** Section 3: pick an algorithm, watch three servers. */
export default function LoadBalancerSimulation() {
  const t = useT();
  const [algorithm, setAlgorithm] = useState<Algorithm>(
    DEFAULT_SETTINGS.algorithm,
  );
  const [seed, setSeed] = useState(DEFAULT_SETTINGS.seed);
  const settings = useMemo(
    () => ({ ...DEFAULT_SETTINGS, algorithm, seed }),
    [algorithm, seed],
  );
  const sim = useRuns(useMemo(() => [settings], [settings]));

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.how.title')}</h3>
      <div className="flex flex-wrap items-end gap-4">
        <AlgorithmPicker value={algorithm} onChange={setAlgorithm} />
        <AdvancedSeed key={seed} seed={seed} onChange={setSeed} />
      </div>
      <Playback
        playHintKey="sim.play.hint"
        running={sim.running}
        complete={sim.complete}
        speed={sim.speed}
        onSpeed={sim.setSpeed}
        onPlay={sim.play}
        onPause={sim.pause}
        onStep={sim.step}
        onReset={sim.reset}
      />
      <RunView run={sim.runs[0]!} />
    </section>
  );
}
