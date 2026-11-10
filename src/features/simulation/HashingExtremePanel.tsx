import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  DEFAULT_SETTINGS,
  PRESETS,
  simulate,
} from '@/domain/simulation/consistentHashing';
import type { Settings } from '@/domain/simulation/consistentHashing';
import HashingRunView from '@/features/simulation/HashingRunView';
import HashingSettingsForm from '@/features/simulation/HashingSettingsForm';
import { buttonClass } from '@/features/simulation/parts';
import { useT } from '@/stores/language';

type PresetId = keyof typeof PRESETS;
const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

/** Section 5: consistent hashing presets and editable settings that push the system. */
export default function HashingExtremePanel() {
  const t = useT();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [preset, setPreset] = useState<PresetId | null>(null);
  // Bump to reload the form fields after a preset.
  const [formVersion, setFormVersion] = useState(0);
  const result = useMemo(() => simulate(settings), [settings]);

  const choose = (id: PresetId) => {
    setPreset(id);
    setSettings({ ...DEFAULT_SETTINGS, ...PRESETS[id] });
    setFormVersion((v) => v + 1);
  };

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.ch.extreme.title')}</h3>
      <div
        role="group"
        aria-label={t('sim.preset.label')}
        className="flex flex-wrap gap-2"
      >
        {PRESET_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={preset === id}
            className={clsx(
              buttonClass,
              preset === id && 'border-2 font-semibold',
            )}
            onClick={() => choose(id)}
          >
            {t(`sim.ch.preset.${id}`)}
          </button>
        ))}
      </div>
      <HashingSettingsForm
        key={formVersion}
        settings={settings}
        onApply={setSettings}
      />
      <HashingRunView
        strategy={settings.strategy}
        virtualNodes={settings.virtualNodes}
        stats={result.after ?? result.before}
        report={result.report}
      />
    </section>
  );
}
