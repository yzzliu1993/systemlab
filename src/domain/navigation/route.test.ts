import { chapterHash, parseHash } from '@/domain/navigation/route';

describe('parseHash', () => {
  it('T7: a known chapter hash gives the chapter route', () => {
    expect(
      parseHash(chapterHash('load-balancing'), ['load-balancing']),
    ).toEqual({ page: 'chapter', id: 'load-balancing' });
  });

  it('T6: an unknown chapter, old lesson hash or empty hash gives home', () => {
    const ids = ['load-balancing'];
    expect(parseHash('#/chapter/nope', ids)).toEqual({ page: 'home' });
    expect(parseHash('#/lesson/long-line', ids)).toEqual({ page: 'home' });
    expect(parseHash('', ids)).toEqual({ page: 'home' });
  });
});
