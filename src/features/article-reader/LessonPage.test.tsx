import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import en from '@/content/locales/en.json';
import {
  DEFAULT_CONFIG,
  TAKEOUT_RUSH_CONFIG,
  furthestBehind,
  runRound,
} from '@/domain/game/lunchRush';
import type { Strategy } from '@/domain/game/lunchRush';
import LessonPage from '@/features/article-reader/LessonPage';
import zh from '@/content/locales/zh-TW.json';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

afterEach(() => {
  vi.useRealTimers();
});

type Key = keyof typeof en;

const termHeading = () =>
  screen.queryByRole('heading', { name: en['lesson.term.heading'] });

const diagram = () =>
  screen.queryByRole('img', { name: en['lesson.diagram.title'] });

const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const stepHeading = (key: string) =>
  screen.queryByRole('heading', { name: en[`lesson.game.step.${key}` as Key] });

type Stage =
  | 'intro'
  | 'byHand'
  | 'choose'
  | 'watch'
  | 'result'
  | 'eventChoose'
  | 'eventWatch'
  | 'eventResult';
const stages: Stage[] = [
  'intro',
  'byHand',
  'choose',
  'watch',
  'result',
  'eventChoose',
  'eventWatch',
  'eventResult',
];

/** Seed 7 is the first round; each restart adds one. */
const behindFor = (seed: number, rule: Strategy) =>
  furthestBehind(runRound(seed, rule, DEFAULT_CONFIG).counters);

/** Go through the scenario up to and including the given stage (fake timers). */
function playTo(stage: Stage, opts: { guess?: number; seed?: number } = {}) {
  const until = stages.indexOf(stage);
  const reach = (s: Stage) => stages.indexOf(s) <= until;
  if (!reach('byHand')) return;
  press(en['lesson.game.start']);
  if (!reach('choose')) return;
  advance(20_500);
  press(en['lesson.game.strategy.inTurn']);
  if (!reach('watch')) return;
  const guess = opts.guess ?? behindFor(opts.seed ?? 7, 'inTurn');
  press(en[`lesson.game.counter${guess + 1}` as Key]);
  press(en['lesson.game.choose.watch']);
  if (!reach('result')) return;
  advance(6_500);
  if (!reach('eventChoose')) return;
  press(en['lesson.game.result.next']);
  if (!reach('eventWatch')) return;
  press(en['lesson.game.strategy.leastWork']);
  press(en['lesson.game.event.watch']);
  if (!reach('eventResult')) return;
  advance(6_500);
}

describe('LessonPage diagram', () => {
  it('T1: after a finished scenario the diagram shows both rows', () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    playTo('eventResult');
    expect(diagram()).toBeInTheDocument();
    for (const key of [
      'row.shop',
      'row.system',
      'customers',
      'director',
      'counters',
      'requests',
      'lb',
      'servers',
    ] as const) {
      expect(
        within(diagram()!).getByText(en[`lesson.diagram.${key}`]),
      ).toBeInTheDocument();
    }
    expect(diagram()).toHaveAccessibleDescription(en['lesson.diagram.desc']);
  });

  it('T2: before playing no diagram is shown', () => {
    render(<LessonPage />);
    expect(diagram()).toBeNull();
    expect(screen.queryByText(en['lesson.diagram.row.shop'])).toBeNull();
  });

  it('T3: switching to Chinese changes the diagram labels', async () => {
    const user = userEvent.setup();
    render(<LessonPage />);
    await user.click(
      screen.getByRole('button', { name: en['lesson.game.skip'] }),
    );
    expect(
      screen.getByText(en['lesson.diagram.customers']),
    ).toBeInTheDocument();
    act(() => useLanguage.setState({ language: 'zh-TW' }));
    expect(
      screen.getByText(zh['lesson.diagram.customers']),
    ).toBeInTheDocument();
    expect(screen.queryByText(en['lesson.diagram.customers'])).toBeNull();
  });
});

describe('LessonPage scenario', () => {
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
      advance(100);
    }
  };

  it('T6: the steps appear in order and the term appears only at the end', () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    expect(termHeading()).toBeNull();
    press(en['lesson.game.start']);
    expect(stepHeading('byHand')).toBeInTheDocument();
    advance(19_000);
    expect(stepHeading('byHand')).toBeInTheDocument();
    advance(1_500);
    expect(stepHeading('choose')).toBeInTheDocument();
    expect(termHeading()).toBeNull();
    press(en['lesson.game.strategy.shortest']);
    press(en['lesson.game.counter1']);
    press(en['lesson.game.choose.watch']);
    expect(stepHeading('watch')).toBeInTheDocument();
    expect(termHeading()).toBeNull();
    advance(6_500);
    expect(stepHeading('result')).toBeInTheDocument();
    expect(termHeading()).toBeNull();
    press(en['lesson.game.result.next']);
    expect(stepHeading('event')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: en['lesson.game.strategy.leastWork'],
      }),
    ).toBeInTheDocument();
    expect(termHeading()).toBeNull();
    press(en['lesson.game.event.watch']);
    expect(termHeading()).toBeNull();
    advance(6_500);
    // Both results show side by side, then the term appears.
    expect(screen.getAllByRole('table')).toHaveLength(2);
    expect(
      screen.getByText(en['lesson.game.event.before']),
    ).toBeInTheDocument();
    expect(screen.getByText(en['lesson.game.event.after'])).toBeInTheDocument();
    expect(termHeading()).toBeInTheDocument();
  });

  it('T7: the page says the prediction was right, then wrong', () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    playTo('result', { guess: behindFor(7, 'inTurn') });
    expect(
      screen.getByText(en['lesson.game.result.right']),
    ).toBeInTheDocument();
    expect(screen.queryByText(en['lesson.game.result.wrong'])).toBeNull();

    press(en['lesson.game.restart']);
    playTo('result', { guess: (behindFor(8, 'inTurn') + 1) % 3 });
    expect(
      screen.getByText(en['lesson.game.result.wrong']),
    ).toBeInTheDocument();
    expect(screen.queryByText(en['lesson.game.result.right'])).toBeNull();
  });

  it('T8: by hand, pressing 2 sends the next customer to counter 2', () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    press(en['lesson.game.start']);
    expect(
      screen.getAllByRole('button', {
        name: new RegExp(en['lesson.game.sendTo']),
      })[1],
    ).toHaveTextContent(`${en['lesson.game.key']} 2`);
    waitForCustomer();
    expect(screen.queryByText(en['lesson.game.nobody'])).toBeNull();
    expect(counterLines()).toEqual([0, 0, 0]);
    // Holding a key sends repeat events, and Ctrl+2 is not ours.
    fireEvent.keyDown(window, { key: '2', repeat: true });
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });
    expect(counterLines()).toEqual([0, 0, 0]);
    fireEvent.keyDown(window, { key: '2' });
    expect(counterLines()).toEqual([0, 1, 0]);
  });

  it('T8: the keys do nothing outside the by hand step', () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    fireEvent.keyDown(window, { key: '2' });
    playTo('watch');
    advance(100);
    const before = counterLines();
    fireEvent.keyDown(window, { key: '2' });
    expect(counterLines()).toEqual(before);
  });

  it('T9: skipping at any step shows the term and nothing crashes', () => {
    for (const stage of stages) {
      vi.useFakeTimers();
      const view = render(<LessonPage />);
      playTo(stage);
      // At the very end the term is already shown and skip is gone.
      if (stage !== 'eventResult') {
        expect(termHeading()).toBeNull();
        press(en['lesson.game.skip']);
      }
      expect(termHeading()).toBeInTheDocument();
      expect(diagram()).toBeInTheDocument();
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('T9: the term stays hidden until the reader skips or finishes', async () => {
    const user = userEvent.setup();
    render(<LessonPage />);
    expect(termHeading()).toBeNull();
    await user.click(
      screen.getByRole('button', { name: en['lesson.game.skip'] }),
    );
    expect(termHeading()).toBeInTheDocument();
  });

  it('T10: with reduced motion the watch step jumps straight to the result', () => {
    vi.useFakeTimers();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      render(<LessonPage />);
      playTo('watch');
      expect(stepHeading('result')).toBeInTheDocument();
      expect(screen.queryByText(en['lesson.game.watch.running'])).toBeNull();
      const expected = runRound(7, 'inTurn', DEFAULT_CONFIG);
      expect(
        screen.getByText(
          `${en['lesson.game.walkedOut']}: ${expected.walkedOut}`,
        ),
      ).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it('Extra: without reduced motion the watch step is a visible fast forward', () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    playTo('choose');
    press(en['lesson.game.counter1']);
    press(en['lesson.game.choose.watch']);
    expect(
      screen.getByText(en['lesson.game.watch.running']),
    ).toBeInTheDocument();
    advance(3_000);
    expect(stepHeading('watch')).toBeInTheDocument();
    advance(3_500);
    expect(stepHeading('result')).toBeInTheDocument();
  });

  it('Extra: choosing a rule works with the keyboard', async () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    playTo('choose');
    // The choose step has no timer, so real timers are safe for user-event.
    vi.useRealTimers();
    const user = userEvent.setup();
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

  it('Extra: the event result sits beside the normal result', () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    playTo('eventResult');
    const normal = runRound(7, 'inTurn', DEFAULT_CONFIG);
    const rush = runRound(7, 'leastWork', TAKEOUT_RUSH_CONFIG);
    const [first, second] = screen.getAllByRole('table');
    const walked = en['lesson.game.walkedOut'];
    expect(first!.parentElement).toHaveTextContent(
      `${walked}: ${normal.walkedOut}`,
    );
    expect(second!.parentElement).toHaveTextContent(
      `${walked}: ${rush.walkedOut}`,
    );
  });

  it('Extra: the arrival speed control changes how many customers arrive', () => {
    const waitingCount = () => {
      const box = screen.getByText(
        en['lesson.game.waitingSpot'],
      ).parentElement!;
      const items = within(box).queryAllByRole('listitem');
      const more = items.find((li) =>
        li.textContent!.includes(en['lesson.game.more']),
      );
      return more
        ? items.length - 1 + Number(more.textContent!.match(/\+(\d+)/)![1])
        : items.length;
    };
    const run = (speed: 'slow' | 'fast') => {
      vi.useFakeTimers();
      const view = render(<LessonPage />);
      press(en['lesson.game.start']);
      const button = screen.getByRole('button', {
        name: en[`lesson.game.speed.${speed}`],
      });
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
      advance(7_000);
      const count = waitingCount();
      view.unmount();
      vi.useRealTimers();
      return count;
    };
    expect(run('fast')).toBeGreaterThan(run('slow'));
  });

  it('Extra: start again returns to the first step', () => {
    vi.useFakeTimers();
    render(<LessonPage />);
    playTo('result');
    press(en['lesson.game.restart']);
    expect(screen.getByText(en['lesson.game.intro'])).toBeInTheDocument();
    press(en['lesson.game.start']);
    expect(stepHeading('byHand')).toBeInTheDocument();
  });
});
