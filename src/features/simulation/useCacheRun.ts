import { useEffect, useReducer, useState } from 'react';
import {
  createCacheRun,
  isCacheComplete,
  stepCache,
} from '@/domain/simulation/cache';
import type { CacheRun, CacheSettings } from '@/domain/simulation/cache';

/** Base pace: one tick per 100 ms. */
const BASE_INTERVAL_MS = 100;

/**
 * Holds one cache run. The domain mutates the run, so the hook forces a render
 * after each step instead of relying on a new object. Reset and new settings
 * create a fresh run. Settings must already be valid.
 */
export function useCacheRun(settings: CacheSettings) {
  const [run, setRun] = useState<CacheRun>(() => createCacheRun(settings));
  const [previous, setPrevious] = useState(settings);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  let current = run;
  if (previous !== settings) {
    current = createCacheRun(settings);
    setPrevious(settings);
    setRun(current);
  }

  const complete = isCacheComplete(current);
  const running = playing && !complete;

  const advance = () => {
    if (!isCacheComplete(current)) stepCache(current);
    bump();
  };

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (!isCacheComplete(current)) stepCache(current);
      bump();
    }, BASE_INTERVAL_MS / speed);
    return () => clearInterval(id);
  }, [running, speed, current]);

  return {
    run: current,
    running,
    complete,
    speed,
    setSpeed,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    step: advance,
    reset: () => setRun(createCacheRun(settings)),
  };
}
