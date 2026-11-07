import { furthestBehind } from '@/domain/game/lunchRush';
import type { GameState, Strategy } from '@/domain/game/lunchRush';
import { useT } from '@/stores/language';
import { counterInfo } from './arenaUi';

type Props = {
  game: GameState;
  rule: Strategy;
  title?: string;
};

export default function ResultTable({ game, rule, title }: Props) {
  const t = useT();
  const behind = furthestBehind(game.counters);
  return (
    <div className="min-w-0">
      {title && <h4 className="font-bold">{title}</h4>}
      <p>
        {t('lesson.game.result.rule')}: {t(`lesson.game.strategy.${rule}`)}
      </p>
      <p className="font-semibold">
        {t('lesson.game.walkedOut')}: {game.walkedOut}
      </p>
      <table className="mt-1 w-full border-collapse bg-white text-left">
        <thead>
          <tr>
            <th scope="col" className="border p-2">
              {t('lesson.game.result.counter')}
            </th>
            <th scope="col" className="border p-2">
              {t('lesson.game.result.customers')}
            </th>
            <th scope="col" className="border p-2">
              {t('lesson.game.result.work')}
            </th>
          </tr>
        </thead>
        <tbody>
          {game.counters.map((counter, index) => (
            <tr key={counterInfo[index]!.name}>
              <th scope="row" className="border p-2">
                {t(counterInfo[index]!.name)}
                {index === behind && (
                  <span className="block text-sm font-normal">
                    ▼ {t('lesson.game.result.mark')}
                  </span>
                )}
              </th>
              <td className="border p-2">{counter.taken}</td>
              <td className="border p-2">{counter.work}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
