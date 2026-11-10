import { compareChapters } from '@/domain/chapter/compare';
import { parseChapter } from '@/domain/chapter/parse';
import type { Chapter } from '@/domain/chapter/schema';
import en from './en.md?raw';
import zh from './zh-TW.md?raw';

const ALLOWED = new Set([
  'https://www.postgresql.org/docs/current/warm-standby.html',
  'https://www.postgresql.org/docs/current/runtime-config-wal.html',
  'https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html',
  'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html',
  'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html',
  'https://aws.amazon.com/rds/features/multi-az/',
  'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.Monitoring.html',
  'https://www.mongodb.com/docs/manual/core/replica-set-elections/',
  'https://www.mongodb.com/docs/manual/core/read-preference/',
  'https://www.mongodb.com/docs/manual/reference/write-concern/',
  'https://redis.io/docs/latest/operate/oss_and_stack/management/replication/',
  'https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/',
  'https://docs.cloud.google.com/spanner/docs/replication',
  'https://github.blog/engineering/infrastructure/orchestrator-github/',
  'https://github.blog/engineering/infrastructure/mitigating-replication-lag-and-reducing-read-load-with-freno/',
  'https://github.blog/news-insights/company-news/oct21-post-incident-analysis/',
  'https://shopify.engineering/read-consistency-database-replicas',
  'https://www.uber.com/us/en/blog/improving-mysql-cluster-uptime-part2/',
]);

const TERMS = {
  en: [
    'Replication',
    'Leader',
    'Follower',
    'Asynchronous replication',
    'Synchronous replication',
    'Replication lag',
    'Read-your-own-writes',
    'Failover',
    'Promotion',
    'Split brain',
    'Quorum',
  ],
  zh: [
    '複製',
    '主節點',
    '從節點',
    '非同步複製',
    '同步複製',
    '複製延遲',
    '讀到自己的寫入',
    '故障轉移',
    '升級',
    '腦裂',
    '多數決',
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

describe('replication chapter', () => {
  it('T1: both files parse with sections in order and config present', () => {
    for (const raw of [en, zh]) {
      const chapter = load(raw);
      expect(chapter.id).toBe('replication');
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
