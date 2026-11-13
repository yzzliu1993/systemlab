import { useId, useState } from 'react';
import clsx from 'clsx';
import { validateSettings } from '@/domain/simulation/replication';
import type {
  ReadRouting,
  ReplicationMode,
  Settings,
} from '@/domain/simulation/replication';
import { buttonClass, fieldClass, fill } from '@/features/simulation/parts';
import {
  MODES,
  MODE_KEYS,
  ROUTINGS,
  ROUTING_KEYS,
} from '@/features/simulation/replicationLabels';
import { useT } from '@/stores/language';

type Draft = {
  followers: string;
  lags: string;
  syncFollowers: string;
  promotionDelay: string;
  mode: ReplicationMode;
  readRouting: ReadRouting;
  autoPromote: boolean;
};

function toDraft(settings: Settings): Draft {
  return {
    followers: String(settings.followers),
    lags: settings.followerLags.join(', '),
    syncFollowers: String(settings.syncFollowers),
    promotionDelay: String(settings.promotionDelay),
    mode: settings.mode,
    readRouting: settings.readRouting,
    autoPromote: settings.autoPromoteWithoutMajority,
  };
}

const parse = (text: string) => (text.trim() === '' ? NaN : Number(text));

/**
 * Editable numbers for section 5. Nothing reaches the run until Apply,
 * and invalid input is refused with a message. Remount (new key) to reload values.
 */
export default function ReplicationSettingsForm({
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

  const apply = () => {
    const followers = parse(draft.followers);
    const syncFollowers = parse(draft.syncFollowers);
    const next: Settings = {
      ...settings,
      followers,
      followerLags: draft.lags.split(',').map(parse),
      syncFollowers,
      promotionDelay: parse(draft.promotionDelay),
      mode: draft.mode,
      readRouting: draft.readRouting,
      autoPromoteWithoutMajority: draft.autoPromote,
    };
    try {
      validateSettings(next);
    } catch {
      const badK =
        next.mode === 'sync' &&
        Number.isInteger(followers) &&
        followers >= 1 &&
        (!Number.isInteger(syncFollowers) ||
          syncFollowers < 1 ||
          syncFollowers > followers);
      setError(
        badK
          ? fill(t('sim.repl.error.syncFollowers'), { n: followers })
          : t('sim.repl.error.invalid'),
      );
      return;
    }
    setError(null);
    onApply(next);
  };

  const field = (
    id: 'followers' | 'lags' | 'syncFollowers' | 'promotionDelay',
    label: string,
    wide = false,
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${uid}-${id}`} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={`${uid}-${id}`}
        type={id === 'lags' ? 'text' : 'number'}
        step="any"
        className={clsx(fieldClass, wide ? 'w-40' : 'w-28')}
        value={draft[id]}
        onChange={(event) =>
          setDraft((d) => ({ ...d, [id]: event.target.value }))
        }
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
        {field('followers', t('sim.repl.settings.followers'))}
        {field('lags', t('sim.repl.settings.lags'), true)}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-mode`} className="text-sm font-medium">
            {t('sim.repl.settings.mode')}
          </label>
          <select
            id={`${uid}-mode`}
            className={fieldClass}
            value={draft.mode}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                mode: e.target.value as ReplicationMode,
              }))
            }
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t(MODE_KEYS[m])}
              </option>
            ))}
          </select>
        </div>
        {field('syncFollowers', t('sim.repl.settings.syncFollowers'))}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-routing`} className="text-sm font-medium">
            {t('sim.repl.settings.routing')}
          </label>
          <select
            id={`${uid}-routing`}
            className={fieldClass}
            value={draft.readRouting}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                readRouting: e.target.value as ReadRouting,
              }))
            }
          >
            {ROUTINGS.map((r) => (
              <option key={r} value={r}>
                {t(ROUTING_KEYS[r])}
              </option>
            ))}
          </select>
        </div>
        {field('promotionDelay', t('sim.repl.settings.promotionDelay'))}
        <div className="flex items-end gap-2">
          <input
            id={`${uid}-autoPromote`}
            type="checkbox"
            checked={draft.autoPromote}
            onChange={(event) =>
              setDraft((d) => ({ ...d, autoPromote: event.target.checked }))
            }
          />
          <label htmlFor={`${uid}-autoPromote`} className="text-sm font-medium">
            {t('sim.repl.settings.autoPromote')}
          </label>
        </div>
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
