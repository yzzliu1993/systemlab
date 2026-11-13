import { useEffect, useState } from 'react';
import { createRun, isComplete, step } from '@/domain/simulation/replication';
import type { RunState, Settings } from '@/domain/simulation/replication';

/** Base pace: one tick per 100 ms. */
const BASE_INTERVAL_MS = 100;

/**
 * Holds one replication run and advances it. Timing lives here, in the UI.
 * A new settings object restarts the run. Settings must already be valid.
 */
export function useReplicationRun(settings: Settings) {
  const [run, setRun] = useState<RunState>(() => createRun(settings));
  const [previous, setPrevious] = useState(settings);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  if (previous !== settings) {
    setPrevious(settings);
    setRun(createRun(settings));
  }

  const complete = isComplete(run);
  const running = playing && !complete;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () => setRun((current) => step(current)),
      BASE_INTERVAL_MS / speed,
    );
    return () => clearInterval(id);
  }, [running, speed]);

  return {
    run,
    running,
    complete,
    speed,
    setSpeed,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    step: () => setRun((current) => step(current)),
    reset: () => setRun(createRun(settings)),
  };
}
