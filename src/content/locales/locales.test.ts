import { checkLocaleKeys } from '@/domain/i18n/checkLocaleKeys';
import en from './en.json';
import zhTW from './zh-TW.json';

// Keys built at runtime. One line each: where the key is built.
const DYNAMIC_PREFIXES = [
  'lang.', // Header.tsx: lang.${code}
  'chapter.section.', // ChapterPage.tsx: chapter.section.${section.name}
  'sim.algorithm.', // CompareView.tsx, parts.tsx: sim.algorithm.${algorithm}
  'sim.compare.', // CompareView.tsx: sim.compare.${side}
  'sim.preset.', // ExtremeCasesPanel.tsx: sim.preset.${id}
  'sim.cache.preset.', // CacheExtremePanel.tsx: sim.cache.preset.${id}
  'sim.cache.eviction.', // CacheSettingsForm.tsx: sim.cache.eviction.${e}
  'sim.ch.preset.', // HashingExtremePanel.tsx: sim.ch.preset.${id}
  'sim.ch.strategy.', // HashingSettingsForm.tsx, HashingSimulation.tsx: sim.ch.strategy.${s}
  'sim.mq.preset.', // QueueExtremePanel.tsx: sim.mq.preset.${id}
  'sim.rl.preset.', // RateLimitExtremePanel.tsx: sim.rl.preset.${id}
  'sim.rl.algorithm.', // RateLimitSettingsForm.tsx, RateLimitSimulation.tsx: sim.rl.algorithm.${a}
  'sim.rl.retry.', // RateLimitSettingsForm.tsx, RateLimitSimulation.tsx: sim.rl.retry.${m}
  'sim.rl.scope.', // RateLimitSettingsForm.tsx: sim.rl.scope.${s}
];

const modules = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const sources = Object.entries(modules)
  .filter(([path]) => !/\.test\.tsx?$/.test(path))
  .map(([, source]) => source);

describe('locale keys', () => {
  it('T1: the shipped locale files match and every key is used', () => {
    expect(
      checkLocaleKeys({ en, 'zh-TW': zhTW }, sources, DYNAMIC_PREFIXES),
    ).toEqual({ mismatched: [], unused: [] });
  });

  it('T2: a key in one locale only is named', () => {
    const result = checkLocaleKeys(
      { en: { a: 'A', b: 'B' }, zh: { a: 'A' } },
      ["t('a')", "t('b')"],
      [],
    );
    expect(result.mismatched).toEqual(['b']);
  });

  it('T3: a key nothing uses is named', () => {
    const result = checkLocaleKeys(
      { en: { a: 'A', b: 'B' }, zh: { a: 'A', b: 'B' } },
      ["t('a')"],
      [],
    );
    expect(result.unused).toEqual(['b']);
  });

  it('T4: a key used only through a dynamic pattern passes', () => {
    const result = checkLocaleKeys(
      { en: { 'x.one': '1' }, zh: { 'x.one': '1' } },
      ['t(`x.${n}`)'],
      ['x.'],
    );
    expect(result).toEqual({ mismatched: [], unused: [] });
  });
});
