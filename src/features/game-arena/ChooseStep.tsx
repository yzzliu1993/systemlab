import { useState } from 'react';
import type { Strategy } from '@/domain/game/lunchRush';
import { useT } from '@/stores/language';
import { counterInfo, primaryButton, toggleClass } from './arenaUi';

type Props = {
  intro: string;
  rules: readonly Strategy[];
  /** Ask the player to predict the counter that falls furthest behind. */
  predict: boolean;
  confirmLabel: string;
  onConfirm: (rule: Strategy, prediction: number | null) => void;
};

export default function ChooseStep({
  intro,
  rules,
  predict,
  confirmLabel,
  onConfirm,
}: Props) {
  const t = useT();
  const [rule, setRule] = useState<Strategy>(rules[0]!);
  const [prediction, setPrediction] = useState<number | null>(null);
  const ready = !predict || prediction !== null;

  return (
    <div className="mt-2 flex flex-col items-start gap-4">
      <p>{intro}</p>

      <div role="group" aria-labelledby="rule-label">
        <p id="rule-label" className="font-semibold">
          {t('lesson.game.strategy.label')}
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {rules.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={rule === key}
              onClick={() => setRule(key)}
              className={toggleClass(rule === key)}
            >
              {t(`lesson.game.strategy.${key}`)}
            </button>
          ))}
        </div>
        <p className="mt-1 text-sm">{t(`lesson.game.strategy.${rule}.hint`)}</p>
      </div>

      {predict && (
        <div role="group" aria-labelledby="predict-label">
          <p id="predict-label" className="font-semibold">
            {t('lesson.game.choose.predict')}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {counterInfo.map((info, index) => (
              <button
                key={info.name}
                type="button"
                aria-pressed={prediction === index}
                onClick={() => setPrediction(index)}
                className={toggleClass(prediction === index)}
              >
                {t(info.name)}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!ready}
        onClick={() => onConfirm(rule, prediction)}
        className={`${primaryButton} disabled:opacity-50`}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
