import { compareChapters } from '@/domain/chapter/compare';
import { parseChapter } from '@/domain/chapter/parse';
import type { Chapter } from '@/domain/chapter/schema';
import type { Language } from '@/domain/i18n/translate';
import loadBalancingEn from '@/content/chapters/load-balancing/en.md?raw';
import loadBalancingZh from '@/content/chapters/load-balancing/zh-TW.md?raw';
import messageQueueEn from '@/content/chapters/message-queue/en.md?raw';
import messageQueueZh from '@/content/chapters/message-queue/zh-TW.md?raw';
import cachingEn from '@/content/chapters/caching/en.md?raw';
import cachingZh from '@/content/chapters/caching/zh-TW.md?raw';
import rateLimitingEn from '@/content/chapters/rate-limiting/en.md?raw';
import rateLimitingZh from '@/content/chapters/rate-limiting/zh-TW.md?raw';

export type ChapterEntry = Readonly<Record<Language, Chapter>>;
export type RawChapters = Readonly<
  Record<string, Readonly<Record<Language, string>>>
>;

function parseOrThrow(id: string, lang: Language, raw: string): Chapter {
  const result = parseChapter(raw);
  if (!result.ok) {
    throw new Error(`Chapter ${id} (${lang}) does not parse: ${result.error}`);
  }
  if (result.chapter.id !== id) {
    throw new Error(
      `Chapter ${id} (${lang}) has a different id in its file: ${result.chapter.id}`,
    );
  }
  return result.chapter;
}

/** Parses every chapter and throws, naming the chapter id, on any problem. */
export function buildRegistry(raws: RawChapters): ChapterEntry[] {
  return Object.entries(raws).map(([id, files]) => {
    const en = parseOrThrow(id, 'en', files.en);
    const zhTW = parseOrThrow(id, 'zh-TW', files['zh-TW']);
    const problems = compareChapters(en, zhTW);
    if (problems.length > 0) {
      throw new Error(
        `Chapter ${id}: en and zh-TW differ: ${problems.join('; ')}`,
      );
    }
    return { en, 'zh-TW': zhTW };
  });
}

export const chapters: readonly ChapterEntry[] = buildRegistry({
  'load-balancing': { en: loadBalancingEn, 'zh-TW': loadBalancingZh },
  'message-queue': { en: messageQueueEn, 'zh-TW': messageQueueZh },
  caching: { en: cachingEn, 'zh-TW': cachingZh },
  'rate-limiting': { en: rateLimitingEn, 'zh-TW': rateLimitingZh },
});
