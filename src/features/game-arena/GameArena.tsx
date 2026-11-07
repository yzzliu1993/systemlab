import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BY_HAND_CONFIG,
  DEFAULT_CONFIG,
  TAKEOUT_RUSH_CONFIG,
  assignNext,
  createGame,
  furthestBehind,
  runRound,
  tick,
} from '@/domain/game/lunchRush';
import type {
  ArrivalSpeed,
  GameConfig,
  GameState,
  Strategy,
} from '@/domain/game/lunchRush';
import { useT } from '@/stores/language';
import {
  CounterBoard,
  Stats,
  buttonBase,
  counterInfo,
  primaryButton,
} from './arenaUi';
import ByHandStep from './ByHandStep';
import ChooseStep from './ChooseStep';
import ResultTable from './ResultTable';

const TICK_MS = 100;
/** The watch steps play a 600 tick round in about 6 seconds. */
const FAST_TICKS_PER_STEP = 10;
const FIRST_SEED = 7;

const NORMAL_RULES: readonly Strategy[] = ['inTurn', 'shortest'];
const EVENT_RULES: readonly Strategy[] = ['inTurn', 'shortest', 'leastWork'];

type Step =
  | 'intro'
  | 'byHand'
  | 'choose'
  | 'watch'
  | 'result'
  | 'eventChoose'
  | 'eventWatch'
  | 'eventResult';

type Props = {
  onFinish: () => void;
  onSkip: () => void;
  skipped: boolean;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

type Played = { rule: Strategy; game: GameState };

export default function GameArena({ onFinish, onSkip, skipped }: Props) {
  const t = useT();
  const [rawStep, setStep] = useState<Step>('intro');
  const [round, setRound] = useState(0);
  const [game, setGame] = useState<GameState>(() =>
    createGame(FIRST_SEED, BY_HAND_CONFIG),
  );
  const [speed, setSpeed] = useState<ArrivalSpeed>('normal');
  const [rule, setRule] = useState<Strategy>('inTurn');
  const [prediction, setPrediction] = useState<number | null>(null);
  const [before, setBefore] = useState<Played | null>(null);
  const speedRef = useRef<ArrivalSpeed>(speed);
  const ruleRef = useRef<Strategy>(rule);
  const finishRef = useRef(onFinish);
  useEffect(() => {
    speedRef.current = speed;
    ruleRef.current = rule;
    finishRef.current = onFinish;
  });

  const seed = FIRST_SEED + round;
  // A round that has run out of time moves on by itself.
  let step = rawStep;
  if (game.done) {
    if (rawStep === 'byHand') step = 'choose';
    else if (rawStep === 'watch') step = 'result';
    else if (rawStep === 'eventWatch') step = 'eventResult';
  }

  const running =
    step === 'byHand' || step === 'watch' || step === 'eventWatch';
  useEffect(() => {
    if (!running) return;
    const fast = step !== 'byHand';
    const id = setInterval(() => {
      setGame((current) => {
        let next = current;
        const count = fast ? FAST_TICKS_PER_STEP : 1;
        for (let i = 0; i < count; i += 1) {
          next = tick(
            next,
            fast ? ruleRef.current : 'manual',
            speedRef.current,
          );
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, step]);

  useEffect(() => {
    if (step === 'eventResult') finishRef.current();
  }, [step]);

  const send = useCallback((index: number) => {
    setGame((current) => assignNext(current, index));
  }, []);

  function begin() {
    setGame(createGame(seed, BY_HAND_CONFIG));
    setBefore(null);
    setPrediction(null);
    setStep('byHand');
  }

  function restart() {
    setRound((r) => r + 1);
    setBefore(null);
    setPrediction(null);
    setStep('intro');
  }

  function watch(
    nextRule: Strategy,
    config: GameConfig,
    nextStep: 'watch' | 'eventWatch',
  ) {
    setRule(nextRule);
    ruleRef.current = nextRule;
    setGame(
      prefersReducedMotion()
        ? runRound(seed, nextRule, config)
        : createGame(seed, config),
    );
    setStep(nextStep);
  }

  const behind = furthestBehind(game.counters);
  const guessedRight = prediction !== null && prediction === behind;

  const stepTitle: Record<Step, string> = {
    intro: 'lesson.game.heading',
    byHand: 'lesson.game.step.byHand',
    choose: 'lesson.game.step.choose',
    watch: 'lesson.game.step.watch',
    result: 'lesson.game.step.result',
    eventChoose: 'lesson.game.step.event',
    eventWatch: 'lesson.game.step.event',
    eventResult: 'lesson.game.step.event',
  };

  return (
    <section aria-labelledby="game-heading" data-testid="game-area">
      <h2 id="game-heading" className="text-2xl font-bold">
        {t('lesson.game.heading')}
      </h2>
      {step !== 'intro' && (
        <h3 className="mt-1 text-xl font-bold">{t(stepTitle[step])}</h3>
      )}

      {step === 'intro' && (
        <div className="mt-2 flex flex-col items-start gap-3">
          <p>{t('lesson.game.intro')}</p>
          <button type="button" onClick={begin} className={primaryButton}>
            {t('lesson.game.start')}
          </button>
        </div>
      )}

      {step === 'byHand' && (
        <ByHandStep
          game={game}
          speed={speed}
          onSpeed={setSpeed}
          onSend={send}
        />
      )}

      {step === 'choose' && (
        <ChooseStep
          intro={t('lesson.game.choose.intro')}
          rules={NORMAL_RULES}
          predict
          confirmLabel={t('lesson.game.choose.watch')}
          onConfirm={(picked, guess) => {
            setPrediction(guess);
            watch(picked, DEFAULT_CONFIG, 'watch');
          }}
        />
      )}

      {(step === 'watch' || step === 'eventWatch') && (
        <div className="mt-2 flex flex-col gap-4">
          <p>{t('lesson.game.watch.running')}</p>
          <Stats game={game} />
          <CounterBoard game={game} />
        </div>
      )}

      {step === 'result' && (
        <div className="mt-2 flex flex-col items-start gap-3">
          <ResultTable game={game} rule={rule} />
          <p>
            {t('lesson.game.result.yourGuess')}:{' '}
            {prediction !== null && t(counterInfo[prediction]!.name)}.{' '}
            {t('lesson.game.result.actual')}: {t(counterInfo[behind]!.name)}.
          </p>
          <p className="font-semibold">
            {guessedRight
              ? t('lesson.game.result.right')
              : t('lesson.game.result.wrong')}
          </p>
          <button
            type="button"
            onClick={() => {
              setBefore({ rule, game });
              setStep('eventChoose');
            }}
            className={primaryButton}
          >
            {t('lesson.game.result.next')}
          </button>
        </div>
      )}

      {step === 'eventChoose' && (
        <ChooseStep
          intro={t('lesson.game.event.intro')}
          rules={EVENT_RULES}
          predict={false}
          confirmLabel={t('lesson.game.event.watch')}
          onConfirm={(picked) =>
            watch(picked, TAKEOUT_RUSH_CONFIG, 'eventWatch')
          }
        />
      )}

      {step === 'eventResult' && (
        <div className="mt-2 flex flex-col gap-3">
          <div className="grid gap-4 sm:grid-cols-2">
            {before && (
              <ResultTable
                game={before.game}
                rule={before.rule}
                title={t('lesson.game.event.before')}
              />
            )}
            <ResultTable
              game={game}
              rule={rule}
              title={t('lesson.game.event.after')}
            />
          </div>
          <p>{t('lesson.game.event.note')}</p>
        </div>
      )}

      {step !== 'intro' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={restart}
            className={`${buttonBase} border-2 border-[#0F5C58] bg-white text-[#0F5C58]`}
          >
            {t('lesson.game.restart')}
          </button>
        </div>
      )}

      {!skipped && (
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
