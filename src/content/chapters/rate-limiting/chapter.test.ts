import { compareChapters } from '@/domain/chapter/compare';
import { parseChapter } from '@/domain/chapter/parse';
import type { Chapter } from '@/domain/chapter/schema';
import en from './en.md?raw';
import zh from './zh-TW.md?raw';

const ALLOWED = new Set([
  'https://nginx.org/en/docs/http/ngx_http_limit_req_module.html',
  'https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html',
  'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/other_features/global_rate_limiting',
  'https://docs.cloud.google.com/armor/docs/rate-limiting-overview',
  'https://www.rfc-editor.org/rfc/rfc6585.html',
  'https://www.rfc-editor.org/rfc/rfc9110.html',
  'https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api',
  'https://docs.stripe.com/rate-limits',
  'https://shopify.dev/docs/api/usage/rate-limits',
  'https://docs.discord.com/developers/topics/rate-limits',
  'https://stripe.com/blog/rate-limiters',
  'https://blog.cloudflare.com/counting-things-a-lot-of-different-things/',
  'https://www.figma.com/blog/an-alternative-approach-to-rate-limiting',
  'https://github.com/Netflix/concurrency-limits',
  'https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter',
  'https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload',
  'https://sre.google/sre-book/addressing-cascading-failures/',
  'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/circuit_breaking',
]);

const TERMS = {
  en: [
    'Rate limiting',
    'Token bucket',
    'Leaky bucket',
    'Fixed window',
    'Sliding window',
    'Burst',
    '429 Too Many Requests',
    'Retry-After',
    'Backoff with jitter',
    'Load shedding',
    'Concurrency limit',
  ],
  zh: [
    '限流',
    '令牌桶',
    '漏桶',
    '固定窗口',
    '滑動窗口',
    '突發流量',
    '429 請求過多',
    'Retry-After',
    '退避加抖動',
    '降載',
    '併發上限',
  ],
};

function load(raw: string): Chapter {
  const r = parseChapter(raw);
  if (!r.ok) throw new Error(r.error);
  return r.chapter;
}

function termNames(c: Chapter): string[] {
  const terms = c.sections.find((s) => s.name === 'terms')!;
  return terms.blocks.flatMap((b) => (b.type === 'term' ? [b.name] : []));
}

describe('rate-limiting chapter', () => {
  it('T1: both languages parse with sections in order and a config', () => {
    for (const raw of [en, zh]) {
      const c = load(raw);
      expect(c.id).toBe('rate-limiting');
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

  it('T2: the two languages have no structural differences', () => {
    expect(compareChapters(load(en), load(zh))).toEqual([]);
  });

  it('T3: every agreed term exists in both languages', () => {
    const names = {
      en: termNames(load(en)),
      zh: termNames(load(zh)),
    };
    for (const t of TERMS.en)
      expect(names.en.some((n) => n.startsWith(t))).toBe(true);
    for (const t of TERMS.zh)
      expect(names.zh.some((n) => n.startsWith(t))).toBe(true);
  });

  it('T4: every source url is in the allowed list', () => {
    for (const raw of [en, zh]) {
      for (const s of load(raw).sources) expect(ALLOWED.has(s.url)).toBe(true);
    }
  });
});
