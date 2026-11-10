import clsx from 'clsx';
import type { CacheRun } from '@/domain/simulation/cache';
import { fill } from '@/features/simulation/parts';
import { useT } from '@/stores/language';

const MAX_QUEUE_BOXES = 20;

/** Totals over the whole run so far, from the per-tick history. */
export function summarize(run: CacheRun) {
  let hits = 0;
  let misses = 0;
  let dbReads = 0;
  let staleReads = 0;
  let evictions = 0;
  let maxLatency = 0;
  for (const s of run.history) {
    hits += s.hits;
    misses += s.misses;
    dbReads += s.dbReads;
    staleReads += s.staleReads;
    evictions += s.evictions;
    if (s.maxLatency > maxLatency) maxLatency = s.maxLatency;
  }
  const last = run.history[run.history.length - 1];
  return {
    hitRate: hits + misses === 0 ? 0 : hits / (hits + misses),
    dbReads,
    dbQueue: last?.dbQueue ?? 0,
    averageLatency: last?.averageLatency ?? 0,
    maxLatency,
    staleReads,
    evictions,
    cacheSize: last?.cacheSize ?? 0,
    cacheView: last?.cacheView ?? [],
  };
}

/** The run on screen: tick, cache contents, database queue, stats. */
export default function CacheRunView({ run }: { run: CacheRun }) {
  const t = useT();
  const s = summarize(run);
  const total = run.settings.ticks;
  const percent = `${(s.hitRate * 100).toFixed(1)}%`;
  const shown = Math.min(s.dbQueue, MAX_QUEUE_BOXES);
  const rows: [string, string | number][] = [
    [t('sim.cache.stats.hitRate'), percent],
    [t('sim.cache.stats.dbReads'), s.dbReads],
    [t('sim.cache.stats.dbQueue'), s.dbQueue],
    [t('sim.cache.stats.averageLatency'), s.averageLatency.toFixed(1)],
    [t('sim.cache.stats.maxLatency'), s.maxLatency],
    [t('sim.cache.stats.staleReads'), s.staleReads],
    [t('sim.cache.stats.evictions'), s.evictions],
  ];
  return (
    <div className="flex flex-col gap-3">
      <p>
        {fill(t('sim.tick'), { tick: run.tick, total })}
        {run.tick >= total && ` ${t('sim.complete')}`}
      </p>
      <p aria-live="polite" className="sr-only">
        {fill(t('sim.cache.stats.summary'), {
          tick: run.tick,
          hitRate: percent,
          dbReads: s.dbReads,
          dbQueue: s.dbQueue,
          staleReads: s.staleReads,
        })}
      </p>
      <div className="flex flex-wrap gap-3">
        <section
          aria-label={t('sim.cache.contents.title')}
          className="w-72 rounded border-2 border-slate-500 bg-white p-2 text-sm"
        >
          <h4 className="font-semibold">{t('sim.cache.contents.title')}</h4>
          <p>
            {fill(t('sim.cache.contents.size'), {
              n: s.cacheSize,
              capacity: run.settings.cacheCapacity,
            })}
          </p>
          {s.cacheView.length === 0 ? (
            <p>{t('sim.cache.contents.empty')}</p>
          ) : (
            <ul>
              {s.cacheView.map((entry) => (
                <li
                  key={entry.key}
                  className={clsx(
                    'flex flex-wrap gap-2',
                    entry.stale && 'border-l-4 border-dashed pl-1',
                  )}
                >
                  <span>{fill(t('sim.cache.key'), { n: entry.key })}</span>
                  <span>{fill(t('sim.cache.uses'), { n: entry.uses })}</span>
                  {entry.hot && (
                    <strong>
                      <span aria-hidden="true">★ </span>
                      {t('sim.cache.hot')}
                    </strong>
                  )}
                  {entry.stale && (
                    <strong>
                      <span aria-hidden="true">⚠ </span>
                      {t('sim.cache.stale')}
                    </strong>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          aria-label={t('sim.cache.queue.title')}
          className="w-72 rounded border-2 border-slate-500 bg-white p-2 text-sm"
        >
          <h4 className="font-semibold">{t('sim.cache.queue.title')}</h4>
          <p>{fill(t('sim.cache.queue.waiting'), { n: s.dbQueue })}</p>
          <div className="mt-1 flex flex-wrap gap-0.5" aria-hidden="true">
            {Array.from({ length: shown }, (_v, k) => (
              <span
                key={k}
                className="h-3 w-3 border border-slate-600 bg-slate-300"
              />
            ))}
          </div>
          {s.dbQueue > shown && (
            <p>{fill(t('sim.server.queueMore'), { n: s.dbQueue - shown })}</p>
          )}
        </section>
      </div>
      <dl
        aria-label={t('sim.stats.title')}
        className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3"
      >
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt>{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
