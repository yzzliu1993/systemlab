import { useEffect, useMemo, useState } from 'react';
import { runSimulation } from '@/domain/simulation/rateLimit';
import type { Settings, TickStats } from '@/domain/simulation/rateLimit';

const BASE_INTERVAL_MS = 100;

/**
 * Runs the whole simulation once per settings object and steps through the
 * precomputed history. `tick` is how many ticks have been shown (0 = none yet).
 * Settings must already be valid. New settings restart at tick 0.
 */
export function useRateLimitRun(settings: Settings) {
  const history = useMemo<TickStats[]>(
    () => runSimulation(settings),
    [settings],
  );
  const total = history.length;
  const [tick, setTick] = useState(0);
  const [previous, setPrevious] = useState(settings);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  if (previous !== settings) {
    setPrevious(settings);
    setTick(0);
  }

  const complete = tick >= total;
  const running = playing && !complete;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () => setTick((t) => Math.min(t + 1, total)),
      BASE_INTERVAL_MS / speed,
    );
    return () => clearInterval(id);
  }, [running, speed, total]);

  return {
    history,
    tick,
    total,
    running,
    complete,
    speed,
    setSpeed,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    step: () => setTick((t) => Math.min(t + 1, total)),
    reset: () => setTick(0),
  };
}

export type Totals = {
  sent: number;
  accepted: number;
  rejected: number;
  shed: number;
  retries: number;
  inFlight: number;
  serverQueue: number;
  averageLatency: number;
  maxLatency: number;
  firstAttemptsByClient: number[];
  acceptedByClient: number[];
};

/** Running totals over the first `tick` entries of the history. */
export function totalsAt(
  history: readonly TickStats[],
  tick: number,
  clientCount: number,
): Totals {
  const totals: Totals = {
    sent: 0,
    accepted: 0,
    rejected: 0,
    shed: 0,
    retries: 0,
    inFlight: 0,
    serverQueue: 0,
    averageLatency: 0,
    maxLatency: 0,
    firstAttemptsByClient: Array.from({ length: clientCount }, () => 0),
    acceptedByClient: Array.from({ length: clientCount }, () => 0),
  };
  for (let i = 0; i < tick; i++) {
    const s = history[i]!;
    totals.sent += s.sent;
    totals.accepted += s.accepted;
    totals.rejected += s.rejected;
    totals.shed += s.shed;
    totals.retries += s.retries;
    s.firstAttemptsByClient.forEach((n, c) => {
      totals.firstAttemptsByClient[c]! += n;
    });
    s.acceptedByClient.forEach((n, c) => {
      totals.acceptedByClient[c]! += n;
    });
  }
  const last = tick > 0 ? history[tick - 1] : undefined;
  if (last) {
    totals.inFlight = last.inFlight;
    totals.serverQueue = last.serverQueue;
    totals.averageLatency = last.averageLatency;
    totals.maxLatency = last.maxLatency;
  }
  return totals;
}
