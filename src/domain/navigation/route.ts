export type Route = { page: 'home' } | { page: 'chapter'; id: string };

const CHAPTER_PREFIX = '#/chapter/';

export function parseHash(hash: string, knownIds: readonly string[]): Route {
  if (hash.startsWith(CHAPTER_PREFIX)) {
    const id = hash.slice(CHAPTER_PREFIX.length);
    if (knownIds.includes(id)) return { page: 'chapter', id };
  }
  return { page: 'home' };
}

export function chapterHash(id: string): string {
  return `${CHAPTER_PREFIX}${id}`;
}
