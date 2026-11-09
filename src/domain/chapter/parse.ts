import {
  SECTION_NAMES,
  chapterSchema,
  type Block,
  type Chapter,
  type Inline,
  type SectionName,
  type Source,
} from './schema';

export type ParseResult =
  { ok: true; chapter: Chapter } | { ok: false; error: string };

class ChapterError extends Error {}

const REQUIRED: readonly SectionName[] = [
  'situation',
  'terms',
  'how',
  'practice',
  'extreme',
  'sources',
];
const HTML_RE = /<\/?[A-Za-z!]/;
const FENCE_RE = /^```\s*([^\s`]*)\s*$/;
const MARKER_RE = /^##\s+@(\S+)\s*$/;

function fail(message: string): never {
  throw new ChapterError(message);
}

function parseFrontMatter(lines: string[]): {
  meta: Record<string, string>;
  rest: string[];
} {
  if (lines[0]?.trim() !== '---')
    fail('Front matter is missing: file must start with ---');
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) fail('Front matter is not closed with ---');
  const meta: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    if (line.trim() === '') continue;
    const idx = line.indexOf(':');
    if (idx === -1) fail(`Invalid front matter line: ${line}`);
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  for (const key of ['id', 'title', 'summary']) {
    if (!meta[key]) fail(`Front matter is missing required key: ${key}`);
  }
  return { meta, rest: lines.slice(end + 1) };
}

export function parseInlines(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf === '') return;
    if (HTML_RE.test(buf)) fail(`Raw HTML is not allowed: ${buf.trim()}`);
    out.push({ type: 'text', text: buf });
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '`') {
      const close = text.indexOf('`', i + 1);
      if (close === -1) fail(`Unclosed inline code: ${text}`);
      flush();
      out.push({ type: 'code', text: text.slice(i + 1, close) });
      i = close + 1;
      continue;
    }
    if (ch === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(text.slice(i));
      if (m) {
        if (HTML_RE.test(m[1]!)) fail(`Raw HTML is not allowed: ${m[1]}`);
        flush();
        out.push({ type: 'link', text: m[1]!, url: m[2]! });
        i += m[0].length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!))
        body.push(lines[i++]!);
      if (i >= lines.length) fail('Unclosed fenced code block');
      i++;
      blocks.push({ type: 'code', lang: fence[1]!, text: body.join('\n') });
      continue;
    }
    if (line.startsWith('### ')) {
      const name = line.slice(4).trim();
      if (!name) fail('Term heading has no name');
      if (HTML_RE.test(name)) fail(`Raw HTML is not allowed: ${name}`);
      const body: string[] = [];
      i++;
      let inFence = false;
      while (i < lines.length && (inFence || !lines[i]!.startsWith('### '))) {
        if (lines[i]!.startsWith('```')) inFence = !inFence;
        body.push(lines[i++]!);
      }
      const inner = parseBlocks(body);
      blocks.push({ type: 'term', name, blocks: inner });
      continue;
    }
    if (line.startsWith('#')) fail(`Unsupported heading: ${line}`);
    if (/^- /.test(line)) {
      const items: string[] = [];
      while (
        i < lines.length &&
        lines[i]!.trim() !== '' &&
        !lines[i]!.startsWith('```')
      ) {
        const l = lines[i]!;
        if (/^- /.test(l)) items.push(l.slice(2).trim());
        else if (/^\s+\S/.test(l) && items.length > 0)
          items[items.length - 1] += ' ' + l.trim();
        else break;
        i++;
      }
      blocks.push({ type: 'list', items: items.map(parseInlines) });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !lines[i]!.startsWith('```') &&
      !lines[i]!.startsWith('#') &&
      !/^- /.test(lines[i]!)
    ) {
      para.push(lines[i++]!.trim());
    }
    blocks.push({ type: 'paragraph', inlines: parseInlines(para.join(' ')) });
  }
  return blocks;
}

function splitSections(
  lines: string[],
): { name: SectionName; lines: string[] }[] {
  const sections: { name: SectionName; lines: string[] }[] = [];
  let inFence = false;
  let lastIndex = -1;
  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence;
    const m = inFence ? null : MARKER_RE.exec(line);
    if (m) {
      const name = m[1]! as SectionName;
      const index = SECTION_NAMES.indexOf(name);
      if (index === -1) fail(`Unknown section: @${m[1]}`);
      if (sections.some((s) => s.name === name))
        fail(`Duplicate section: ${name}`);
      if (index < lastIndex) fail(`Section out of order: ${name}`);
      lastIndex = index;
      sections.push({ name, lines: [] });
      continue;
    }
    if (sections.length === 0) {
      if (line.trim() !== '')
        fail('Content found before the first section marker');
      continue;
    }
    sections[sections.length - 1]!.lines.push(line);
  }
  return sections;
}

function parseSources(blocks: Block[]): Source[] {
  const sources: Source[] = [];
  for (const block of blocks) {
    if (block.type !== 'list')
      fail('Section sources must contain only a bullet list of links');
    for (const item of block.items) {
      const only = item[0];
      if (item.length !== 1 || only?.type !== 'link') {
        fail('Each source must be formatted as - [Title](https://url)');
      }
      sources.push({ title: only.text, url: only.url });
    }
  }
  return sources;
}

function collectLinks(blocks: Block[]): string[] {
  const urls: string[] = [];
  const fromInlines = (inlines: Inline[]) => {
    for (const x of inlines) if (x.type === 'link') urls.push(x.url);
  };
  for (const b of blocks) {
    if (b.type === 'paragraph') fromInlines(b.inlines);
    else if (b.type === 'list') b.items.forEach(fromInlines);
    else if (b.type === 'term') urls.push(...collectLinks(b.blocks));
  }
  return urls;
}

/**
 * A `@practice` entry is one bullet item. The section may contain only
 * bullet lists, and every item must hold at least one link.
 */
function checkPractice(blocks: Block[]): void {
  let count = 0;
  for (const b of blocks) {
    if (b.type !== 'list')
      fail('Section practice must contain only bullet lists');
    for (const item of b.items) {
      count++;
      if (!item.some((x) => x.type === 'link')) {
        const text = item.map((x) => x.text).join('');
        fail(`Practice entry ${count} has no link: ${text}`);
      }
    }
  }
}

function parseOrThrow(raw: string): Chapter {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const { meta, rest } = parseFrontMatter(lines);
  const raws = splitSections(rest);
  for (const name of REQUIRED) {
    if (!raws.some((s) => s.name === name))
      fail(`Missing required section: ${name}`);
  }
  const sections: Chapter['sections'] = [];
  let sources: Source[] = [];
  for (const s of raws) {
    const blocks = parseBlocks(s.lines);
    if (s.name === 'sources') sources = parseSources(blocks);
    else sections.push({ name: s.name, blocks });
  }
  const known = new Set(sources.map((s) => s.url));
  for (const s of sections) {
    for (const url of collectLinks(s.blocks)) {
      if (!known.has(url))
        fail(`Link not listed in sources (section ${s.name}): ${url}`);
    }
    if (s.name === 'practice') checkPractice(s.blocks);
  }
  const result = chapterSchema.safeParse({
    id: meta.id,
    title: meta.title,
    summary: meta.summary,
    sections,
    sources,
  });
  if (!result.success) fail(`Invalid chapter: ${result.error.message}`);
  return result.data;
}

export function parseChapter(raw: string): ParseResult {
  try {
    return { ok: true, chapter: parseOrThrow(raw) };
  } catch (e) {
    if (e instanceof ChapterError) return { ok: false, error: e.message };
    throw e;
  }
}
