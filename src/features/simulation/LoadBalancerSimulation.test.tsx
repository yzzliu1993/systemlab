import { act, fireEvent, render, screen } from '@testing-library/react';
import en from '@/content/locales/en.json';
import zh from '@/content/locales/zh-TW.json';
import LoadBalancerSimulation from '@/features/simulation/LoadBalancerSimulation';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

afterEach(() => {
  vi.useRealTimers();
});

const step = () =>
  fireEvent.click(screen.getByRole('button', { name: 'One step forward' }));
const statsText = () => screen.getByLabelText('Stats').textContent;

describe('LoadBalancerSimulation', () => {
  it('shows an algorithm picker and 3 servers by default', () => {
    render(<LoadBalancerSimulation />);
    expect(screen.getByLabelText('Algorithm')).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: /^Server \d$/ })).toHaveLength(
      3,
    );
  });

  it('T1: clicking Step moves tick 0 to tick 1', () => {
    render(<LoadBalancerSimulation />);
    expect(screen.getByText(/Time: 0 \//)).toBeInTheDocument();
    step();
    expect(screen.getByText(/Time: 1 \//)).toBeInTheDocument();
  });

  it('T2: choosing least connections restarts at tick 0 with the same seed', () => {
    vi.useFakeTimers();
    render(<LoadBalancerSimulation />);
    fireEvent.click(screen.getByRole('button', { name: '▶ Start' }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByText(/Time: 0 \//)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Algorithm'), {
      target: { value: 'leastConnections' },
    });
    expect(screen.getByText(/Time: 0 \//)).toBeInTheDocument();
    expect(screen.getByLabelText('New set of requests')).toHaveValue(7);
  });

  it('T3: seed 7, 20 steps, reset and 20 steps gives the same stats', () => {
    render(<LoadBalancerSimulation />);
    for (let i = 0; i < 20; i += 1) step();
    const first = statsText();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByText(/Time: 0 \//)).toBeInTheDocument();
    for (let i = 0; i < 20; i += 1) step();
    expect(statsText()).toBe(first);
    expect(screen.getByText(/Time: 20 \//)).toBeInTheDocument();
  });

  it('T9: the text has no score, win, lose or countdown wording', () => {
    const { container } = render(<LoadBalancerSimulation />);
    for (let i = 0; i < 30; i += 1) step();
    expect(container.textContent).not.toMatch(
      /score|\bwin|\bwon\b|lose|\blost\b|countdown|walked/i,
    );
  });

  it('T10: in zh-TW the labels are Traditional Chinese', () => {
    useLanguage.setState({ language: 'zh-TW' });
    render(<LoadBalancerSimulation />);
    expect(
      screen.getByLabelText(zh['sim.algorithm.label']),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: zh['sim.step'] }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: zh['sim.algorithm.weightedRoundRobin'],
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(en['sim.step'])).not.toBeInTheDocument();
  });
});
