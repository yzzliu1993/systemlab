import { compareChapters } from '@/domain/chapter/compare';
import { parseChapter } from '@/domain/chapter/parse';
import type { Chapter } from '@/domain/chapter/schema';
import en from './en.md?raw';
import zh from './zh-TW.md?raw';

const ALLOWED = new Set([
  'https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html',
  'https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/',
  'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers',
  'https://arxiv.org/abs/1406.2294',
  'https://research.google/pubs/maglev-a-fast-and-reliable-software-network-load-balancer/',
  'https://www.allthingsdistributed.com/2007/10/amazons_dynamo.html',
  'https://discord.com/blog/how-discord-scaled-elixir-to-5-000-000-concurrent-users',
  'https://discord.com/blog/how-discord-stores-trillions-of-messages',
  'https://github.blog/engineering/infrastructure/glb-director-open-source-load-balancer/',
  'https://blog.cloudflare.com/eliminating-cold-starts-2-shard-and-conquer/',
]);

const TERMS = {
  en: [
    'Sharding',
    'Hash function',
    'Modulo hashing',
    'Consistent hashing',
    'Hash ring',
    'Virtual node',
    'Rendezvous hashing',
    'Rebalancing',
    'Hot key',
  ],
  zh: [
    '分片',
    '雜湊函式',
    '取模雜湊',
    '一致性雜湊',
    '雜湊環',
    '虛擬節點',
    '會合雜湊',
    '重新平衡',
    '熱點鍵',
  ],
};

function load(raw: string): Chapter {
  const r = parseChapter(raw);
  if (!r.ok) throw new Error(r.error);
  return r.chapter;
}

function termNames(chapter: Chapter): string[] {
  const terms = chapter.sections.find((s) => s.name === 'terms')!;
  return terms.blocks.flatMap((b) => (b.type === 'term' ? [b.name] : []));
}

describe('consistent-hashing chapter', () => {
  it('T1: both files parse with sections in order and config present', () => {
    for (const raw of [en, zh]) {
      const chapter = load(raw);
      expect(chapter.id).toBe('consistent-hashing');
      expect(chapter.sections.map((s) => s.name)).toEqual([
        'situation',
        'terms',
        'how',
        'practice',
        'extreme',
        'config',
      ]);
    }
  });

  it('T2: en and zh-TW have no differences', () => {
    expect(compareChapters(load(en), load(zh))).toEqual([]);
  });

  it('T3: every agreed term exists in both languages', () => {
    expect(termNames(load(en))).toEqual(TERMS.en);
    expect(termNames(load(zh))).toEqual(TERMS.zh);
  });

  it('T4: every source URL is on the allowed list', () => {
    for (const raw of [en, zh]) {
      for (const s of load(raw).sources) expect(ALLOWED).toContain(s.url);
    }
  });
});
