import clsx from 'clsx';
import { getTotals } from '@/domain/simulation/replication';
import type { RunState } from '@/domain/simulation/replication';
import { fill } from '@/features/simulation/parts';
import { useT } from '@/stores/language';

type NodeRole = 'leader' | 'follower' | 'down' | 'cutOff';

function roleOf(run: RunState, i: number): NodeRole {
  const node = run.nodes[i]!;
  if (!node.alive) return 'down';
  if (i === run.leaderA || i === run.leaderB) return 'leader';
  if (run.partitioned && node.side === 'b') return 'cutOff';
  return 'follower';
}

/** The run on screen: tick, leader and followers, stats row. */
export default function ReplicationRunView({ run }: { run: RunState }) {
  const t = useT();
  const totals = getTotals(run);
  const total = run.settings.ticks;
  const last = run.history[run.history.length - 1];
  const behind = (i: number) =>
    last?.lag.find((l) => l.node === i)?.writesBehind ?? 0;
  const roleText: Record<NodeRole, string> = {
    leader: t('sim.repl.node.leader'),
    follower: t('sim.repl.node.follower'),
    down: t('sim.repl.node.down'),
    cutOff: t('sim.repl.node.cutOff'),
  };
  const roleSymbol: Record<NodeRole, string> = {
    leader: '★ ',
    follower: '● ',
    down: '✕ ',
    cutOff: '⊘ ',
  };
  const rows: [string, string | number][] = [
    [t('sim.repl.stats.acked'), totals.writesAcked],
    [t('sim.repl.stats.refused'), totals.writesRefused],
    [t('sim.repl.stats.stale'), totals.staleReads],
    [t('sim.repl.stats.lost'), totals.lostWrites],
    [t('sim.repl.stats.conflicts'), totals.conflicts],
    [t('sim.repl.stats.averageLatency'), totals.averageWriteLatency.toFixed(1)],
    [t('sim.repl.stats.maxLatency'), totals.maxWriteLatency],
  ];
  return (
    <div className="flex flex-col gap-3">
      <p>
        {fill(t('sim.tick'), { tick: run.tick, total })}
        {run.tick >= total && ` ${t('sim.complete')}`}
      </p>
      <p aria-live="polite" className="sr-only">
        {fill(t('sim.repl.stats.summary'), {
          tick: run.tick,
          acked: totals.writesAcked,
          stale: totals.staleReads,
          lost: totals.lostWrites,
          conflicts: totals.conflicts,
        })}
      </p>
      <ul
        className="flex flex-wrap gap-3"
        aria-label={t('sim.repl.nodes.title')}
      >
        {run.nodes.map((_node, i) => {
          const role = roleOf(run, i);
          const name = fill(t('sim.repl.node.name'), { n: i + 1 });
          return (
            <li key={i} className="list-none">
              <section
                aria-label={name}
                className={clsx(
                  'w-44 rounded border-2 p-2 text-sm',
                  role === 'leader' && 'border-solid border-slate-900 bg-white',
                  role === 'follower' &&
                    'border-solid border-slate-500 bg-white',
                  role === 'down' &&
                    'border-dashed border-slate-500 bg-slate-200',
                  role === 'cutOff' &&
                    'border-dotted border-slate-500 bg-slate-100',
                )}
              >
                <h4 className="font-semibold">{name}</h4>
                <p>
                  <span aria-hidden="true">{roleSymbol[role]}</span>
                  <span>{roleText[role]}</span>
                </p>
                {role !== 'leader' && role !== 'down' && (
                  <p>{fill(t('sim.repl.node.behind'), { n: behind(i) })}</p>
                )}
              </section>
            </li>
          );
        })}
      </ul>
      <dl
        aria-label={t('sim.stats.title')}
        className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3"
      >
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt>{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {run.settings.failure && (
        <p className="text-sm">{t('sim.repl.staleAfterFailover')}</p>
      )}
    </div>
  );
}
