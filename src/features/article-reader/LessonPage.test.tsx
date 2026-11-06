import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import en from '@/content/locales/en.json';
import LessonPage from '@/features/article-reader/LessonPage';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

afterEach(() => {
  vi.useRealTimers();
});

const termHeading = () =>
  screen.queryByRole('heading', { name: en['lesson.term.heading'] });

describe('LessonPage game', () => {
  it('T8: finishing a round shows the result screen and the term section', async () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    expect(termHeading()).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: en['lesson.game.start'] }),
    );
    expect(termHeading()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(
      screen.getByRole('heading', { name: en['lesson.game.result.heading'] }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: en['lesson.game.result.work'] }),
    ).toBeInTheDocument();
    expect(termHeading()).toBeInTheDocument();
  });

  it('T9: the term stays hidden until the reader skips the game', async () => {
    const user = userEvent.setup();
    render(<LessonPage />);
    expect(termHeading()).toBeNull();
    await user.click(
      screen.getByRole('button', { name: en['lesson.game.skip'] }),
    );
    expect(termHeading()).toBeInTheDocument();
  });

  it('T10: switching strategy with the keyboard applies it', async () => {
    const user = userEvent.setup();
    render(<LessonPage />);
    await user.click(
      screen.getByRole('button', { name: en['lesson.game.start'] }),
    );
    const inTurn = screen.getByRole('button', {
      name: en['lesson.game.strategy.inTurn'],
    });
    const shortest = screen.getByRole('button', {
      name: en['lesson.game.strategy.shortest'],
    });
    expect(inTurn).toHaveAttribute('aria-pressed', 'true');
    act(() => inTurn.focus());
    await user.tab();
    expect(shortest).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(shortest).toHaveAttribute('aria-pressed', 'true');
    expect(inTurn).toHaveAttribute('aria-pressed', 'false');
  });

  const strategyButton = (key: 'manual' | 'shortest') =>
    screen.getByRole('button', { name: en[`lesson.game.strategy.${key}`] });
  const counterLines = () =>
    screen
      .getAllByText(new RegExp(`^${en['lesson.game.line']}:`))
      .map((el) => Number(el.textContent!.split(':')[1]));
  const waitForCustomer = () => {
    for (
      let i = 0;
      i < 100 && screen.queryByText(en['lesson.game.nobody']);
      i += 1
    ) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
  };

  it('T12: by hand, pressing 2 sends the next customer to counter 2', () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    fireEvent.click(
      screen.getByRole('button', { name: en['lesson.game.start'] }),
    );
    fireEvent.click(strategyButton('manual'));
    expect(
      screen.getAllByRole('button', {
        name: new RegExp(en['lesson.game.sendTo']),
      })[1],
    ).toHaveTextContent(`${en['lesson.game.key']} 2`);
    waitForCustomer();
    expect(screen.queryByText(en['lesson.game.nobody'])).toBeNull();
    expect(counterLines()).toEqual([0, 0, 0]);
    // Holding a key sends repeat events, which must not send customers.
    fireEvent.keyDown(window, { key: '2', repeat: true });
    expect(counterLines()).toEqual([0, 0, 0]);
    fireEvent.keyDown(window, { key: '2' });
    expect(counterLines()).toEqual([0, 1, 0]);
  });

  it('T13: pressing 2 does nothing without a by hand round, or with Ctrl held', () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.click(
      screen.getByRole('button', { name: en['lesson.game.start'] }),
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const before = counterLines();
    fireEvent.keyDown(window, { key: '2' });
    expect(counterLines()).toEqual(before);
    fireEvent.click(strategyButton('manual'));
    waitForCustomer();
    const waiting = counterLines();
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });
    expect(counterLines()).toEqual(waiting);
  });

  const timeLeft = () =>
    Number(
      screen
        .getByText(new RegExp(`^${en['lesson.game.timeLeft']}`))
        .textContent!.match(/(\d+)/)![1],
    );
  const statValue = (key: 'served' | 'walkedOut') =>
    Number(
      screen
        .getByText(new RegExp(`^${en[`lesson.game.${key}`]}:`))
        .textContent!.split(':')[1],
    );
  const arrived = () =>
    statValue('served') +
    statValue('walkedOut') +
    counterLines().reduce((sum, n) => sum + n, 0);
  const runWithSpeed = (speed: 'slow' | 'fast') => {
    vi.useFakeTimers();
    const view = render(<LessonPage />);
    fireEvent.click(
      screen.getByRole('button', { name: en['lesson.game.start'] }),
    );
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    const leftBefore = timeLeft();
    const arrivedBefore = arrived();
    const button = screen.getByRole('button', {
      name: en[`lesson.game.speed.${speed}`],
    });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    // The round is not restarted by the change.
    expect(timeLeft()).toBe(leftBefore);
    expect(arrived()).toBe(arrivedBefore);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    const result = {
      leftBefore,
      leftAfter: timeLeft(),
      arrivedBefore,
      arrivedAfter: arrived(),
    };
    view.unmount();
    vi.useRealTimers();
    return result;
  };

  it('T14: changing arrival speed during a round applies it without restarting', () => {
    const slow = runWithSpeed('slow');
    const fast = runWithSpeed('fast');
    expect(slow.arrivedBefore).toBe(fast.arrivedBefore);
    expect(slow.leftAfter).toBeLessThan(slow.leftBefore);
    expect(fast.leftAfter).toBeLessThan(fast.leftBefore);
    expect(slow.arrivedAfter).toBeGreaterThanOrEqual(slow.arrivedBefore);
    expect(fast.arrivedAfter).toBeGreaterThan(slow.arrivedAfter);
  });
});
