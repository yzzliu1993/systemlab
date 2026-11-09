import { useId, useState } from 'react';
import clsx from 'clsx';
import { validateSettings } from '@/domain/simulation/loadBalancer';
import type { Settings } from '@/domain/simulation/loadBalancer';
import { buttonClass, fieldClass, fill } from '@/features/simulation/parts';
import { useT } from '@/stores/language';

const MAX_SERVERS = 10;
const NEW_SERVER = { speed: 2, weight: 2 };

type Draft = {
  count: string;
  multiplier: string;
  downTick: string;
  downServer: string;
  rows: { speed: string; weight: string }[];
};

function toDraft(settings: Settings): Draft {
  return {
    count: String(settings.servers.length),
    multiplier: String(settings.arrivalMultiplier),
    downTick: settings.serverDown ? String(settings.serverDown.atTick) : '',
    downServer: String((settings.serverDown?.server ?? 0) + 1),
    rows: settings.servers.map((s) => ({
      speed: String(s.speed),
      weight: String(s.weight),
    })),
  };
}

const parse = (text: string) => (text.trim() === '' ? NaN : Number(text));

type Result =
  | { settings: Settings; error?: undefined }
  | { error: string; settings?: undefined };

function build(
  base: Settings,
  draft: Draft,
  t: (key: string) => string,
): Result {
  const count = parse(draft.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_SERVERS)
    return { error: t('sim.error.servers') };
  const multiplier = parse(draft.multiplier);
  if (!Number.isFinite(multiplier) || multiplier < 0)
    return { error: t('sim.error.multiplier') };
  const servers = draft.rows.slice(0, count).map((row) => ({
    speed: parse(row.speed),
    weight: parse(row.weight),
  }));
  if (
    servers.length !== count ||
    servers.some(
      (s) =>
        !Number.isFinite(s.speed) ||
        s.speed <= 0 ||
        !Number.isFinite(s.weight) ||
        s.weight <= 0,
    )
  )
    return { error: t('sim.error.perServer') };
  let serverDown: Settings['serverDown'];
  if (draft.downTick.trim() !== '') {
    const atTick = parse(draft.downTick);
    if (!Number.isInteger(atTick) || atTick < 1 || atTick > base.ticks)
      return { error: fill(t('sim.error.downTick'), { total: base.ticks }) };
    const server = parse(draft.downServer) - 1;
    if (!Number.isInteger(server) || server < 0 || server >= count)
      return { error: t('sim.error.downServer') };
    serverDown = { server, atTick };
  }
  const settings: Settings = {
    ...base,
    servers,
    arrivalMultiplier: multiplier,
    serverDown,
  };
  try {
    validateSettings(settings);
  } catch {
    return { error: t('sim.error.perServer') };
  }
  return { settings };
}

/**
 * Editable numbers for section 5. Nothing reaches the run until Apply,
 * and invalid input is refused with a message. Remount (new key) to reload values.
 */
export default function SettingsForm({
  settings,
  onApply,
}: {
  settings: Settings;
  onApply: (settings: Settings) => void;
}) {
  const t = useT();
  const uid = useId();
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [error, setError] = useState<string | null>(null);

  const setCount = (count: string) => {
    const n = parse(count);
    setDraft((current) => {
      let rows = current.rows;
      if (Number.isInteger(n) && n >= 1 && n <= MAX_SERVERS) {
        rows = Array.from({ length: n }, (_v, i) => {
          const row = current.rows[i];
          return (
            row ?? {
              speed: String(NEW_SERVER.speed),
              weight: String(NEW_SERVER.weight),
            }
          );
        });
      }
      return { ...current, count, rows };
    });
  };
  const setRow = (i: number, key: 'speed' | 'weight', value: string) =>
    setDraft((current) => ({
      ...current,
      rows: current.rows.map((row, k) =>
        k === i ? { ...row, [key]: value } : row,
      ),
    }));

  const apply = () => {
    const result = build(settings, draft, t);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setError(null);
    onApply(result.settings);
  };

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${uid}-${id}`} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={`${uid}-${id}`}
        type="number"
        step="any"
        className={clsx(fieldClass, 'w-28')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <h4 className="font-semibold">{t('sim.settings.title')}</h4>
      <div className="flex flex-wrap gap-3">
        {field('count', t('sim.settings.servers'), draft.count, setCount)}
        {field('mult', t('sim.settings.multiplier'), draft.multiplier, (v) =>
          setDraft((d) => ({ ...d, multiplier: v })),
        )}
        {field('down', t('sim.settings.downTick'), draft.downTick, (v) =>
          setDraft((d) => ({ ...d, downTick: v })),
        )}
        {field(
          'downServer',
          t('sim.settings.downServer'),
          draft.downServer,
          (v) => setDraft((d) => ({ ...d, downServer: v })),
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {draft.rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            {field(
              `speed${i}`,
              fill(t('sim.settings.speed'), { n: i + 1 }),
              row.speed,
              (v) => setRow(i, 'speed', v),
            )}
            {field(
              `weight${i}`,
              fill(t('sim.settings.weight'), { n: i + 1 }),
              row.weight,
              (v) => setRow(i, 'weight', v),
            )}
          </div>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div>
        <button type="submit" className={buttonClass}>
          {t('sim.settings.apply')}
        </button>
      </div>
    </form>
  );
}
