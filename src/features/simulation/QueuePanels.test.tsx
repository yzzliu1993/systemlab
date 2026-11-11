import { act, fireEvent, render, screen, within } from '@testing-library/react';
import zh from '@/content/locales/zh-TW.json';
import MessageQueueSimulation from '@/features/simulation/MessageQueueSimulation';
import QueueExtremePanel from '@/features/simulation/QueueExtremePanel';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

const step = (times = 1) => {
  for (let i = 0; i < times; i += 1)
    fireEvent.click(screen.getByRole('button', { name: 'One step forward' }));
};
// Jumps forward by playing under fake timers: one render for many ticks.
const jump = (ticks: number) => {
  vi.useFakeTimers();
  try {
    fireEvent.click(screen.getByRole('button', { name: '▶ Start' }));
    act(() => {
      vi.advanceTimersByTime(ticks * 100);
    });
    fireEvent.click(screen.getByRole('button', { name: '⏸ Pause' }));
  } finally {
    vi.useRealTimers();
  }
};
const stat = (label: string) =>
  Number(
    within(screen.getByLabelText('Stats')).getByText(label).nextElementSibling!
      .textContent,
  );

describe('message queue panels', () => {
  it('T2: section 3 starts at tick 0 and Step moves to tick 1', () => {
    render(<MessageQueueSimulation />);
    expect(screen.getByText('Time: 0 / 300')).toBeInTheDocument();
    step();
    expect(screen.getByText('Time: 1 / 300')).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
  });

  it('T3: the timeout-shorter preset causes redeliveries', () => {
    render(<QueueExtremePanel />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Timeout shorter than processing',
      }),
    );
    expect(screen.getByLabelText('Visibility timeout (ticks)')).toHaveValue(3);
    expect(screen.getByLabelText('Idempotency on')).not.toBeChecked();
    jump(100);
    expect(stat('Redeliveries')).toBeGreaterThan(0);
  });

  it('T4: turning idempotency on leaves no duplicate side effects', () => {
    render(<QueueExtremePanel />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Timeout shorter than processing',
      }),
    );
    fireEvent.click(screen.getByLabelText('Idempotency on'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    jump(100);
    expect(stat('Redeliveries')).toBeGreaterThan(0);
    expect(stat('Duplicate side effects')).toBe(0);
  });

  it('T5: the poison message preset ends in the dead-letter queue', () => {
    render(<QueueExtremePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Poison message' }));
    jump(120);
    expect(stat('Dead-lettered')).toBeGreaterThanOrEqual(1);
  });

  it('T6: 0 consumers shows a message and leaves the run unchanged', () => {
    render(<QueueExtremePanel />);
    step(3);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Consumers' }), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Time: 3 / 300')).toBeInTheDocument();
  });

  it('T6: a cost typed back to the preset value is applied after another cost', () => {
    const processedAfterPreset = () => {
      const view = render(<QueueExtremePanel />);
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Timeout shorter than processing',
        }),
      );
      return view;
    };
    const setCost = (value: string) => {
      fireEvent.change(
        screen.getByRole('spinbutton', { name: 'Processing cost (ticks)' }),
        { target: { value } },
      );
      fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    };
    const first = processedAfterPreset();
    jump(100);
    const expected = stat('Processed');
    first.unmount();

    processedAfterPreset();
    const original = (
      screen.getByRole('spinbutton', {
        name: 'Processing cost (ticks)',
      }) as HTMLInputElement
    ).value;
    setCost('1');
    setCost(original);
    jump(100);
    expect(stat('Processed')).toBe(expected);
  });

  it('T7: zh-TW labels are used', () => {
    useLanguage.setState({ language: 'zh-TW' });
    render(<QueueExtremePanel />);
    expect(
      screen.getByRole('button', { name: zh['sim.mq.preset.poisonMessage'] }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(zh['sim.mq.settings.timeout']),
    ).toBeInTheDocument();
    expect(screen.getByText(zh['sim.mq.stats.backlog'])).toBeInTheDocument();
    expect(
      screen.getByText(zh['sim.mq.stats.deadLettered']),
    ).toBeInTheDocument();
  });
});
