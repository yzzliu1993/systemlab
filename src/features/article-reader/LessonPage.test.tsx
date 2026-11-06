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
});
