import { useId, useState } from 'react';
import clsx from 'clsx';
import {
  STRATEGIES,
  validateSettings,
} from '@/domain/simulation/consistentHashing';
import type {
  Change,
  Settings,
  Strategy,
} from '@/domain/simulation/consistentHashing';
import {
  MAX_NODES,
  MAX_VIRTUAL_NODES,
} from '@/features/simulation/hashingLimits';
import { buttonClass, fieldClass } from '@/features/simulation/parts';
import { useT } from '@/stores/language';

type ChangeKind = 'none' | 'add' | 'remove';

type Draft = {
  strategy: Strategy;
  nodes: string;
  virtualNodes: string;
  keys: string;
  hotKeyShare: string;
  change: ChangeKind;
  removeId: string;
};

const MAX_KEYS = 10000;

const nodeIdsFor = (count: number) =>
  Array.from({ length: count }, (_v, i) => `n${i}`);

function toDraft(s: Settings): Draft {
  return {
    strategy: s.strategy,
    nodes: String(s.nodeIds.length),
    virtualNodes: String(s.virtualNodes),
    keys: String(s.keys),
    hotKeyShare: String(s.hotKeyShare),
    change: s.change?.type ?? 'none',
    removeId: s.change?.type === 'remove' ? s.change.nodeId : s.nodeIds[0],
  };
}

const parse = (text: string) => (text.trim() === '' ? NaN : Number(text));

type Result =
  | { settings: Settings; error?: undefined }
  | { error: string; settings?: undefined };

function build(base: Settings, d: Draft, t: (key: string) => string): Result {
  const nodes = parse(d.nodes);
  if (!Number.isInteger(nodes) || nodes < 1 || nodes > MAX_NODES)
    return { error: t('sim.ch.error.nodes') };
  const vnodes = parse(d.virtualNodes);
  if (!Number.isInteger(vnodes) || vnodes < 1 || vnodes > MAX_VIRTUAL_NODES)
    return { error: t('sim.ch.error.virtualNodes') };
  const keys = parse(d.keys);
  if (!Number.isInteger(keys) || keys < 1 || keys > MAX_KEYS)
    return { error: t('sim.ch.error.keys') };
  const share = parse(d.hotKeyShare);
  if (!Number.isFinite(share) || share < 0 || share > 1)
    return { error: t('sim.ch.error.hotKeyShare') };
  const nodeIds = nodeIdsFor(nodes);
  let change: Change | undefined;
  if (d.change === 'add') change = { type: 'add' };
  if (d.change === 'remove') {
    if (nodes < 2) return { error: t('sim.ch.error.lastNode') };
    if (!nodeIds.includes(d.removeId))
      return { error: t('sim.ch.error.removeUnknown') };
    change = { type: 'remove', nodeId: d.removeId };
  }
  const { change: _old, ...rest } = base;
  const settings: Settings = {
    ...rest,
    strategy: d.strategy,
    nodeIds,
    virtualNodes: vnodes,
    keys,
    hotKeyShare: share,
    ...(change ? { change } : {}),
  };
  try {
    validateSettings(settings);
  } catch {
    return { error: t('sim.ch.error.invalid') };
  }
  return { settings };
}

/**
 * Editable settings for section 5. Nothing reaches the run until Apply,
 * and invalid input is refused with a message. Remount (new key) to reload values.
 */
export default function HashingSettingsForm({
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
  const set = (patch: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const number = (
    id: string,
    label: string,
    key: 'nodes' | 'virtualNodes' | 'keys' | 'hotKeyShare',
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
        value={draft[key]}
        onChange={(event) => set({ [key]: event.target.value })}
      />
    </div>
  );
  const nodeCount = Number.isInteger(parse(draft.nodes))
    ? Math.min(Math.max(parse(draft.nodes), 1), MAX_NODES)
    : 1;
  const removeOptions = nodeIdsFor(nodeCount);

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
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-rule`} className="text-sm font-medium">
            {t('sim.ch.rule')}
          </label>
          <select
            id={`${uid}-rule`}
            className={fieldClass}
            value={draft.strategy}
            onChange={(event) =>
              set({ strategy: event.target.value as Strategy })
            }
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {t(`sim.ch.strategy.${s}`)}
              </option>
            ))}
          </select>
        </div>
        {number('nodes', t('sim.ch.settings.nodes'), 'nodes')}
        {number('vnodes', t('sim.ch.virtualNodes'), 'virtualNodes')}
        {number('keys', t('sim.ch.settings.keys'), 'keys')}
        {number('hot', t('sim.ch.settings.hotKeyShare'), 'hotKeyShare')}
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-change`} className="text-sm font-medium">
            {t('sim.ch.settings.change')}
          </label>
          <select
            id={`${uid}-change`}
            className={fieldClass}
            value={draft.change}
            onChange={(event) =>
              set({ change: event.target.value as ChangeKind })
            }
          >
            <option value="none">{t('sim.ch.settings.change.none')}</option>
            <option value="add">{t('sim.ch.add')}</option>
            <option value="remove">{t('sim.ch.remove')}</option>
          </select>
        </div>
        {draft.change === 'remove' && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-remove`} className="text-sm font-medium">
              {t('sim.ch.removeSelect')}
            </label>
            <select
              id={`${uid}-remove`}
              className={fieldClass}
              value={draft.removeId}
              onChange={(event) => set({ removeId: event.target.value })}
            >
              {removeOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
        )}
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
