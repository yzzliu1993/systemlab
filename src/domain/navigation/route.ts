export type Route = { page: 'home' } | { page: 'lesson'; id: string };

const LESSON_PREFIX = '#/lesson/';

export function parseHash(hash: string, openIds: readonly string[]): Route {
  if (hash.startsWith(LESSON_PREFIX)) {
    const id = hash.slice(LESSON_PREFIX.length);
    if (openIds.includes(id)) return { page: 'lesson', id };
  }
  return { page: 'home' };
}

export function lessonHash(id: string): string {
  return `${LESSON_PREFIX}${id}`;
}
