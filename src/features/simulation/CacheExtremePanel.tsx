import { useState } from 'react';
import clsx from 'clsx';
import {
  CACHE_PRESETS,
  DEFAULT_CACHE_SETTINGS,
} from '@/domain/simulation/cache';
import type { CacheSettings } from '@/domain/simulation/cache';
import CacheRunView from '@/features/simulation/CacheRunView';
import CacheSettingsForm from '@/features/simulation/CacheSettingsForm';
import {
  Playback,
  AdvancedSeed,
  buttonClass,
} from '@/features/simulation/parts';
import { useCacheRun } from '@/features/simulation/useCacheRun';
import { useT } from '@/stores/language';

type PresetId = keyof typeof CACHE_PRESETS;
const PRESET_IDS = Object.keys(CACHE_PRESETS) as PresetId[];

/** Section 5: cache presets and editable settings that push the system. */
export default function CacheExtremePanel() {
  const t = useT();
  const [settings, setSettings] = useState<CacheSettings>(
    DEFAULT_CACHE_SETTINGS,
  );
  const [preset, setPreset] = useState<PresetId | null>(null);
  // Bump to reload the form fields after a preset.
  const [formVersion, setFormVersion] = useState(0);
  const sim = useCacheRun(settings);

  const choose = (id: PresetId) => {
    setPreset(id);
    setSettings({ ...CACHE_PRESETS[id], seed: settings.seed });
    setFormVersion((v) => v + 1);
  };

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.cache.extreme.title')}</h3>
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
            {t(`sim.cache.preset.${id}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <AdvancedSeed
          key={settings.seed}
          seed={settings.seed}
          onChange={(seed) => setSettings({ ...settings, seed })}
        />
      </div>
      <CacheSettingsForm
        key={formVersion}
        settings={settings}
        onApply={setSettings}
      />
      <Playback
        playHintKey="sim.cache.play.hint"
        running={sim.running}
        complete={sim.complete}
        speed={sim.speed}
        onSpeed={sim.setSpeed}
        onPlay={sim.play}
        onPause={sim.pause}
        onStep={sim.step}
        onReset={sim.reset}
      />
      <CacheRunView run={sim.run} />
    </section>
  );
}
