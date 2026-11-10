import { ringPositions } from '@/domain/simulation/consistentHashing';
import type {
  ChangeReport,
  Stats,
  Strategy,
} from '@/domain/simulation/consistentHashing';
import { fill } from '@/features/simulation/parts';
import { useT } from '@/stores/language';

const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = 110;
/** Up to this many virtual nodes per node, each gets its own shape mark. */
const MARKS_UP_TO = 8;
const SHAPES = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'cross',
  'hexagon',
] as const;
type Shape = (typeof SHAPES)[number];
const GLYPHS = ['●', '■', '▲', '◆', '✕', '⬢'];

function shapeFor(index: number): Shape {
  return SHAPES[index % SHAPES.length];
}

function pointAt(position: number, radius: number) {
  const angle = position * 2 * Math.PI - Math.PI / 2;
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

function Mark({
  shape,
  x,
  y,
  size,
}: {
  shape: Shape;
  x: number;
  y: number;
  size: number;
}) {
  const s = size;
  const common = { fill: 'white', stroke: '#1e293b', strokeWidth: 2 };
  switch (shape) {
    case 'circle':
      return <circle cx={x} cy={y} r={s} {...common} />;
    case 'square':
      return (
        <rect x={x - s} y={y - s} width={2 * s} height={2 * s} {...common} />
      );
    case 'triangle':
      return (
        <polygon
          points={`${x},${y - s * 1.2} ${x + s * 1.1},${y + s} ${x - s * 1.1},${y + s}`}
          {...common}
        />
      );
    case 'diamond':
      return (
        <polygon
          points={`${x},${y - s * 1.3} ${x + s * 1.3},${y} ${x},${y + s * 1.3} ${x - s * 1.3},${y}`}
          {...common}
        />
      );
    case 'cross':
      return (
        <path
          d={`M${x - s},${y - s} L${x + s},${y + s} M${x - s},${y + s} L${x + s},${y - s}`}
          fill="none"
          stroke="#1e293b"
          strokeWidth={3}
        />
      );
    case 'hexagon': {
      const pts = Array.from({ length: 6 }, (_v, k) => {
        const a = (k * Math.PI) / 3;
        return `${x + s * 1.2 * Math.cos(a)},${y + s * 1.2 * Math.sin(a)}`;
      }).join(' ');
      return <polygon points={pts} {...common} />;
    }
  }
}

function Ring({
  nodeIds,
  virtualNodes,
}: {
  nodeIds: readonly string[];
  virtualNodes: number;
}) {
  const t = useT();
  const points = ringPositions({ nodeIds, virtualNodes });
  const allMarks = virtualNodes <= MARKS_UP_TO;
  return (
    <svg
      role="img"
      aria-label={fill(t('sim.ch.ring.label'), {
        nodes: nodeIds.length,
        vnodes: virtualNodes,
      })}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-72 w-72 max-w-full"
    >
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={2}
      />
      {points.map((p) => {
        const index = nodeIds.indexOf(p.nodeId);
        const first = p.vnodeIndex === 0;
        const key = `${p.nodeId}#${p.vnodeIndex}`;
        if (!first && !allMarks) {
          const a = pointAt(p.position, RADIUS - 5);
          const b = pointAt(p.position, RADIUS + 5);
          return (
            <line
              key={key}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#475569"
              strokeWidth={1}
            />
          );
        }
        const at = pointAt(p.position, RADIUS);
        const label = pointAt(p.position, RADIUS + 22);
        return (
          <g key={key}>
            <Mark
              shape={shapeFor(index)}
              x={at.x}
              y={at.y}
              size={first ? 6 : 4}
            />
            {first && (
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={600}
                fill="#0f172a"
              >
                {p.nodeId}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-32 border border-slate-500 bg-white align-middle"
    >
      <span
        className="block h-full bg-slate-700"
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

function summaryText(
  t: (key: string) => string,
  report: ChangeReport,
  keys: number,
): string {
  const head = fill(
    t(report.change.type === 'add' ? 'sim.ch.added' : 'sim.ch.removed'),
    { node: report.nodeId },
  );
  return `${head} ${fill(t('sim.ch.movedSummary'), {
    moved: report.keysMoved,
    keys,
    share: percent(report.shareMoved),
  })}`;
}

/** The ring, per-node bars and the readouts for one state of the group. */
export default function HashingRunView({
  strategy,
  virtualNodes,
  stats,
  report,
}: {
  strategy: Strategy;
  virtualNodes: number;
  stats: Stats;
  report?: ChangeReport;
}) {
  const t = useT();
  const nodeIds = stats.nodes.map((n) => n.nodeId);
  const maxKeys = Math.max(...stats.nodes.map((n) => n.keys));
  const maxRequests = Math.max(...stats.nodes.map((n) => n.requestsPerTick));
  const totalKeys = stats.owners.length;
  const rows: [string, string][] = [
    [t('sim.ch.stats.keyImbalance'), `${stats.keyMaxAvg.toFixed(2)}x`],
    [t('sim.ch.stats.requestImbalance'), `${stats.requestMaxAvg.toFixed(2)}x`],
  ];
  const goneTo = report
    ? Object.entries(report.removedKeysTo).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      )
    : [];
  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="text-sm font-semibold">
        {report ? summaryText(t, report, totalKeys) : t('sim.ch.noChange')}
      </p>
      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-1">
          <h4 className="font-semibold">{t('sim.ch.ring.title')}</h4>
          {strategy === 'ring' ? (
            <Ring nodeIds={nodeIds} virtualNodes={virtualNodes} />
          ) : (
            <p className="max-w-xs text-sm">{t('sim.ch.ring.ringOnly')}</p>
          )}
        </div>
        <ul
          aria-label={t('sim.ch.nodes.title')}
          className="flex flex-col gap-2 text-sm"
        >
          {stats.nodes.map((n, i) => (
            <li key={n.nodeId} className="list-none">
              <section aria-label={n.nodeId}>
                <h4 className="font-semibold">
                  <span aria-hidden="true">{GLYPHS[i % GLYPHS.length]} </span>
                  {n.nodeId}
                </h4>
                <p>
                  {fill(t('sim.ch.node.keys'), { n: n.keys })}{' '}
                  <Bar value={n.keys} max={maxKeys} />
                </p>
                <p>
                  {fill(t('sim.ch.node.requests'), {
                    n: n.requestsPerTick.toFixed(1),
                  })}{' '}
                  <Bar value={n.requestsPerTick} max={maxRequests} />
                </p>
              </section>
            </li>
          ))}
        </ul>
      </div>
      <dl
        aria-label={t('sim.ch.stats.title')}
        className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3"
      >
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt>{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
        {report && (
          <>
            <div className="flex gap-2">
              <dt>{t('sim.ch.stats.keysMoved')}</dt>
              <dd className="font-semibold">{report.keysMoved}</dd>
            </div>
            <div className="flex gap-2">
              <dt>{t('sim.ch.stats.shareMoved')}</dt>
              <dd className="font-semibold">{percent(report.shareMoved)}</dd>
            </div>
          </>
        )}
      </dl>
      {report?.change.type === 'remove' && (
        <p className="text-sm">
          {fill(t('sim.ch.wentTo'), { node: report.nodeId })}{' '}
          {goneTo.length === 0
            ? t('sim.ch.wentToNone')
            : goneTo.map(([id, n]) => `${id}: ${n}`).join(', ')}
        </p>
      )}
    </div>
  );
}
