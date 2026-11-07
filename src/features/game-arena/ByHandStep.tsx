import { useEffect } from 'react';
import { ARRIVAL_SPEEDS } from '@/domain/game/lunchRush';
import type { ArrivalSpeed, GameState } from '@/domain/game/lunchRush';
import { useT } from '@/stores/language';
import { ChipList, CounterBoard, Stats, toggleClass } from './arenaUi';

type Props = {
  game: GameState;
  speed: ArrivalSpeed;
  onSpeed: (speed: ArrivalSpeed) => void;
  onSend: (counterIndex: number) => void;
};

export default function ByHandStep({ game, speed, onSpeed, onSend }: Props) {
  const t = useT();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey)
        return;
      const index = ['1', '2', '3'].indexOf(event.key);
      if (index >= 0) onSend(index);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSend]);

  return (
    <div className="mt-2 flex flex-col gap-4">
      <p>{t('lesson.game.byHand.intro')}</p>
      <Stats game={game} />

      <div role="group" aria-labelledby="speed-label">
        <p id="speed-label" className="font-semibold">
          {t('lesson.game.speed.label')}
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {ARRIVAL_SPEEDS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={speed === key}
              onClick={() => onSpeed(key)}
              className={toggleClass(speed === key)}
            >
              {t(`lesson.game.speed.${key}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border-2 border-dashed border-[#0F5C58] p-3">
        <p className="font-semibold">{t('lesson.game.waitingSpot')}</p>
        <p className="text-sm">{t('lesson.game.keysHint')}</p>
        {game.waiting.length === 0 ? (
          <p className="text-sm">{t('lesson.game.nobody')}</p>
        ) : (
          <ChipList customers={game.waiting} />
        )}
      </div>

      <CounterBoard game={game} onSend={onSend} />
    </div>
  );
}
