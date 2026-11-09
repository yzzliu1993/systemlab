import type { Block, Inline } from '@/domain/chapter/schema';

const linkClass =
  'text-[#0F5C58] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6452F]';

export function InlineView({ inline }: { inline: Inline }) {
  if (inline.type === 'code') {
    return <code className="rounded bg-white px-1">{inline.text}</code>;
  }
  if (inline.type === 'link') {
    return (
      <a href={inline.url} target="_blank" rel="noopener" className={linkClass}>
        {inline.text}
      </a>
    );
  }
  return <>{inline.text}</>;
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((inline, i) => (
        <InlineView key={i} inline={inline} />
      ))}
    </>
  );
}

export function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p className="mt-2">
          <Inlines inlines={block.inlines} />
        </p>
      );
    case 'list':
      return (
        <ul className="mt-2 list-disc pl-6">
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines inlines={item} />
            </li>
          ))}
        </ul>
      );
    case 'code':
      return (
        <figure className="mt-2">
          {block.lang && (
            <figcaption className="text-sm font-semibold">
              {block.lang}
            </figcaption>
          )}
          <pre className="overflow-x-auto rounded-lg bg-white p-3 text-sm">
            <code>{block.text}</code>
          </pre>
        </figure>
      );
    case 'term':
      return (
        <div className="mt-3 rounded-lg bg-white p-3">
          <h3 className="font-bold text-[#0F5C58]">{block.name}</h3>
          {block.blocks.map((inner, i) => (
            <BlockView key={i} block={inner} />
          ))}
        </div>
      );
  }
}
