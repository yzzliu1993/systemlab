import type { Block, Chapter } from './schema';

function shape(block: Block): string {
  switch (block.type) {
    case 'list':
      return `list(${block.items.length})`;
    case 'term':
      return `term(${block.blocks.map(shape).join(',')})`;
    case 'code':
      return `code:${block.lang}`;
    default:
      return 'paragraph';
  }
}

/**
 * Compares two language versions of a chapter. Returns a list of
 * differences; an empty list means the structure and sources match.
 */
export function compareChapters(a: Chapter, b: Chapter): string[] {
  const problems: string[] = [];
  if (a.id !== b.id) problems.push(`Chapter id differs: ${a.id} vs ${b.id}`);
  const namesA = a.sections.map((s) => s.name).join(',');
  const namesB = b.sections.map((s) => s.name).join(',');
  if (namesA !== namesB) {
    problems.push(`Section list differs: [${namesA}] vs [${namesB}]`);
  } else {
    a.sections.forEach((sa, i) => {
      const sb = b.sections[i]!;
      const shapeA = sa.blocks.map(shape).join(' ');
      const shapeB = sb.blocks.map(shape).join(' ');
      if (shapeA !== shapeB) {
        problems.push(
          `Section ${sa.name} structure differs: ${shapeA} vs ${shapeB}`,
        );
      }
    });
  }
  const urlsA = new Set(a.sources.map((s) => s.url));
  const urlsB = new Set(b.sources.map((s) => s.url));
  for (const u of urlsA)
    if (!urlsB.has(u)) problems.push(`Source only in first chapter: ${u}`);
  for (const u of urlsB)
    if (!urlsA.has(u)) problems.push(`Source only in second chapter: ${u}`);
  return problems;
}
