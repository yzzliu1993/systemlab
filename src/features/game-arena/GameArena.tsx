import { useEffect, useRef, useState } from 'react';
import {
  ARRIVAL_SPEEDS,
  STRATEGIES,
  assignNext,
  createGame,
  lineLength,
  tick,
} from '@/domain/game/lunchRush';
import type {
  ArrivalSpeed,
  Customer,
  GameState,
  OrderKind,
  Strategy,
} from '@/domain/game/lunchRush';
import { useT } from '@/stores/language';

const TICK_MS = 100;
const MAX_SHOWN = 6;
const FIRST_SEED = 7;

const counterInfo = [
  { name: 'lesson.game.counter1', who: 'lesson.game.fast' },
  { name: 'lesson.game.counter2', who: 'lesson.game.steady' },
  { name: 'lesson.game.counter3', who: 'lesson.game.new' },
] as const;

// Shape and color both tell the order size, so color is never the only cue.
const shapes: Record<OrderKind, { glyph: string; color: string }> = {
  drink: { glyph: '●', color: 'bg-[#F5C242] text-black' },
  combo: { glyph: '■', color: 'bg-[#BFE3DF] text-black' },
  family: { glyph: '▲', color: 'bg-[#F4B49F] text-black' },
  takeout: { glyph: '◆', color: 'bg-[#D6452F] text-white' },
};

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6452F]';
const buttonBase = `min-h-11 rounded-lg px-4 py-2 font-semibold ${focusRing}`;

type Phase = 'idle' | 'playing' | 'result';

type Props = {
  onFinish: () => void;
  onSkip: () => void;
  skipped: boolean;
};

function CustomerChip({ customer }: { customer: Customer }) {
  const t = useT();
  const shape = shapes[customer.kind];
  return (
    <li className={`rounded px-2 py-1 text-sm ${shape.color}`}>
      <span aria-hidden="true">{shape.glyph} </span>
      {t(`lesson.game.order.${customer.kind}`)}
    </li>
  );
}

function ChipList({ customers }: { customers: readonly Customer[] }) {
  const t = useT();
  const shown = customers.slice(0, MAX_SHOWN);
  const extra = customers.length - shown.length;
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {shown.map((customer) => (
        <CustomerChip key={customer.id} customer={customer} />
      ))}
      {extra > 0 && (
        <li className="text-sm">
          +{extra} {t('lesson.game.more')}
        </li>
      )}
    </ul>
  );
}

export default function GameArena({ onFinish, onSkip, skipped }: Props) {
  const t = useT();
  const [started, setStarted] = useState<Phase>('idle');
  const [round, setRound] = useState(0);
  const [game, setGame] = useState<GameState>(() => createGame(FIRST_SEED));
  const [strategy, setStrategy] = useState<Strategy>('inTurn');
  const [speed, setSpeed] = useState<ArrivalSpeed>('normal');
  const strategyRef = useRef<Strategy>(strategy);
  const speedRef = useRef<ArrivalSpeed>(speed);
  const finishRef = useRef(onFinish);
  useEffect(() => {
    strategyRef.current = strategy;
    speedRef.current = speed;
    finishRef.current = onFinish;
  });
  const phase: Phase = started === 'playing' && game.done ? 'result' : started;

  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => {
      setGame((current) =>
        tick(current, strategyRef.current, speedRef.current),
      );
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase]);

  const byHand = phase === 'playing' && strategy === 'manual';
  useEffect(() => {
    if (!byHand) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey)
        return;
      const index = ['1', '2', '3'].indexOf(event.key);
      if (index < 0) return;
      setGame((current) => assignNext(current, index));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [byHand]);

  useEffect(() => {
    if (phase === 'result') finishRef.current();
  }, [phase]);

  function start() {
    setGame(createGame(FIRST_SEED + round));
    setRound((r) => r + 1);
    setStrategy('inTurn');
    setStarted('playing');
  }

  const secondsLeft = Math.ceil(
    (game.config.roundTicks - game.tick) / game.config.ticksPerSecond,
  );
  const seconds = t('lesson.game.seconds');

  return (
    <section aria-labelledby="game-heading" data-testid="game-area">
      <h2 id="game-heading" className="text-2xl font-bold">
        {t('lesson.game.heading')}
      </h2>

      {phase === 'idle' && (
        <div className="mt-2 flex flex-col items-start gap-3">
          <p>{t('lesson.game.intro')}</p>
          <button
            type="button"
            onClick={start}
            className={`${buttonBase} bg-[#0F5C58] text-white`}
          >
            {t('lesson.game.start')}
          </button>
        </div>
      )}

      {phase === 'playing' && (
        <div className="mt-2 flex flex-col gap-4">
          <p className="flex flex-wrap gap-x-6 gap-y-1 font-semibold">
            <span>
              {t('lesson.game.timeLeft')}: {secondsLeft}
              {seconds}
            </span>
            <span>
              {t('lesson.game.served')}: {game.served}
            </span>
            <span>
              {t('lesson.game.walkedOut')}: {game.walkedOut}
            </span>
          </p>

          <div role="group" aria-labelledby="strategy-label">
            <p id="strategy-label" className="font-semibold">
              {t('lesson.game.strategy.label')}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {STRATEGIES.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={strategy === key}
                  onClick={() => setStrategy(key)}
                  className={`${buttonBase} border-2 border-[#0F5C58] ${
                    strategy === key
                      ? 'bg-[#0F5C58] text-white'
                      : 'bg-white text-[#0F5C58]'
                  }`}
                >
                  {t(`lesson.game.strategy.${key}`)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-sm">
              {t(`lesson.game.strategy.${strategy}.hint`)}
            </p>
          </div>

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
                  onClick={() => setSpeed(key)}
                  className={`${buttonBase} border-2 border-[#0F5C58] ${
                    speed === key
                      ? 'bg-[#0F5C58] text-white'
                      : 'bg-white text-[#0F5C58]'
                  }`}
                >
                  {t(`lesson.game.speed.${key}`)}
                </button>
              ))}
            </div>
          </div>

          {strategy === 'manual' && (
            <div className="rounded-lg border-2 border-dashed border-[#0F5C58] p-3">
              <p className="font-semibold">{t('lesson.game.waitingSpot')}</p>
              <p className="text-sm">{t('lesson.game.keysHint')}</p>
              {game.waiting.length === 0 ? (
                <p className="text-sm">{t('lesson.game.nobody')}</p>
              ) : (
                <ChipList customers={game.waiting} />
              )}
            </div>
          )}

          <ul className="grid gap-3 sm:grid-cols-3">
            {game.counters.map((counter, index) => {
              const info = counterInfo[index]!;
              const waiting = counter.serving
                ? [counter.serving.customer, ...counter.queue]
                : counter.queue;
              return (
                <li
                  key={info.name}
                  className="rounded-lg border-2 border-[#0F5C58] bg-white p-3"
                >
                  <p className="font-bold text-[#0F5C58]">{t(info.name)}</p>
                  <p className="text-sm">{t(info.who)}</p>
                  <p className="mt-2 text-sm font-semibold">
                    {t('lesson.game.line')}: {lineLength(counter)}
                  </p>
                  {waiting.length === 0 ? (
                    <p className="text-sm">{t('lesson.game.empty')}</p>
                  ) : (
                    <ChipList customers={waiting} />
                  )}
                  {strategy === 'manual' && (
                    <button
                      type="button"
                      disabled={game.waiting.length === 0}
                      onClick={() =>
                        setGame((current) => assignNext(current, index))
                      }
                      className={`${buttonBase} mt-2 w-full bg-[#D6452F] text-white disabled:opacity-50`}
                    >
                      {t('lesson.game.sendTo')} {t(info.name)} (
                      {t('lesson.game.key')} {index + 1})
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {phase === 'result' && (
        <div className="mt-2 flex flex-col items-start gap-3">
          <h3 className="text-xl font-bold">
            {t('lesson.game.result.heading')}
          </h3>
          <p>{t('lesson.game.result.summary')}</p>
          <p className="flex flex-wrap gap-x-6 font-semibold">
            <span>
              {t('lesson.game.served')}: {game.served}
            </span>
            <span>
              {t('lesson.game.walkedOut')}: {game.walkedOut}
            </span>
          </p>
          <table className="w-full max-w-lg border-collapse bg-white text-left">
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
                  </th>
                  <td className="border p-2">{counter.taken}</td>
                  <td className="border p-2">{counter.work}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{t('lesson.game.result.note')}</p>
          <button
            type="button"
            onClick={start}
            className={`${buttonBase} bg-[#0F5C58] text-white`}
          >
            {t('lesson.game.again')}
          </button>
        </div>
      )}

      {phase !== 'result' && !skipped && (
        <button
          type="button"
          onClick={onSkip}
          className={`${buttonBase} mt-4 min-h-11 text-[#0F5C58] underline`}
        >
          {t('lesson.game.skip')}
        </button>
      )}
    </section>
  );
}
