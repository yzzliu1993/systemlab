import { useId, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  STRATEGIES,
  simulate,
} from '@/domain/simulation/consistentHashing';
import type {
  ChangeReport,
  Settings,
  Strategy,
} from '@/domain/simulation/consistentHashing';
import HashingRunView from '@/features/simulation/HashingRunView';
import {
  MAX_NODES,
  MAX_VIRTUAL_NODES,
} from '@/features/simulation/hashingLimits';
import { buttonClass, fieldClass } from '@/features/simulation/parts';
import { useT } from '@/stores/language';

/** Section 3: watch keys move when a node joins or leaves. */
export default function HashingSimulation() {
  const t = useT();
  const uid = useId();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [report, setReport] = useState<ChangeReport | undefined>();
  const [vnodeDraft, setVnodeDraft] = useState(
    String(DEFAULT_SETTINGS.virtualNodes),
  );
  const [error, setError] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState('');
  const stats = useMemo(() => simulate(settings).before, [settings]);
  const nodeIds = settings.nodeIds;
  const atLimit = nodeIds.length >= MAX_NODES;
  const selected = nodeIds.includes(removeId) ? removeId : nodeIds[0];

  const change = (type: 'add' | 'remove') => {
    if (type === 'remove' && nodeIds.length < 2) {
      setError(t('sim.ch.error.lastNode'));
      return;
    }
    setError(null);
    const result = simulate({
      ...settings,
      change:
        type === 'add' ? { type: 'add' } : { type: 'remove', nodeId: selected },
    });
    if (!result.after || !result.report) return;
    setSettings({
      ...settings,
      nodeIds: result.after.nodes.map((n) => n.nodeId),
    });
    setReport(result.report);
  };

  const onVnodes = (text: string) => {
    setVnodeDraft(text);
    const n = Number(text);
    if (
      text.trim() === '' ||
      !Number.isInteger(n) ||
      n < 1 ||
      n > MAX_VIRTUAL_NODES
    ) {
      setError(t('sim.ch.error.virtualNodes'));
      return;
    }
    setError(null);
    setSettings({ ...settings, virtualNodes: n });
    setReport(undefined);
  };

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.ch.how.title')}</h3>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-rule`} className="text-sm font-medium">
            {t('sim.ch.rule')}
          </label>
          <select
            id={`${uid}-rule`}
            className={fieldClass}
            value={settings.strategy}
            onChange={(event) => {
              setSettings({
                ...settings,
                strategy: event.target.value as Strategy,
              });
              setReport(undefined);
            }}
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {t(`sim.ch.strategy.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-vnodes`} className="text-sm font-medium">
            {t('sim.ch.virtualNodes')}
          </label>
          <input
            id={`${uid}-vnodes`}
            type="number"
            className={`${fieldClass} w-28`}
            value={vnodeDraft}
            disabled={settings.strategy !== 'ring'}
            onChange={(event) => onVnodes(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className={buttonClass}
            disabled={atLimit}
            aria-describedby={atLimit ? `${uid}-add-limit` : undefined}
            onClick={() => change('add')}
          >
            {t('sim.ch.add')}
          </button>
          {atLimit && (
            <p id={`${uid}-add-limit`} className="text-sm">
              {t('sim.ch.addLimit')}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-remove`} className="text-sm font-medium">
            {t('sim.ch.removeSelect')}
          </label>
          <select
            id={`${uid}-remove`}
            className={fieldClass}
            value={selected}
            onChange={(event) => setRemoveId(event.target.value)}
          >
            {nodeIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={buttonClass}
          onClick={() => change('remove')}
        >
          {t('sim.ch.remove')}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <HashingRunView
        strategy={settings.strategy}
        virtualNodes={settings.virtualNodes}
        stats={stats}
        report={report}
      />
    </section>
  );
}
