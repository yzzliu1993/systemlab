import clsx from 'clsx';
import type { Settings, TickStats } from '@/domain/simulation/rateLimit';
import { fill } from '@/features/simulation/parts';
import { noisyClients } from '@/features/simulation/rateLimitSettings';
import { totalsAt } from '@/features/simulation/useRateLimitRun';
import { useT } from '@/stores/language';

/** The run on screen: tick, per-client view, stats. */
export default function RateLimitView({
  settings,
  history,
  tick,
}: {
  settings: Settings;
  history: readonly TickStats[];
  tick: number;
}) {
  const t = useT();
  const total = history.length;
  const stats = totalsAt(history, tick, settings.clients.length);
  const noisy = noisyClients(settings.clients);
  const rows: [string, string | number][] = [
    [t('sim.rl.stats.sent'), stats.sent],
    [t('sim.rl.stats.accepted'), stats.accepted],
    [t('sim.rl.stats.rejected'), stats.rejected],
    [t('sim.rl.stats.shed'), stats.shed],
    [t('sim.rl.stats.retries'), stats.retries],
    [t('sim.rl.stats.inFlight'), stats.inFlight],
    [t('sim.rl.stats.serverQueue'), stats.serverQueue],
    [t('sim.rl.stats.averageLatency'), stats.averageLatency.toFixed(1)],
    [t('sim.rl.stats.maxLatency'), stats.maxLatency],
  ];
  return (
    <div className="flex flex-col gap-3">
      <p>
        {fill(t('sim.tick'), { tick, total })}
        {tick >= total && ` ${t('sim.complete')}`}
      </p>
      <p aria-live="polite" className="sr-only">
        {fill(t('sim.rl.stats.summary'), {
          tick,
          sent: stats.sent,
          accepted: stats.accepted,
          rejected: stats.rejected,
          shed: stats.shed,
          retries: stats.retries,
        })}
      </p>
      <ul
        className="flex flex-wrap gap-3"
        aria-label={t('sim.rl.clients.title')}
      >
        {settings.clients.map((_client, i) => (
          <li key={i} className="list-none">
            <section
              aria-label={fill(t('sim.rl.client.name'), { n: i + 1 })}
              className={clsx(
                'w-44 rounded border-2 p-2 text-sm',
                noisy.includes(i)
                  ? 'border-dashed border-slate-700 bg-slate-100'
                  : 'border-solid border-slate-500 bg-white',
              )}
            >
              <h4 className="font-semibold">
                {fill(t('sim.rl.client.name'), { n: i + 1 })}
              </h4>
              {noisy.includes(i) && <p>{t('sim.rl.client.noisy')}</p>}
              <p>
                {fill(t('sim.rl.client.firstAttempts'), {
                  n: stats.firstAttemptsByClient[i]!,
                })}
              </p>
              <p>
                {fill(t('sim.rl.client.accepted'), {
                  n: stats.acceptedByClient[i]!,
                })}
              </p>
            </section>
          </li>
        ))}
      </ul>
      <dl
        aria-label={t('sim.rl.stats.title')}
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
