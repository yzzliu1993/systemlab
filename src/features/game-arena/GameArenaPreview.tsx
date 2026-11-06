import { useT } from '@/stores/language';

const counters = [
  { name: 'lesson.game.counter1', who: 'lesson.game.fast', queue: ['drink'] },
  {
    name: 'lesson.game.counter2',
    who: 'lesson.game.new',
    queue: ['boxes', 'drink'],
  },
  { name: 'lesson.game.counter3', who: 'lesson.game.steady', queue: ['drink'] },
] as const;

export default function GameArenaPreview() {
  const t = useT();

  return (
    <section aria-labelledby="game-heading" data-testid="game-area">
      <h2 id="game-heading" className="text-2xl font-bold">
        {t('lesson.game.heading')}
      </h2>
      <p className="mt-1">{t('lesson.game.note')}</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {counters.map((counter) => (
          <li
            key={counter.name}
            className="rounded-lg border-2 border-[#0F5C58] bg-white p-3"
          >
            <p className="font-bold text-[#0F5C58]">{t(counter.name)}</p>
            <p className="text-sm">{t(counter.who)}</p>
            <p className="mt-2 text-sm font-semibold">
              {t('lesson.game.waiting')}
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {counter.queue.map((item, index) => (
                <li
                  key={index}
                  className={`rounded px-2 py-1 text-sm ${
                    item === 'boxes'
                      ? 'bg-[#D6452F] text-white'
                      : 'bg-[#F5C242]'
                  }`}
                >
                  {t(`lesson.game.${item}`)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
