import en from '@/content/chapters/load-balancing/en.md?raw';
import zh from '@/content/chapters/load-balancing/zh-TW.md?raw';
import { buildRegistry } from '@/features/article-reader/registry';

describe('buildRegistry', () => {
  it('T8: throws with the chapter id when the languages differ', () => {
    const zhShort = zh.replace(/### 最少連線[\s\S]*?(?=## @how)/, '');
    expect(() =>
      buildRegistry({ 'load-balancing': { en, 'zh-TW': zhShort } }),
    ).toThrow(/load-balancing/);
  });

  it('T8: throws with the chapter id when a file does not parse', () => {
    expect(() =>
      buildRegistry({ 'load-balancing': { en: 'nope', 'zh-TW': zh } }),
    ).toThrow(/load-balancing/);
  });

  it('T8: accepts the shipped chapter', () => {
    expect(
      buildRegistry({ 'load-balancing': { en, 'zh-TW': zh } }),
    ).toHaveLength(1);
  });
});
