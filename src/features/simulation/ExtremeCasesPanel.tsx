import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { DEFAULT_SETTINGS } from '@/domain/simulation/loadBalancer';
import type { Algorithm, Settings } from '@/domain/simulation/loadBalancer';
import CompareView from '@/features/simulation/CompareView';
import {
  AlgorithmPicker,
  Playback,
  RunView,
  AdvancedSeed,
  buttonClass,
} from '@/features/simulation/parts';
import { PRESET_IDS, applyPreset } from '@/features/simulation/presets';
import type { PresetId } from '@/features/simulation/presets';
import SettingsForm from '@/features/simulation/SettingsForm';
import { useRuns } from '@/features/simulation/useRuns';
import { useT } from '@/stores/language';

/** Section 5: presets and editable settings that push the system. */
export default function ExtremeCasesPanel() {
  const t = useT();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [preset, setPreset] = useState<PresetId | null>(null);
  // Bump to reload the form fields after a preset.
  const [formVersion, setFormVersion] = useState(0);
  const [comparing, setComparing] = useState(false);
  const sim = useRuns(useMemo(() => [settings], [settings]));

  const choose = (id: PresetId) => {
    setPreset(id);
    setSettings(applyPreset(id, settings));
    setFormVersion((v) => v + 1);
  };

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.extreme.title')}</h3>
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
            {t(`sim.preset.${id}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <AlgorithmPicker
          value={settings.algorithm}
          onChange={(algorithm: Algorithm) =>
            setSettings({ ...settings, algorithm })
          }
        />
        <AdvancedSeed
          key={settings.seed}
          seed={settings.seed}
          onChange={(seed) => setSettings({ ...settings, seed })}
        />
      </div>
      <SettingsForm
        key={formVersion}
        settings={settings}
        onApply={(next) => {
          setSettings(next);
        }}
      />
      <Playback
        playHintKey="sim.play.hint"
        running={sim.running}
        complete={sim.complete}
        speed={sim.speed}
        onSpeed={sim.setSpeed}
        onPlay={sim.play}
        onPause={sim.pause}
        onStep={sim.step}
        onReset={sim.reset}
      />
      <RunView run={sim.runs[0]!} />
      <div>
        <button
          type="button"
          className={buttonClass}
          aria-expanded={comparing}
          onClick={() => setComparing(!comparing)}
        >
          {comparing ? t('sim.compare.hide') : t('sim.compare.show')}
        </button>
      </div>
      {comparing && <CompareView settings={settings} />}
    </section>
  );
}
