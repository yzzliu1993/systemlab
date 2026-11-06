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

  it('T14: changing arrival speed during a round keeps the round running', async () => {
    const user = userEvent.setup();
    render(<LessonPage />);
    await user.click(
      screen.getByRole('button', { name: en['lesson.game.start'] }),
    );
    const fast = screen.getByRole('button', {
      name: en['lesson.game.speed.fast'],
    });
    const normal = screen.getByRole('button', {
      name: en['lesson.game.speed.normal'],
    });
    expect(normal).toHaveAttribute('aria-pressed', 'true');
    await user.click(fast);
    expect(fast).toHaveAttribute('aria-pressed', 'true');
    expect(normal).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByText(new RegExp(`^${en['lesson.game.timeLeft']}`)),
    ).toBeInTheDocument();
  });
});
