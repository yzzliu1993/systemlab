import { useState } from 'react';
import clsx from 'clsx';
import { DEFAULT_SETTINGS } from '@/domain/simulation/rateLimit';
import type { Settings } from '@/domain/simulation/rateLimit';
import { Playback, SeedField, buttonClass } from '@/features/simulation/parts';
import RateLimitSettingsForm from '@/features/simulation/RateLimitSettingsForm';
import RateLimitView from '@/features/simulation/RateLimitView';
import {
  RL_PRESET_IDS,
  applyRateLimitPreset,
} from '@/features/simulation/rateLimitSettings';
import type { RateLimitPresetId } from '@/features/simulation/rateLimitSettings';
import { useRateLimitRun } from '@/features/simulation/useRateLimitRun';
import { useT } from '@/stores/language';

/** Section 5: presets and editable settings that push the limiter. */
export default function RateLimitExtremePanel() {
  const t = useT();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [preset, setPreset] = useState<RateLimitPresetId | null>(null);
  // Bump to reload the form fields after a preset.
  const [formVersion, setFormVersion] = useState(0);
  const sim = useRateLimitRun(settings);

  const choose = (id: RateLimitPresetId) => {
    setPreset(id);
    setSettings(applyRateLimitPreset(id, settings.seed));
    setFormVersion((v) => v + 1);
  };

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t('sim.rl.extreme.title')}</h3>
      <div
        role="group"
        aria-label={t('sim.rl.preset.label')}
        className="flex flex-wrap gap-2"
      >
        {RL_PRESET_IDS.map((id) => (
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
            {t(`sim.rl.preset.${id}`)}
          </button>
        ))}
      </div>
      <SeedField
        key={settings.seed}
        seed={settings.seed}
        onChange={(seed) => setSettings({ ...settings, seed })}
      />
      <RateLimitSettingsForm
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
      <RateLimitView
        settings={settings}
        history={sim.history}
        tick={sim.tick}
      />
    </section>
  );
}
