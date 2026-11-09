import { useId, useState } from 'react';
import clsx from 'clsx';
import { ALGORITHMS, getStats } from '@/domain/simulation/loadBalancer';
import type { Algorithm, RunState } from '@/domain/simulation/loadBalancer';
import { SPEEDS } from '@/features/simulation/useRuns';
import { useT } from '@/stores/language';

export function fill(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_m, key: string) =>
    String(values[key] ?? ''),
  );
}

const buttonClass =
  'rounded border border-slate-400 bg-white px-3 py-1 text-sm hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:opacity-50';
const fieldClass = 'rounded border border-slate-400 bg-white px-2 py-1 text-sm';

export function AlgorithmPicker({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: Algorithm;
  onChange: (algorithm: Algorithm) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label ?? t('sim.algorithm.label')}
      </label>
      <select
        id={id}
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value as Algorithm)}
      >
        {ALGORITHMS.map((algorithm) => (
          <option key={algorithm} value={algorithm}>
            {t(`sim.algorithm.${algorithm}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SeedField({
  seed,
  onChange,
}: {
  seed: number;
  onChange: (seed: number) => void;
}) {
  const t = useT();
  const id = useId();
  const [draft, setDraft] = useState(String(seed));
  const [invalid, setInvalid] = useState(false);
  const apply = () => {
    const value = Number(draft);
    if (draft.trim() === '' || !Number.isInteger(value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(value);
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {t('sim.seed.label')}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="number"
          step="any"
          className={clsx(fieldClass, 'w-28')}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" className={buttonClass} onClick={apply}>
          {t('sim.seed.set')}
        </button>
      </div>
      {invalid && <p role="alert">{t('sim.seed.invalid')}</p>}
    </div>
  );
}

export function Playback({
  running,
  complete,
  speed,
  onSpeed,
  onPlay,
  onPause,
  onStep,
  onReset,
}: {
  running: boolean;
  complete: boolean;
  speed: number;
  onSpeed: (speed: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex flex-wrap items-end gap-2">
      {running ? (
        <button type="button" className={buttonClass} onClick={onPause}>
          {t('sim.pause')}
        </button>
      ) : (
        <button
          type="button"
          className={buttonClass}
          onClick={onPlay}
          disabled={complete}
        >
          {t('sim.play')}
        </button>
      )}
      <button
        type="button"
        className={buttonClass}
        onClick={onStep}
        disabled={complete}
      >
        {t('sim.step')}
      </button>
      <button type="button" className={buttonClass} onClick={onReset}>
        {t('sim.reset')}
      </button>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          {t('sim.speed.label')}
        </label>
        <select
          id={id}
          className={fieldClass}
          value={speed}
          onChange={(event) => onSpeed(Number(event.target.value))}
        >
          {SPEEDS.map((option) => (
            <option key={option} value={option}>
              {`${option}x`}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const MAX_QUEUE_BOXES = 20;

/** The run on screen: tick, servers with queues, stats row. */
export function RunView({ run }: { run: RunState }) {
  const t = useT();
  const stats = getStats(run);
  const total = run.settings.ticks;
  const rows: [string, string | number][] = [
    [t('sim.stats.arrived'), stats.arrivals],
    [t('sim.stats.finished'), stats.finished],
    [t('sim.stats.failed'), stats.failed],
    [t('sim.stats.waiting'), stats.waiting],
    [t('sim.stats.averageWait'), stats.averageWait.toFixed(1)],
    [t('sim.stats.maxWait'), stats.maxWait],
  ];
  return (
    <div className="flex flex-col gap-3">
      <p>
        {fill(t('sim.tick'), { tick: stats.tick, total })}
        {stats.tick >= total && ` ${t('sim.complete')}`}
      </p>
      <p aria-live="polite" className="sr-only">
        {fill(t('sim.stats.summary'), {
          tick: stats.tick,
          arrived: stats.arrivals,
          finished: stats.finished,
          failed: stats.failed,
          waiting: stats.waiting,
        })}
      </p>
      <ul className="flex flex-wrap gap-3" aria-label={t('sim.servers.title')}>
        {run.servers.map((server, i) => {
          const s = stats.servers[i]!;
          const shown = Math.min(s.queue, MAX_QUEUE_BOXES);
          return (
            <li key={i} className="list-none">
              <section
                aria-label={fill(t('sim.server.name'), { n: i + 1 })}
                className={clsx(
                  'w-44 rounded border-2 p-2 text-sm',
                  s.up
                    ? 'border-solid border-slate-500 bg-white'
                    : 'border-dashed border-slate-500 bg-slate-200',
                )}
              >
                <h4 className="font-semibold">
                  {fill(t('sim.server.name'), { n: i + 1 })}
                </h4>
                <p>
                  <span aria-hidden="true">{s.up ? '● ' : '✕ '}</span>
                  <span>
                    {s.up ? t('sim.server.up') : t('sim.server.down')}
                  </span>
                </p>
                <p>
                  {fill(t('sim.server.speed'), { n: server.speed })},{' '}
                  {fill(t('sim.server.weight'), { n: server.weight })}
                </p>
                <p>{fill(t('sim.server.active'), { n: s.active })}</p>
                <p>{fill(t('sim.server.queue'), { n: s.queue })}</p>
                <div className="mt-1 flex flex-wrap gap-0.5" aria-hidden="true">
                  {s.active > 0 && <span className="h-3 w-3 bg-slate-800" />}
                  {Array.from({ length: shown }, (_v, k) => (
                    <span
                      key={k}
                      className="h-3 w-3 border border-slate-600 bg-slate-300"
                    />
                  ))}
                </div>
                {s.queue > shown && (
                  <p>
                    {fill(t('sim.server.queueMore'), { n: s.queue - shown })}
                  </p>
                )}
              </section>
            </li>
          );
        })}
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

export { buttonClass, fieldClass };
