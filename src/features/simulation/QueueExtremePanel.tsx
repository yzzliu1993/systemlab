import { useState } from 'react';
import clsx from 'clsx';
import { DEFAULT_SETTINGS, PRESETS } from '@/domain/simulation/messageQueue';
import type { Settings } from '@/domain/simulation/messageQueue';
import { Playback, SeedField, buttonClass } from '@/features/simulation/parts';
import QueueRunView from '@/features/simulation/QueueRunView';
import QueueSettingsForm from '@/features/simulation/QueueSettingsForm';
import { useQueueRun } from '@/features/simulation/useQueueRun';
import { useT } from '@/stores/language';

type PresetId = keyof typeof PRESETS;
const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

/** Section 5: presets and editable settings that push the queue. */
export default function QueueExtremePanel() {
  const t = useT();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [preset, setPreset] = useState<PresetId | null>(null);
  // Bump to reload the form fields after a preset.
  const [formVersion, setFormVersion] = useState(0);
  const sim = useQueueRun(settings);

  const choose = (id: PresetId) => {
    setPreset(id);
    setSettings({ ...PRESETS[id], seed: settings.seed });
    setFormVersion((v) => v + 1);
  };

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.mq.extreme.title')}</h3>
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
            {t(`sim.mq.preset.${id}`)}
          </button>
        ))}
      </div>
      <SeedField
        key={settings.seed}
        seed={settings.seed}
        onChange={(seed) => setSettings({ ...settings, seed })}
      />
      <QueueSettingsForm
        key={formVersion}
        settings={settings}
        onApply={setSettings}
      />
      <Playback
        running={sim.running}
        complete={sim.complete}
        speed={sim.speed}
        onSpeed={sim.setSpeed}
        onPlay={sim.play}
        onPause={sim.pause}
        onStep={sim.step}
        onReset={sim.reset}
      />
      <QueueRunView run={sim.run} />
    </section>
  );
}
