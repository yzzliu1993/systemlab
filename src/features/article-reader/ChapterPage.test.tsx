import enRaw from '@/content/chapters/load-balancing/en.md?raw';
import zhRaw from '@/content/chapters/load-balancing/zh-TW.md?raw';
import { render, screen, within } from '@testing-library/react';
import en from '@/content/locales/en.json';
import zh from '@/content/locales/zh-TW.json';
import { parseChapter } from '@/domain/chapter/parse';
import type { Chapter } from '@/domain/chapter/schema';
import ChapterList from '@/features/article-reader/ChapterList';
import ChapterPage from '@/features/article-reader/ChapterPage';
import { buildRegistry } from '@/features/article-reader/registry';
import { useLanguage } from '@/stores/language';

function load(lang: 'en' | 'zh-TW'): Chapter {
  const r = parseChapter(lang === 'en' ? enRaw : zhRaw);
  if (!r.ok) throw new Error(r.error);
  return r.chapter;
}

function doc(id: string, opts: { config?: boolean } = {}): string {
  return [
    '---',
    `id: ${id}`,
    `title: Title ${id}`,
    `summary: Summary ${id}`,
    '---',
    '## @situation',
    'Sit.',
    '## @terms',
    '### Thing',
    'Means a thing.',
    '## @how',
    'How.',
    '## @practice',
    '- Case [A](https://example.com/a)',
    '## @extreme',
    'Extreme.',
    ...(opts.config
      ? ['## @config', '```nginx', 'upstream a {', '  server x;', '}', '```']
      : []),
    '## @sources',
    '- [A](https://example.com/a)',
  ].join('\n');
}

function chapterOf(raw: string): Chapter {
  const r = parseChapter(raw);
  if (!r.ok) throw new Error(r.error);
  return r.chapter;
}

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

const headingNames = () =>
  screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('ChapterList', () => {
  it('T1: two chapters give two links with titles and summaries', () => {
    const entries = buildRegistry({
      one: { en: doc('one'), 'zh-TW': doc('one') },
      two: { en: doc('two'), 'zh-TW': doc('two') },
    });
    render(<ChapterList entries={entries} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Title one');
    expect(links[0]).toHaveAttribute('href', '#/chapter/one');
    expect(screen.getByText('Summary two')).toBeInTheDocument();
  });
});

describe('ChapterPage', () => {
  it('T2: headings follow the template order and sources come last', () => {
    render(<ChapterPage chapter={load('en')} />);
    expect(headingNames()).toEqual([
      en['chapter.section.situation'],
      en['chapter.section.terms'],
      en['chapter.section.how'],
      en['chapter.section.practice'],
      en['chapter.section.extreme'],
      en['chapter.section.config'],
      en['chapter.section.sources'],
    ]);
    expect(screen.getByTestId('slot-how')).toBeInTheDocument();
    expect(screen.getByTestId('slot-extreme')).toBeInTheDocument();
  });

  it('T3: zh-TW shows the zh-TW title and headings', () => {
    useLanguage.setState({ language: 'zh-TW' });
    render(<ChapterPage chapter={load('zh-TW')} />);
    expect(
      screen.getByRole('heading', { level: 1, name: '負載平衡' }),
    ).toBeInTheDocument();
    expect(headingNames()[0]).toBe(zh['chapter.section.situation']);
    expect(headingNames().at(-1)).toBe(zh['chapter.section.sources']);
  });

  it('T4: a chapter without config has no config heading', () => {
    render(<ChapterPage chapter={chapterOf(doc('x'))} />);
    expect(
      screen.queryByRole('heading', { name: en['chapter.section.config'] }),
    ).toBeNull();
  });

  it('T5: code renders in a pre with a language label', () => {
    render(<ChapterPage chapter={chapterOf(doc('x', { config: true }))} />);
    const pre = screen.getByText(/upstream a/).closest('pre');
    expect(pre).not.toBeNull();
    expect(pre).toHaveTextContent('server x;');
    expect(screen.getByText('nginx')).toBeInTheDocument();
  });

  it('T9: the rendered chapter has no strategy or score controls', () => {
    render(<ChapterPage chapter={load('en')} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/score|timer|time left/i)).toBeNull();
  });

  it('links open safely', () => {
    render(<ChapterPage chapter={load('en')} />);
    const sources = within(
      screen.getByRole('heading', { name: en['chapter.section.sources'] })
        .parentElement as HTMLElement,
    ).getAllByRole('link');
    for (const a of sources) expect(a).toHaveAttribute('rel', 'noopener');
  });
});
