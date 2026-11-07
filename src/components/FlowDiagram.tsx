import { useId } from 'react';

export interface DiagramNode {
  id: string;
  label: string;
}

export interface DiagramRow {
  id: string;
  label: string;
  nodes: DiagramNode[];
}

export interface DiagramArrow {
  from: string;
  to: string;
  /** 'flow' (default) is an arrow; 'map' is a dotted line meaning "is the same thing as". */
  kind?: 'flow' | 'map';
}

interface FlowDiagramProps {
  title: string;
  description: string;
  rows: DiagramRow[];
  arrows: DiagramArrow[];
}

const NODE_W = 190;
const NODE_H = 52;
const GAP_X = 70;
const GAP_Y = 70;
const LABEL_H = 28;
const PAD = 8;

interface Placed {
  x: number;
  y: number;
  row: number;
}

export default function FlowDiagram({
  title,
  description,
  rows,
  arrows,
}: FlowDiagramProps) {
  const id = useId();
  const descId = `${id}-desc`;
  const markerId = `${id}-arrow`;
  const columns = Math.max(1, ...rows.map((r) => r.nodes.length));
  const width = PAD * 2 + columns * NODE_W + (columns - 1) * GAP_X;
  const rowTop = (i: number) => PAD + i * (LABEL_H + NODE_H + GAP_Y);
  const height = rowTop(Math.max(rows.length, 1) - 1) + LABEL_H + NODE_H + PAD;

  const placed = new Map<string, Placed>();
  rows.forEach((row, r) => {
    row.nodes.forEach((node, c) => {
      placed.set(node.id, {
        x: PAD + c * (NODE_W + GAP_X),
        y: rowTop(r) + LABEL_H,
        row: r,
      });
    });
  });

  const lines = arrows.flatMap((arrow, i) => {
    const a = placed.get(arrow.from);
    const b = placed.get(arrow.to);
    if (!a || !b) return [];
    let x1: number, y1: number, x2: number, y2: number;
    if (a.row === b.row) {
      const right = b.x > a.x;
      x1 = right ? a.x + NODE_W : a.x;
      x2 = right ? b.x : b.x + NODE_W;
      y1 = y2 = a.y + NODE_H / 2;
    } else {
      const down = b.row > a.row;
      x1 = a.x + NODE_W / 2;
      x2 = b.x + NODE_W / 2;
      y1 = down ? a.y + NODE_H : a.y;
      y2 = down ? b.y : b.y + NODE_H;
    }
    return [
      {
        key: `${arrow.from}-${arrow.to}-${i}`,
        map: arrow.kind === 'map',
        x1,
        y1,
        x2,
        y2,
      },
    ];
  });

  return (
    <svg
      role="img"
      aria-label={title}
      aria-describedby={descId}
      viewBox={`0 0 ${width} ${height}`}
      className="mx-auto w-full max-w-4xl"
    >
      <title>{title}</title>
      <desc id={descId}>{description}</desc>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="#1F2937" />
        </marker>
      </defs>
      {rows.map((row, r) => (
        <text
          key={row.id}
          x={PAD}
          y={rowTop(r) + 18}
          fontSize="16"
          fontWeight="700"
          fill="#0F5C58"
        >
          {row.label}
        </text>
      ))}
      {lines.map(({ key, map, ...l }) => (
        <line
          key={key}
          {...l}
          stroke="#1F2937"
          strokeWidth="2"
          strokeDasharray={map ? '2 5' : undefined}
          strokeLinecap={map ? 'round' : undefined}
          markerEnd={map ? undefined : `url(#${markerId})`}
        />
      ))}
      {rows.map((row, r) =>
        row.nodes.map((node) => {
          const p = placed.get(node.id)!;
          return (
            <g key={node.id}>
              <rect
                x={p.x}
                y={p.y}
                width={NODE_W}
                height={NODE_H}
                rx="10"
                fill="#FFFFFF"
                stroke={r === 0 ? '#D6452F' : '#0F5C58'}
                strokeWidth="2"
                strokeDasharray={r === 0 ? undefined : '6 4'}
              />
              <text
                x={p.x + NODE_W / 2}
                y={p.y + NODE_H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="16"
                fill="#1F2937"
              >
                {node.label}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
