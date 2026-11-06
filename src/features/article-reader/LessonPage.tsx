import { useState } from 'react';
import GameArena from '@/features/game-arena/GameArena';
import { useT } from '@/stores/language';

const paragraphs = [
  'lesson.story.p1',
  'lesson.story.p2',
  'lesson.story.p3',
  'lesson.story.p4',
];
const terms = ['lb', 'server', 'request'];

export default function LessonPage() {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  const reveal = () => setRevealed(true);

  return (
    <article className="flex flex-col gap-8">
      <div>
        <a
          href="#/"
          className="inline-flex min-h-11 items-center text-[#0F5C58] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6452F]"
        >
          {t('lesson.back')}
        </a>
        <h1 className="text-3xl font-bold">{t('lesson.title')}</h1>
      </div>
      <section aria-labelledby="story-heading">
        <h2 id="story-heading" className="text-2xl font-bold">
          {t('lesson.story.heading')}
        </h2>
        {paragraphs.map((key) => (
          <p key={key} className="mt-2">
            {t(key)}
          </p>
        ))}
      </section>
      <GameArena onFinish={reveal} onSkip={reveal} skipped={revealed} />
      {revealed && (
        <section aria-labelledby="term-heading">
          <h2 id="term-heading" className="text-2xl font-bold">
            {t('lesson.term.heading')}
          </h2>
          <p className="mt-1">{t('lesson.term.intro')}</p>
          <dl className="mt-3 flex flex-col gap-3">
            {terms.map((term) => (
              <div key={term} className="rounded-lg bg-white p-3">
                <dt className="font-bold text-[#0F5C58]">
                  {t(`lesson.term.${term}.name`)}
                </dt>
                <dd>{t(`lesson.term.${term}.desc`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </article>
  );
}
