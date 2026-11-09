import { useId, useState } from 'react';
import clsx from 'clsx';
import { validateSettings } from '@/domain/simulation/messageQueue';
import type { Settings } from '@/domain/simulation/messageQueue';
import { buttonClass, fieldClass } from '@/features/simulation/parts';
import { useT } from '@/stores/language';

const DEFAULT_BURST = { startTick: 60, durationTicks: 40 };

type Draft = {
  rate: string;
  burst: string;
  consumers: string;
  cost: string;
  timeout: string;
  maxReceive: string;
  idempotent: boolean;
};

/** One number standing for a processing mix: its weighted mean, at least 1 tick. */
function meanCost(settings: Settings): number {
  const mix = settings.processingMix;
  const total = mix.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return 1;
  const mean = mix.reduce((sum, c) => sum + c.cost * c.weight, 0) / total;
  return Math.max(1, Math.round(mean));
}

function toDraft(settings: Settings): Draft {
  return {
    rate: String(settings.arrivalRate),
    burst: String(settings.burst?.rate ?? 0),
    consumers: String(settings.consumers),
    cost: String(meanCost(settings)),
    timeout: String(settings.visibilityTimeout),
    maxReceive: String(settings.maxReceiveCount),
    idempotent: settings.idempotent,
  };
}

const parse = (text: string) => (text.trim() === '' ? NaN : Number(text));

/**
 * Editable numbers for section 5. Nothing reaches the run until Apply,
 * and invalid input is refused with a message. Remount (new key) to reload values.
 */
export default function QueueSettingsForm({
  settings,
  onApply,
}: {
  settings: Settings;
  onApply: (settings: Settings) => void;
}) {
  const t = useT();
  const uid = useId();
  const [initial] = useState(() => toDraft(settings));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    const burstRate = parse(draft.burst);
    if (Number.isNaN(burstRate) || burstRate < 0) {
      setError(t('sim.mq.error.invalid'));
      return;
    }
    const next: Settings = {
      ...settings,
      arrivalRate: parse(draft.rate),
      burst:
        burstRate > 0
          ? {
              startTick: settings.burst?.startTick ?? DEFAULT_BURST.startTick,
              durationTicks:
                settings.burst?.durationTicks ?? DEFAULT_BURST.durationTicks,
              rate: burstRate,
            }
          : undefined,
      consumers: parse(draft.consumers),
      // An untouched cost keeps the preset's own mix.
      processingMix:
        draft.cost === initial.cost
          ? settings.processingMix
          : [{ cost: parse(draft.cost), weight: 1 }],
      visibilityTimeout: parse(draft.timeout),
      maxReceiveCount: parse(draft.maxReceive),
      idempotent: draft.idempotent,
    };
    try {
      validateSettings(next);
    } catch {
      setError(t('sim.mq.error.invalid'));
      return;
    }
    setError(null);
    onApply(next);
  };

  const field = (id: Exclude<keyof Draft, 'idempotent'>, label: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${uid}-${id}`} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={`${uid}-${id}`}
        type="number"
        step="any"
        className={clsx(fieldClass, 'w-28')}
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
        {field('rate', t('sim.mq.settings.rate'))}
        {field('burst', t('sim.mq.settings.burst'))}
        {field('consumers', t('sim.mq.settings.consumers'))}
        {field('cost', t('sim.mq.settings.cost'))}
        {field('timeout', t('sim.mq.settings.timeout'))}
        {field('maxReceive', t('sim.mq.settings.maxReceive'))}
        <div className="flex items-end gap-2">
          <input
            id={`${uid}-idempotent`}
            type="checkbox"
            checked={draft.idempotent}
            onChange={(event) =>
              setDraft((d) => ({ ...d, idempotent: event.target.checked }))
            }
          />
          <label htmlFor={`${uid}-idempotent`} className="text-sm font-medium">
            {t('sim.mq.settings.idempotent')}
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
