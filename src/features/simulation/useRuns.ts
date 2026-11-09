import { useEffect, useState } from 'react';
import { createRun, isComplete, step } from '@/domain/simulation/loadBalancer';
import type { RunState, Settings } from '@/domain/simulation/loadBalancer';

export const SPEEDS = [0.5, 1, 2, 5] as const;

/** Base pace: one tick per 100 ms, the domain's 10 ticks per second. */
const BASE_INTERVAL_MS = 100;

function sameSettings(a: readonly Settings[], b: readonly Settings[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

/**
 * Holds one run per settings entry and advances them together.
 * Timing lives here, in the UI. A new settings list restarts every run.
 * Settings must already be valid.
 */
export function useRuns(settingsList: readonly Settings[]) {
  const [runs, setRuns] = useState<RunState[]>(() =>
    settingsList.map(createRun),
  );
  const [previous, setPrevious] = useState(settingsList);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  if (!sameSettings(previous, settingsList)) {
    setPrevious(settingsList);
    setRuns(settingsList.map(createRun));
  }

  const complete = runs.every(isComplete);
  const running = playing && !complete;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () => setRuns((current) => current.map((run) => step(run))),
      BASE_INTERVAL_MS / speed,
    );
    return () => clearInterval(id);
  }, [running, speed]);

  return {
    runs,
    running,
    complete,
    speed,
    setSpeed,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    step: () => setRuns((current) => current.map((run) => step(run))),
    reset: () => setRuns(settingsList.map(createRun)),
  };
}
