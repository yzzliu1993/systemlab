import type { Chapter } from '@/domain/chapter/schema';
import { BlockView, InlineView } from '@/features/article-reader/ChapterBody';
import { useT } from '@/stores/language';

const SLOTS = new Set(['how', 'extreme']);

export default function ChapterPage({ chapter }: { chapter: Chapter }) {
  const t = useT();
  return (
    <article className="flex flex-col gap-8">
      <div>
        <a
          href="#/"
          className="inline-flex min-h-11 items-center text-[#0F5C58] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6452F]"
        >
          {t('chapter.back')}
        </a>
        <h1 className="text-3xl font-bold">{chapter.title}</h1>
      </div>
      {chapter.sections.map((section) => (
        <section key={section.name}>
          <h2 className="text-2xl font-bold">
            {t(`chapter.section.${section.name}`)}
          </h2>
          {section.blocks.map((block, i) => (
            <BlockView key={i} block={block} />
          ))}
          {SLOTS.has(section.name) && (
            <div data-testid={`slot-${section.name}`} />
          )}
        </section>
      ))}
      <section>
        <h2 className="text-2xl font-bold">{t('chapter.section.sources')}</h2>
        <ul className="mt-2 list-disc pl-6">
          {chapter.sources.map((source) => (
            <li key={source.url}>
              <InlineView
                inline={{ type: 'link', text: source.title, url: source.url }}
              />
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
