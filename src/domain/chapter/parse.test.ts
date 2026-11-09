import { compareChapters } from './compare';
import { parseChapter } from './parse';
import type { Chapter } from './schema';

const U1 = 'https://example.com/a';
const U2 = 'https://example.com/b';

function build(
  opts: {
    config?: boolean;
    sources?: boolean;
    practice?: string;
    extra?: string;
    swap?: boolean;
  } = {},
) {
  const {
    config = true,
    sources = true,
    practice = `- Real case [A](${U1})\n- Another [B](${U2})`,
    extra = '',
    swap = false,
  } = opts;
  const terms = `## @terms\n\n### Load balancer\n\nSpreads requests. Uses \`round robin\`.\n\n- one\n- two\n`;
  const how = `## @how\n\nWatch it.\n`;
  const head = swap ? how + '\n' + terms : terms + '\n' + how;
  return [
    '---',
    'id: load-balancing',
    'title: Load balancing',
    'summary: Sharing work',
    '---',
    '',
    '## @situation',
    '',
    `A shop with three counters. ${extra}`,
    '',
    head,
    '## @practice',
    '',
    practice,
    '',
    '## @extreme',
    '',
    'Push it.',
    '',
    config ? '## @config\n\n```nginx\nupstream a {\n  server x;\n}\n```\n' : '',
    sources ? `## @sources\n\n- [A](${U1})\n- [B](${U2})\n` : '',
  ].join('\n');
}

function ok(raw: string): Chapter {
  const r = parseChapter(raw);
  if (!r.ok) throw new Error(r.error);
  return r.chapter;
}
function err(raw: string): string {
  const r = parseChapter(raw);
  if (r.ok) throw new Error('expected error');
  return r.error;
}

describe('parseChapter', () => {
  it('T1: parses a file with all sections and sources', () => {
    const c = ok(build());
    expect(c.id).toBe('load-balancing');
    expect(c.title).toBe('Load balancing');
    expect(c.sections.map((s) => s.name)).toEqual([
      'situation',
      'terms',
      'how',
      'practice',
      'extreme',
      'config',
    ]);
    expect(c.sources).toEqual([
      { title: 'A', url: U1 },
      { title: 'B', url: U2 },
    ]);
    expect(c.sections[1]!.blocks[0]).toMatchObject({
      type: 'term',
      name: 'Load balancer',
    });
  });

  it('T2: a missing @config parses and config is absent', () => {
    const c = ok(build({ config: false }));
    expect(c.sections.some((s) => s.name === 'config')).toBe(false);
  });

  it('T3: a fenced nginx block keeps language and text', () => {
    const c = ok(build());
    const cfg = c.sections.find((s) => s.name === 'config')!;
    expect(cfg.blocks[0]).toEqual({
      type: 'code',
      lang: 'nginx',
      text: 'upstream a {\n  server x;\n}',
    });
  });

  it('T4: a missing @sources names sources', () => {
    expect(err(build({ sources: false }))).toContain('sources');
  });

  it('T5: @how before @terms is an error', () => {
    expect(err(build({ swap: true }))).toContain('out of order');
  });

  it('T5: a duplicated section is an error', () => {
    const raw = build().replace('## @how', '## @how\n\nx\n\n## @how');
    expect(err(raw)).toContain('Duplicate');
  });

  it('T6: a body link not in sources names the URL', () => {
    expect(err(build({ extra: '[x](https://nope.example/z)' }))).toContain(
      'https://nope.example/z',
    );
  });

  it('T7: a @practice entry with no link is an error', () => {
    expect(
      err(build({ practice: `- Has link [A](${U1})\n- No link here` })),
    ).toContain('no link');
  });

  it('T8: raw HTML in the body is rejected', () => {
    expect(err(build({ extra: '<div>hi</div>' }))).toContain('HTML');
  });

  it('T8: raw HTML in link text is rejected', () => {
    expect(err(build({ extra: `[<b>x</b>](${U1})` }))).toContain('HTML');
  });

  it('T8: raw HTML in a term name is rejected', () => {
    const raw = build().replace('### Load balancer', '### <div>');
    expect(err(raw)).toContain('HTML');
  });

  it('T8: raw HTML in a list item is rejected', () => {
    expect(err(build({ practice: `- <i>x</i> [A](${U1})` }))).toContain('HTML');
  });

  it('T10: front matter without title names the key', () => {
    expect(err(build().replace('title: Load balancing\n', ''))).toContain(
      'title',
    );
  });
});

describe('compareChapters', () => {
  it('T9: reports differing practice entry counts', () => {
    const en = ok(
      build({ practice: `- a [A](${U1})\n- b [B](${U2})\n- c [A](${U1})` }),
    );
    const zh = ok(build({ practice: `- a [A](${U1})\n- b [B](${U2})` }));
    const problems = compareChapters(en, zh);
    expect(problems.some((p) => p.includes('practice'))).toBe(true);
    expect(compareChapters(en, en)).toEqual([]);
  });

  it('T9: reports differing source URLs', () => {
    const en = ok(build());
    const zh = ok(build().replaceAll(U2, 'https://example.com/c'));
    expect(compareChapters(en, zh).some((p) => p.includes(U2))).toBe(true);
  });
});
