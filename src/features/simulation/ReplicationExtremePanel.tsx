import { useState } from 'react';
import clsx from 'clsx';
import { DEFAULT_SETTINGS, PRESETS } from '@/domain/simulation/replication';
import type { Settings } from '@/domain/simulation/replication';
import {
  Playback,
  AdvancedSeed,
  buttonClass,
} from '@/features/simulation/parts';
import ReplicationRunView from '@/features/simulation/ReplicationRunView';
import ReplicationSettingsForm from '@/features/simulation/ReplicationSettingsForm';
import { PRESET_KEYS } from '@/features/simulation/replicationLabels';
import { useReplicationRun } from '@/features/simulation/useReplicationRun';
import { useT } from '@/stores/language';

type PresetId = keyof typeof PRESETS;
const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

/** Section 5: presets and editable settings that push replication. */
export default function ReplicationExtremePanel() {
  const t = useT();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [preset, setPreset] = useState<PresetId | null>(null);
  // Bump to reload the form fields after a preset.
  const [formVersion, setFormVersion] = useState(0);
  const sim = useReplicationRun(settings);

  const choose = (id: PresetId) => {
    setPreset(id);
    setSettings({ ...PRESETS[id], seed: settings.seed });
    setFormVersion((v) => v + 1);
  };

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.repl.extreme.title')}</h3>
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
            {t(PRESET_KEYS[id])}
          </button>
        ))}
      </div>
      <AdvancedSeed
        seed={settings.seed}
        onChange={(seed) => setSettings({ ...settings, seed })}
      />
      <ReplicationSettingsForm
        key={formVersion}
        settings={settings}
        onApply={setSettings}
      />
      <Playback
        playHintKey="sim.repl.play.hint"
        running={sim.running}
        complete={sim.complete}
        speed={sim.speed}
        onSpeed={sim.setSpeed}
        onPlay={sim.play}
        onPause={sim.pause}
        onStep={sim.step}
        onReset={sim.reset}
      />
      <ReplicationRunView run={sim.run} />
    </section>
  );
}
