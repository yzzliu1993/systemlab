import { act, fireEvent, screen } from '@testing-library/react';

/**
 * Jumps a simulation forward by playing under fake timers: one render for many ticks.
 * The run may finish during the jump, which swaps Pause back to a disabled Start.
 */
export const jump = (ticks: number) => {
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole('button', { name: '▶ Start' }));
    act(() => {
      vi.advanceTimersByTime(ticks * 100);
    });
    const pause = screen.queryByRole('button', { name: '⏸ Pause' });
    if (pause) fireEvent.click(pause);
  } finally {
    vi.useRealTimers();
  }
};
