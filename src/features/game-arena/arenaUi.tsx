import { lineLength } from '@/domain/game/lunchRush';
import type { Customer, GameState, OrderKind } from '@/domain/game/lunchRush';
import { useT } from '@/stores/language';

const MAX_SHOWN = 6;

export const counterInfo = [
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

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6452F]';
export const buttonBase = `min-h-11 rounded-lg px-4 py-2 font-semibold ${focusRing}`;
export const primaryButton = `${buttonBase} bg-[#0F5C58] text-white`;

export function toggleClass(active: boolean): string {
  return `${buttonBase} border-2 border-[#0F5C58] ${
    active ? 'bg-[#0F5C58] text-white' : 'bg-white text-[#0F5C58]'
  }`;
}

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

export function ChipList({ customers }: { customers: readonly Customer[] }) {
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

export function Stats({ game }: { game: GameState }) {
  const t = useT();
  const seconds = Math.ceil(
    (game.config.roundTicks - game.tick) / game.config.ticksPerSecond,
  );
  return (
    <p className="flex flex-wrap gap-x-6 gap-y-1 font-semibold">
      <span>
        {t('lesson.game.timeLeft')}: {seconds}
        {t('lesson.game.seconds')}
      </span>
      <span>
        {t('lesson.game.served')}: {game.served}
      </span>
      <span>
        {t('lesson.game.walkedOut')}: {game.walkedOut}
      </span>
    </p>
  );
}

type BoardProps = {
  game: GameState;
  /** When set, each counter shows a button that sends the next customer there. */
  onSend?: (counterIndex: number) => void;
};

export function CounterBoard({ game, onSend }: BoardProps) {
  const t = useT();
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {game.counters.map((counter, index) => {
        const info = counterInfo[index]!;
        const inLine = counter.serving
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
            {inLine.length === 0 ? (
              <p className="text-sm">{t('lesson.game.empty')}</p>
            ) : (
              <ChipList customers={inLine} />
            )}
            {onSend && (
              <button
                type="button"
                disabled={game.waiting.length === 0}
                onClick={() => onSend(index)}
                className={`${buttonBase} mt-2 w-full bg-[#D6452F] text-white disabled:opacity-50`}
              >
                {t('lesson.game.sendTo')} {t(info.name)} ({t('lesson.game.key')}{' '}
                {index + 1})
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
