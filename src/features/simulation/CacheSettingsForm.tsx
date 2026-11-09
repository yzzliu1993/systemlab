import { useId, useState } from 'react';
import clsx from 'clsx';
import { EVICTIONS, validateCacheSettings } from '@/domain/simulation/cache';
import type { CacheSettings, Eviction } from '@/domain/simulation/cache';
import { buttonClass, fieldClass } from '@/features/simulation/parts';
import { useT } from '@/stores/language';

type Draft = {
  capacity: string;
  eviction: Eviction;
  ttl: string;
  jitter: string;
  writes: string;
  invalidate: boolean;
  coalescing: boolean;
  dbCapacity: string;
};

type TextKey = 'capacity' | 'ttl' | 'jitter' | 'writes' | 'dbCapacity';

function toDraft(s: CacheSettings): Draft {
  return {
    capacity: String(s.cacheCapacity),
    eviction: s.eviction,
    ttl: String(s.ttl),
    jitter: String(s.ttlJitter),
    writes: String(s.writesPerTick),
    invalidate: s.invalidateOnWrite,
    coalescing: s.coalescing,
    dbCapacity: String(s.dbCapacity),
  };
}

const parse = (text: string) => (text.trim() === '' ? NaN : Number(text));

type Result =
  | { settings: CacheSettings; error?: undefined }
  | { error: string; settings?: undefined };

function build(
  base: CacheSettings,
  d: Draft,
  t: (key: string) => string,
): Result {
  const capacity = parse(d.capacity);
  if (!Number.isInteger(capacity) || capacity < 0)
    return { error: t('sim.cache.error.capacity') };
  const ttl = parse(d.ttl);
  if (!Number.isInteger(ttl) || ttl < 1)
    return { error: t('sim.cache.error.ttl') };
  const jitter = parse(d.jitter);
  if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1)
    return { error: t('sim.cache.error.jitter') };
  const writes = parse(d.writes);
  if (!Number.isFinite(writes) || writes < 0)
    return { error: t('sim.cache.error.writes') };
  const dbCapacity = parse(d.dbCapacity);
  if (!Number.isInteger(dbCapacity) || dbCapacity < 1)
    return { error: t('sim.cache.error.dbCapacity') };
  const settings: CacheSettings = {
    ...base,
    cacheCapacity: capacity,
    eviction: d.eviction,
    ttl,
    ttlJitter: jitter,
    writesPerTick: writes,
    invalidateOnWrite: d.invalidate,
    coalescing: d.coalescing,
    dbCapacity,
  };
  try {
    validateCacheSettings(settings);
  } catch {
    return { error: t('sim.cache.error.invalid') };
  }
  return { settings };
}

/**
 * Editable cache settings for section 5. Nothing reaches the run until Apply,
 * and invalid input is refused with a message. Remount (new key) to reload values.
 */
export default function CacheSettingsForm({
  settings,
  onApply,
}: {
  settings: CacheSettings;
  onApply: (settings: CacheSettings) => void;
}) {
  const t = useT();
  const uid = useId();
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [error, setError] = useState<string | null>(null);

  const number = (id: string, label: string, key: TextKey) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${uid}-${id}`} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={`${uid}-${id}`}
        type="number"
        step="any"
        className={clsx(fieldClass, 'w-28')}
        value={draft[key]}
        onChange={(event) =>
          setDraft((current) => ({ ...current, [key]: event.target.value }))
        }
      />
    </div>
  );
  const check = (
    id: string,
    label: string,
    key: 'invalidate' | 'coalescing',
  ) => (
    <div className="flex items-center gap-2 text-sm">
      <input
        id={`${uid}-${id}`}
        type="checkbox"
        checked={draft[key]}
        onChange={(event) =>
          setDraft((current) => ({ ...current, [key]: event.target.checked }))
        }
      />
      <label htmlFor={`${uid}-${id}`} className="font-medium">
        {label}
      </label>
    </div>
  );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const result = build(settings, draft, t);
        if (result.error !== undefined) {
          setError(result.error);
          return;
        }
        setError(null);
        onApply(result.settings);
      }}
    >
      <h4 className="font-semibold">{t('sim.settings.title')}</h4>
      <div className="flex flex-wrap items-end gap-3">
        {number('capacity', t('sim.cache.settings.capacity'), 'capacity')}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-eviction`} className="text-sm font-medium">
            {t('sim.cache.settings.eviction')}
          </label>
          <select
            id={`${uid}-eviction`}
            className={fieldClass}
            value={draft.eviction}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                eviction: event.target.value as Eviction,
              }))
            }
          >
            {EVICTIONS.map((e) => (
              <option key={e} value={e}>
                {t(`sim.cache.eviction.${e}`)}
              </option>
            ))}
          </select>
        </div>
        {number('ttl', t('sim.cache.settings.ttl'), 'ttl')}
        {number('jitter', t('sim.cache.settings.jitter'), 'jitter')}
        {number('writes', t('sim.cache.settings.writes'), 'writes')}
        {number('db', t('sim.cache.settings.dbCapacity'), 'dbCapacity')}
      </div>
      <div className="flex flex-wrap gap-4">
        {check('invalidate', t('sim.cache.settings.invalidate'), 'invalidate')}
        {check('coalescing', t('sim.cache.settings.coalescing'), 'coalescing')}
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
