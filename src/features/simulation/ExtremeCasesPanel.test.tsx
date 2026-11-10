import { fireEvent, render, screen, within } from '@testing-library/react';
import zh from '@/content/locales/zh-TW.json';
import ExtremeCasesPanel from '@/features/simulation/ExtremeCasesPanel';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

const step = (times = 1) => {
  for (let i = 0; i < times; i += 1)
    fireEvent.click(screen.getByRole('button', { name: 'One step forward' }));
};
const preset = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole('button', { name }));
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const statIn = (root: HTMLElement, label: string) =>
  Number(within(root).getByText(label).nextElementSibling!.textContent);

describe('ExtremeCasesPanel', () => {
  it('has the four presets by name', () => {
    render(<ExtremeCasesPanel />);
    for (const name of [
      'Heavy traffic',
      'One slow server',
      'Mixed request costs (many small, a few huge)',
      'One server goes down',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('T4: One slow server lowers one speed and the controls stay editable', () => {
    render(<ExtremeCasesPanel />);
    preset('One slow server');
    expect(screen.getByLabelText('Server 3 speed')).toHaveValue(0.5);
    expect(screen.getByLabelText('Server 1 speed')).toHaveValue(3);
    type('Server 3 speed', '1.5');
    expect(screen.getByLabelText('Server 3 speed')).toHaveValue(1.5);
    type('Arrival multiplier', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    expect(screen.getByLabelText('Arrival multiplier')).toHaveValue(2);
    expect(screen.getByText('Speed 1.5, Weight 0.5')).toBeInTheDocument();
  });

  it('T5: One server goes down shows it down with failed requests', () => {
    render(<ExtremeCasesPanel />);
    preset('One server goes down');
    step(150);
    expect(screen.queryByText('Down')).not.toBeInTheDocument();
    step(100);
    const first = screen.getByRole('region', { name: 'Server 1' });
    expect(within(first).getByText('Down')).toBeInTheDocument();
    const stats = screen.getByLabelText('Stats');
    expect(statIn(stats, 'Failed')).toBeGreaterThan(0);
  });

  it('T6: with 1 server all load goes to it without error', () => {
    render(<ExtremeCasesPanel />);
    type('Number of servers', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    expect(screen.getAllByRole('region', { name: /^Server \d$/ })).toHaveLength(
      1,
    );
    step(60);
    const stats = screen.getByLabelText('Stats');
    const server = screen.getByRole('region', { name: 'Server 1' });
    const queue = Number(/Queue: (\d+)/.exec(server.textContent!)![1]);
    const active = Number(
      /Active requests: (\d+)/.exec(server.textContent!)![1],
    );
    expect(statIn(stats, 'Arrived')).toBeGreaterThan(0);
    expect(statIn(stats, 'Arrived')).toBe(
      statIn(stats, 'Finished') + queue + active,
    );
  });

  it('T7: entering 0 servers shows a message and leaves the run unchanged', () => {
    render(<ExtremeCasesPanel />);
    step(5);
    type('Number of servers', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Use a whole number of servers from 1 to 10.',
    );
    expect(screen.getByText(/Time: 5 \//)).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: /^Server \d$/ })).toHaveLength(
      3,
    );
    type('Number of servers', '3');
    type('Arrival multiplier', '-1');
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/multiplier/);
    expect(screen.getByText(/Time: 5 \//)).toBeInTheDocument();
  });

  it('T8: compare view with the mixed costs preset shows two panels with the same arrivals', () => {
    render(<ExtremeCasesPanel />);
    preset(/Mixed request costs/);
    fireEvent.click(
      screen.getByRole('button', { name: 'Compare two algorithms' }),
    );
    const panels = screen.getAllByRole('region', { name: /run$/ });
    expect(panels).toHaveLength(2);
    const compare = screen.getByRole('region', {
      name: 'Same arrivals, two algorithms',
    });
    fireEvent.click(
      within(compare).getByRole('button', { name: 'One step forward' }),
    );
    for (let i = 0; i < 80; i += 1)
      fireEvent.click(
        within(compare).getByRole('button', { name: 'One step forward' }),
      );
    const [a, b] = panels.map((p) => statIn(p, 'Arrived'));
    expect(a).toBeGreaterThan(0);
    expect(a).toBe(b);
  });

  it('T9: the text has no score, win, lose or countdown wording', () => {
    const { container } = render(<ExtremeCasesPanel />);
    for (const name of [/Heavy/, /slow/, /Mixed/, /goes down/]) {
      preset(name);
      step(10);
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'Compare two algorithms' }),
    );
    expect(container.textContent).not.toMatch(
      /score|\bwin|\bwon\b|lose|\blost\b|countdown|walked/i,
    );
  });

  it('T10: in zh-TW the labels are Traditional Chinese', () => {
    useLanguage.setState({ language: 'zh-TW' });
    render(<ExtremeCasesPanel />);
    for (const key of [
      'sim.preset.heavy',
      'sim.preset.slow',
      'sim.preset.mixed',
      'sim.preset.down',
      'sim.settings.apply',
    ] as const) {
      expect(screen.getByRole('button', { name: zh[key] })).toBeInTheDocument();
    }
    expect(
      screen.getByLabelText(zh['sim.settings.servers']),
    ).toBeInTheDocument();
    expect(screen.queryByText('Heavy traffic')).not.toBeInTheDocument();
  });
});
