import { compareChapters } from '@/domain/chapter/compare';
import { parseChapter } from '@/domain/chapter/parse';
import type { Block, Chapter } from '@/domain/chapter/schema';
import en from './en.md?raw';
import zhTW from './zh-TW.md?raw';

const ALLOWED_SOURCES = [
  'https://redis.io/docs/latest/develop/reference/eviction/',
  'https://redis.io/docs/latest/commands/expire/',
  'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html',
  'https://docs.memcached.org/',
  'https://docs.cloud.google.com/memorystore/docs/redis/memory-management-best-practices',
  'https://developers.cloudflare.com/cache/concepts/default-cache-behavior/',
  'https://developers.cloudflare.com/cache/how-to/tiered-cache/',
  'https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala',
  'https://engineering.fb.com/2014/09/15/web/introducing-mcrouter-a-memcached-protocol-router-for-scaling-memcached-deployments/',
  'https://engineering.fb.com/2022/06/08/core-infra/cache-made-consistent/',
  'https://github.com/Netflix/EVCache',
  'https://www.uber.com/en-AE/blog/how-uber-serves-over-150-million-reads',
  'https://builder.aws.com/content/3K9TeXp6strMiJ4vhakpRD7BQWO/caching-challenges-and-strategies',
  'https://discord.com/blog/how-discord-stores-trillions-of-messages',
  'https://slack.engineering/slacks-incident-on-2-22-22/',
];

const TERMS: [string, string][] = [
  ['Cache', '快取（Cache）'],
  ['Cache hit', '快取命中（Cache hit）'],
  ['Cache miss', '快取未命中（Cache miss）'],
  ['Hit rate', '命中率（Hit rate）'],
  ['TTL', '存活時間（TTL）'],
  ['Eviction', '淘汰（Eviction）'],
  ['LRU', '最近最少使用（LRU）'],
  ['Cache-aside', '旁路快取（cache-aside）'],
  ['Write-through', '寫穿（write-through）'],
  ['Invalidation', '失效（Invalidation）'],
  ['Request coalescing', '請求合併（Request coalescing）'],
];

function load(raw: string): Chapter {
  const r = parseChapter(raw);
  if (!r.ok) throw new Error(r.error);
  return r.chapter;
}

function termNames(chapter: Chapter): string[] {
  const terms = chapter.sections.find((s) => s.name === 'terms')!;
  return terms.blocks
    .filter((b): b is Extract<Block, { type: 'term' }> => b.type === 'term')
    .map((b) => b.name);
}

describe('caching chapter', () => {
  it('T1: both files parse with sections in order and a config block', () => {
    for (const raw of [en, zhTW]) {
      const r = parseChapter(raw);
      expect(r.ok).toBe(true);
      const chapter = load(raw);
      expect(chapter.id).toBe('caching');
      expect(chapter.sections.map((s) => s.name)).toEqual([
        'situation',
        'terms',
        'how',
        'practice',
        'extreme',
        'config',
      ]);
      const config = chapter.sections.find((s) => s.name === 'config')!;
      const code = config.blocks.find((b) => b.type === 'code');
      expect(code).toMatchObject({ type: 'code', lang: 'conf' });
      expect(code && code.type === 'code' && code.text).toContain(
        'maxmemory-policy allkeys-lru',
      );
    }
  });

  it('T2: en and zh-TW have no structural differences', () => {
    expect(compareChapters(load(en), load(zhTW))).toEqual([]);
  });

  it('T3: every agreed term exists in both languages', () => {
    const enNames = termNames(load(en));
    const zhNames = termNames(load(zhTW));
    for (const [enName, zhName] of TERMS) {
      expect(enNames).toContain(enName);
      expect(zhNames).toContain(zhName);
    }
  });

  it('T4: every source URL is on the allowed list', () => {
    for (const raw of [en, zhTW]) {
      for (const source of load(raw).sources) {
        expect(ALLOWED_SOURCES).toContain(source.url);
      }
    }
  });
});
