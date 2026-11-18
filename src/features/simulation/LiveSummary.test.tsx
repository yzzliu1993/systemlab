import { act, fireEvent, render, screen } from '@testing-library/react';
import CacheSimulation from '@/features/simulation/CacheSimulation';
import LoadBalancerSimulation from '@/features/simulation/LoadBalancerSimulation';
import MessageQueueSimulation from '@/features/simulation/MessageQueueSimulation';
import RateLimitSimulation from '@/features/simulation/RateLimitSimulation';
import ReplicationSimulation from '@/features/simulation/ReplicationSimulation';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const panels = [
  ['load balancer', LoadBalancerSimulation],
  ['cache', CacheSimulation],
  ['message queue', MessageQueueSimulation],
  ['rate limit', RateLimitSimulation],
  ['replication', ReplicationSimulation],
] as const;

const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe.each(panels)('live summary of the %s panel', (_name, Panel) => {
  const live = (container: HTMLElement) =>
    container.querySelector('[aria-live="polite"]')!.textContent;
  const tickText = () =>
    screen.getAllByText(/^Time: \d+ \/ \d+/)[0]!.textContent;

  it('T2: the live region changes at most once while 10 ticks play', () => {
    const { container } = render(<Panel />);
    const start = tickText();
    const seen = [live(container)];
    click('▶ Start');
    for (let i = 0; i < 10; i += 1) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
      seen.push(live(container));
    }
    expect(tickText()).not.toBe(start);
    const changes = seen.filter((text, i) => i > 0 && text !== seen[i - 1]);
    expect(changes.length).toBeLessThanOrEqual(1);
  });

  it('T3: pressing Pause makes the live region hold the current summary', () => {
    const { container } = render(<Panel />);
    const before = live(container);
    click('▶ Start');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(live(container)).toBe(before);
    click('⏸ Pause');
    expect(live(container)).not.toBe(before);
    expect(live(container)).toContain(tickText()!.match(/\d+/)![0]);
  });

  it('T3: Step updates the live region at once', () => {
    const { container } = render(<Panel />);
    const before = live(container);
    click('One step forward');
    expect(live(container)).not.toBe(before);
  });
});
