import { lessonHash, parseHash } from '@/domain/navigation/route';

describe('parseHash', () => {
  it('T1: an open lesson hash gives a lesson route', () => {
    expect(parseHash(lessonHash('a'), ['a'])).toEqual({
      page: 'lesson',
      id: 'a',
    });
  });

  it('T8: an unknown or closed hash gives home', () => {
    expect(parseHash('#/nope', ['a'])).toEqual({ page: 'home' });
    expect(parseHash('', ['a'])).toEqual({ page: 'home' });
    expect(parseHash(lessonHash('b'), ['a'])).toEqual({ page: 'home' });
  });
});
