import { getStats } from '@/domain/simulation/messageQueue';
import type { RunState } from '@/domain/simulation/messageQueue';
import { fill } from '@/features/simulation/parts';
import { useT } from '@/stores/language';

const MAX_SHOWN = 12;

function IdList({ ids, label }: { ids: number[]; label: string }) {
  const t = useT();
  const shown = ids.slice(0, MAX_SHOWN);
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1 text-sm">
      {shown.map((id) => (
        <li key={id} className="rounded border border-slate-600 px-1">
          {`#${id}`}
        </li>
      ))}
      {ids.length > shown.length && (
        <li className="list-none">
          {fill(t('sim.mq.more'), { n: ids.length - shown.length })}
        </li>
      )}
    </ul>
  );
}

/** The run on screen: tick, queue, in-flight messages, consumers, stats row. */
export default function QueueRunView({ run }: { run: RunState }) {
  const t = useT();
  const stats = getStats(run);
  const total = run.settings.ticks;
  const visible = run.messages.filter((m) => m.hiddenUntil === null);
  const hidden = run.messages.filter((m) => m.hiddenUntil !== null);
  const rows: [string, number][] = [
    [t('sim.mq.stats.backlog'), stats.backlog],
    [t('sim.mq.stats.oldestAge'), stats.oldestAge],
    [t('sim.mq.stats.inFlight'), stats.inFlight],
    [t('sim.mq.stats.processed'), stats.processed],
    [t('sim.mq.stats.redeliveries'), stats.redeliveries],
    [t('sim.mq.stats.duplicates'), stats.duplicateSideEffects],
    [t('sim.mq.stats.skipped'), stats.skippedDuplicates],
    [t('sim.mq.stats.deadLettered'), stats.deadLettered],
  ];
  return (
    <div className="flex flex-col gap-3">
      <p>
        {fill(t('sim.tick'), { tick: stats.tick, total })}
        {stats.tick >= total && ` ${t('sim.complete')}`}
      </p>
      <p aria-live="polite" className="sr-only">
        {fill(t('sim.mq.stats.summary'), {
          tick: stats.tick,
          backlog: stats.backlog,
          processed: stats.processed,
          redeliveries: stats.redeliveries,
          duplicates: stats.duplicateSideEffects,
          deadLettered: stats.deadLettered,
        })}
      </p>
      <section aria-label={t('sim.mq.queue.title')} className="text-sm">
        <h4 className="font-semibold">{t('sim.mq.queue.title')}</h4>
        <p>{fill(t('sim.mq.queue.count'), { n: visible.length })}</p>
        <IdList ids={visible.map((m) => m.id)} label={t('sim.mq.queue.list')} />
      </section>
      <section aria-label={t('sim.mq.inFlight.title')} className="text-sm">
        <h4 className="font-semibold">{t('sim.mq.inFlight.title')}</h4>
        <p>{fill(t('sim.mq.inFlight.count'), { n: hidden.length })}</p>
        <IdList
          ids={hidden.map((m) => m.id)}
          label={t('sim.mq.inFlight.list')}
        />
      </section>
      <ul
        className="flex flex-wrap gap-3"
        aria-label={t('sim.mq.consumers.title')}
      >
        {run.consumers.map((consumer, i) => (
          <li key={i} className="list-none">
            <section
              aria-label={fill(t('sim.mq.consumer.name'), { n: i + 1 })}
              className="w-40 rounded border-2 border-slate-500 bg-white p-2 text-sm"
            >
              <h4 className="font-semibold">
                {fill(t('sim.mq.consumer.name'), { n: i + 1 })}
              </h4>
              <p>
                <span aria-hidden="true">
                  {consumer.messageId === null ? '○ ' : '● '}
                </span>
                {consumer.messageId === null
                  ? t('sim.mq.consumer.idle')
                  : fill(t('sim.mq.consumer.busy'), { id: consumer.messageId })}
              </p>
            </section>
          </li>
        ))}
      </ul>
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
