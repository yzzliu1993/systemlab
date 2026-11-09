import { parseChapter } from '@/domain/chapter/parse';
import { compareChapters } from '@/domain/chapter/compare';
import type { Block, Chapter } from '@/domain/chapter/schema';
import en from './en.md?raw';
import zh from './zh-TW.md?raw';

const ALLOWED = new Set([
  'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html',
  'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html',
  'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-queue-types.html',
  'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html',
  'https://www.rabbitmq.com/docs/confirms',
  'https://www.rabbitmq.com/docs/consumer-prefetch',
  'https://kafka.apache.org/43/design/design/',
  'https://kafka.apache.org/intro',
  'https://docs.cloud.google.com/pubsub/docs/lease-management',
  'https://docs.cloud.google.com/pubsub/docs/exactly-once-delivery',
  'https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues',
  'https://slack.engineering/scaling-slacks-job-queue/',
  'https://www.uber.com/blog/reliable-reprocessing/',
  'https://www.uber.com/blog/kafka-async-queuing-with-consumer-proxy/',
  'https://stripe.com/blog/idempotency',
  'https://builder.aws.com/content/3EuRcgkTP1MI0c7zM8W6HL3WIqA/avoiding-insurmountable-queue-backlogs',
  'https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter',
]);

const TERMS_EN = [
  'Message Queue',
  'Producer',
  'Consumer',
  'Acknowledgement (ack)',
  'Visibility timeout',
  'At-least-once delivery',
  'Idempotency',
  'Dead-letter queue',
  'Backlog',
];
const TERMS_ZH = [
  '訊息佇列',
  '生產者',
  '消費者',
  '確認（ack）',
  '可見性逾時',
  '至少一次送達',
  '冪等性',
  '死信佇列',
  '積壓',
];

function load(raw: string): Chapter {
  const r = parseChapter(raw);
  if (!r.ok) throw new Error(r.error);
  return r.chapter;
}

function termNames(c: Chapter): string[] {
  const terms = c.sections.find((s) => s.name === 'terms')!;
  return terms.blocks
    .filter((b): b is Extract<Block, { type: 'term' }> => b.type === 'term')
    .map((b) => b.name);
}

describe('message-queue chapter', () => {
  it('T1: both files parse with sections in order and a config', () => {
    for (const raw of [en, zh]) {
      expect(parseChapter(raw).ok).toBe(true);
      const c = load(raw);
      expect(c.id).toBe('message-queue');
      expect(c.sections.map((s) => s.name)).toEqual([
        'situation',
        'terms',
        'how',
        'practice',
        'extreme',
        'config',
      ]);
      const config = c.sections.find((s) => s.name === 'config')!;
      expect(config.blocks.some((b) => b.type === 'code')).toBe(true);
    }
  });

  it('T2: en and zh-TW have no differences', () => {
    expect(compareChapters(load(en), load(zh))).toEqual([]);
  });

  it('T3: every agreed term exists in both languages', () => {
    const enNames = termNames(load(en));
    const zhNames = termNames(load(zh));
    for (const t of TERMS_EN) expect(enNames).toContain(t);
    for (const t of TERMS_ZH) {
      expect(zhNames.some((n) => n.startsWith(t))).toBe(true);
    }
  });

  it('T4: every source URL is on the allowed list', () => {
    for (const raw of [en, zh]) {
      for (const s of load(raw).sources) expect(ALLOWED).toContain(s.url);
    }
  });
});
