import { fireEvent, render, screen, within } from '@testing-library/react';
import zh from '@/content/locales/zh-TW.json';
import MessageQueueSimulation from '@/features/simulation/MessageQueueSimulation';
import QueueExtremePanel from '@/features/simulation/QueueExtremePanel';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

const step = (times = 1) => {
  for (let i = 0; i < times; i += 1)
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
};
const stat = (label: string) =>
  Number(
    within(screen.getByLabelText('Stats')).getByText(label).nextElementSibling!
      .textContent,
  );

describe('message queue panels', () => {
  it('T2: section 3 starts at tick 0 and Step moves to tick 1', () => {
    render(<MessageQueueSimulation />);
    expect(screen.getByText('Tick 0 of 300')).toBeInTheDocument();
    step();
    expect(screen.getByText('Tick 1 of 300')).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
  });

  it('T3: the timeout-shorter preset causes redeliveries', () => {
    render(<QueueExtremePanel />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Visibility timeout shorter than processing',
      }),
    );
    expect(screen.getByLabelText('Visibility timeout (ticks)')).toHaveValue(3);
    expect(screen.getByLabelText('Idempotency on')).not.toBeChecked();
    step(100);
    expect(stat('Redeliveries')).toBeGreaterThan(0);
  });

  it('T4: turning idempotency on leaves no duplicate side effects', () => {
    render(<QueueExtremePanel />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Visibility timeout shorter than processing',
      }),
    );
    fireEvent.click(screen.getByLabelText('Idempotency on'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    step(100);
    expect(stat('Redeliveries')).toBeGreaterThan(0);
    expect(stat('Duplicate side effects')).toBe(0);
  });

  it('T5: the poison message preset ends in the dead-letter queue', () => {
    render(<QueueExtremePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Poison message' }));
    step(120);
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
    expect(screen.getByText('Tick 3 of 300')).toBeInTheDocument();
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
