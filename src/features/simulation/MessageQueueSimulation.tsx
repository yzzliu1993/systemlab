import { useMemo, useState } from 'react';
import { DEFAULT_SETTINGS } from '@/domain/simulation/messageQueue';
import { Playback, SeedField } from '@/features/simulation/parts';
import QueueRunView from '@/features/simulation/QueueRunView';
import { useQueueRun } from '@/features/simulation/useQueueRun';
import { useT } from '@/stores/language';

/** Section 3: watch producers, the queue and consumers. */
export default function MessageQueueSimulation() {
  const t = useT();
  const [seed, setSeed] = useState(DEFAULT_SETTINGS.seed);
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, seed }), [seed]);
  const sim = useQueueRun(settings);

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.mq.how.title')}</h3>
      <SeedField key={seed} seed={seed} onChange={setSeed} />
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
      <QueueRunView run={sim.run} />
    </section>
  );
}
