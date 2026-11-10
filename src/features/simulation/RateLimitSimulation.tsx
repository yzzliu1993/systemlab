import { useId, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS } from '@/domain/simulation/rateLimit';
import type { Settings } from '@/domain/simulation/rateLimit';
import { Playback, SeedField, fieldClass } from '@/features/simulation/parts';
import RateLimitView from '@/features/simulation/RateLimitView';
import {
  LIMITER_ALGORITHMS,
  RETRY_MODES,
  limiterDefault,
  retryDefault,
} from '@/features/simulation/rateLimitSettings';
import { useRateLimitRun } from '@/features/simulation/useRateLimitRun';
import { useT } from '@/stores/language';

/** Section 3: pick a limiter and a retry mode, watch the requests. */
export default function RateLimitSimulation() {
  const t = useT();
  const algorithmId = useId();
  const retryId = useId();
  const [algorithm, setAlgorithm] = useState(
    DEFAULT_SETTINGS.limiter.algorithm,
  );
  const [retryMode, setRetryMode] = useState(DEFAULT_SETTINGS.retry.mode);
  const [seed, setSeed] = useState(DEFAULT_SETTINGS.seed);
  const settings = useMemo<Settings>(
    () => ({
      ...DEFAULT_SETTINGS,
      seed,
      limiter: limiterDefault(algorithm),
      retry: retryDefault(retryMode),
    }),
    [algorithm, retryMode, seed],
  );
  const sim = useRateLimitRun(settings);

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.rl.how.title')}</h3>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={algorithmId} className="text-sm font-medium">
            {t('sim.rl.algorithm.label')}
          </label>
          <select
            id={algorithmId}
            className={fieldClass}
            value={algorithm}
            onChange={(event) =>
              setAlgorithm(event.target.value as typeof algorithm)
            }
          >
            {LIMITER_ALGORITHMS.map((a) => (
              <option key={a} value={a}>
                {t(`sim.rl.algorithm.${a}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={retryId} className="text-sm font-medium">
            {t('sim.rl.retry.label')}
          </label>
          <select
            id={retryId}
            className={fieldClass}
            value={retryMode}
            onChange={(event) =>
              setRetryMode(event.target.value as typeof retryMode)
            }
          >
            {RETRY_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`sim.rl.retry.${m}`)}
              </option>
            ))}
          </select>
        </div>
        <SeedField key={seed} seed={seed} onChange={setSeed} />
      </div>
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
      <RateLimitView
        settings={settings}
        history={sim.history}
        tick={sim.tick}
      />
    </section>
  );
}
