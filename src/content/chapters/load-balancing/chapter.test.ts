import { compareChapters } from '@/domain/chapter/compare';
import { parseChapter } from '@/domain/chapter/parse';
import type { Chapter } from '@/domain/chapter/schema';
import en from './en.md?raw';
import zh from './zh-TW.md?raw';

const ALLOWED = new Set([
  'https://nginx.org/en/docs/http/ngx_http_upstream_module.html',
  'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html',
  'https://docs.aws.amazon.com/elasticloadbalancing/latest/userguide/how-elastic-load-balancing-works.html',
  'https://docs.cloud.google.com/load-balancing/docs/load-balancing-overview',
  'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers',
  'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/health_checking',
  'https://docs.haproxy.org/3.0/configuration.html',
  'https://sre.google/sre-book/load-balancing-datacenter/',
  'https://dropbox.tech/infrastructure/enhancing-bandaid-load-balancing-at-dropbox-by-leveraging-real-time-backend-server-load-information',
  'https://dropbox.tech/infrastructure/robinhood-in-house-load-balancing-service',
  'https://blog.cloudflare.com/unimog-cloudflares-edge-load-balancer/',
  'https://github.blog/engineering/infrastructure/glb-director-open-source-load-balancer/',
  'https://engineering.fb.com/2018/05/22/open-source/open-sourcing-katran-a-scalable-network-load-balancer/',
  'https://sre.google/sre-book/addressing-cascading-failures/',
  'https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter',
  'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/panic_threshold',
]);

const TERMS = {
  en: [
    'Load Balancer',
    'Server',
    'Request',
    'Round Robin',
    'Least Connections',
    'Weighted Round Robin',
    'Weighted Least Connections',
    'Health check',
  ],
  zh: [
    '負載平衡器',
    '伺服器',
    '請求',
    '輪詢',
    '最少連線',
    '加權輪詢',
    '加權最少連線',
    '健康檢查',
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

describe('load-balancing chapter', () => {
  it('T1: both files parse with sections in order and config present', () => {
    for (const raw of [en, zh]) {
      const chapter = load(raw);
      expect(chapter.id).toBe('load-balancing');
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
