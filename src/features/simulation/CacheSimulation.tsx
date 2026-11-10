import { useMemo, useState } from 'react';
import { DEFAULT_CACHE_SETTINGS } from '@/domain/simulation/cache';
import CacheRunView from '@/features/simulation/CacheRunView';
import { Playback, AdvancedSeed } from '@/features/simulation/parts';
import { useCacheRun } from '@/features/simulation/useCacheRun';
import { useT } from '@/stores/language';

/** Section 3: watch a cache in front of a database. */
export default function CacheSimulation() {
  const t = useT();
  const [seed, setSeed] = useState(DEFAULT_CACHE_SETTINGS.seed);
  const settings = useMemo(() => ({ ...DEFAULT_CACHE_SETTINGS, seed }), [seed]);
  const sim = useCacheRun(settings);

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.cache.how.title')}</h3>
      <div className="flex flex-wrap items-end gap-4">
        <AdvancedSeed seed={seed} onChange={setSeed} />
      </div>
      <Playback
        playHintKey="sim.cache.play.hint"
        running={sim.running}
        complete={sim.complete}
        speed={sim.speed}
        onSpeed={sim.setSpeed}
        onPlay={sim.play}
        onPause={sim.pause}
        onStep={sim.step}
        onReset={sim.reset}
      />
      <CacheRunView run={sim.run} />
    </section>
  );
}
