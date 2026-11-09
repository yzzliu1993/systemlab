import { chapterHash } from '@/domain/navigation/route';
import {
  chapters,
  type ChapterEntry,
} from '@/features/article-reader/registry';
import { useLanguage, useT } from '@/stores/language';

export default function ChapterList({
  entries = chapters,
}: {
  entries?: readonly ChapterEntry[];
}) {
  const t = useT();
  const language = useLanguage((state) => state.language);

  return (
    <div>
      <h1 className="text-3xl font-bold">{t('home.title')}</h1>
      <p className="mt-2">{t('home.intro')}</p>
      <ul className="mt-6 flex flex-col gap-3">
        {entries.map((entry) => {
          const chapter = entry[language];
          return (
            <li
              key={chapter.id}
              className="rounded-lg border-2 border-[#0F5C58] bg-white p-4"
            >
              <a
                href={chapterHash(chapter.id)}
                className="inline-flex min-h-11 items-center text-xl font-bold text-[#0F5C58] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6452F]"
              >
                {chapter.title}
              </a>
              <p className="mt-1">{chapter.summary}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
