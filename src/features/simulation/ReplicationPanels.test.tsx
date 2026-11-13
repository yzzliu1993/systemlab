import { fireEvent, render, screen, within } from '@testing-library/react';
import enChapter from '@/content/chapters/replication/en.md?raw';
import zhChapter from '@/content/chapters/replication/zh-TW.md?raw';
import en from '@/content/locales/en.json';
import zh from '@/content/locales/zh-TW.json';
import ReplicationExtremePanel from '@/features/simulation/ReplicationExtremePanel';
import ReplicationSimulation from '@/features/simulation/ReplicationSimulation';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

const step = (times = 1) => {
  for (let i = 0; i < times; i += 1)
    fireEvent.click(screen.getByRole('button', { name: 'One step forward' }));
};
const stat = (label: string) =>
  Number(
    within(screen.getByLabelText('Stats')).getByText(label).nextElementSibling!
      .textContent,
  );
const preset = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('replication panels', () => {
  it('T2: read-your-own-writes on the lagging follower preset gives 0 stale reads', () => {
    render(<ReplicationExtremePanel />);
    preset('Lagging follower');
    step(100);
    expect(stat('Stale reads')).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Read routing'), {
      target: { value: 'readYourOwnWrites' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    step(100);
    expect(stat('Stale reads')).toBe(0);
  });

  it('T3: the async leader failure loses writes and the sync one does not', () => {
    const { unmount } = render(<ReplicationExtremePanel />);
    preset('Leader fails (async)');
    step(130);
    expect(stat('Lost writes')).toBeGreaterThan(0);
    expect(
      screen.getByText(/client whose last acknowledged write was lost/),
    ).toBeInTheDocument();
    unmount();
    render(<ReplicationExtremePanel />);
    preset('Leader fails (sync)');
    step(130);
    expect(stat('Lost writes')).toBe(0);
    expect(stat('Writes refused')).toBeGreaterThan(0);
  });

  it('T3: the network partition preset shows a cut off follower and conflicts', () => {
    render(<ReplicationExtremePanel />);
    preset('Network partition');
    step(150);
    expect(screen.getAllByText('Cut off').length).toBeGreaterThan(0);
    expect(stat('Conflicts')).toBeGreaterThan(0);
  });

  it('T5: K above followers shows a message and leaves the run unchanged', () => {
    render(<ReplicationExtremePanel />);
    preset('Leader fails (sync)');
    step(3);
    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: 'Followers that must confirm (K)',
      }),
      { target: { value: '5' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'between 1 and 3 Followers',
    );
    expect(screen.getByText('Time: 3 / 300')).toBeInTheDocument();
  });

  it('T5: a lag list that does not match the followers is refused', () => {
    render(<ReplicationExtremePanel />);
    step(2);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Followers' }), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Time: 2 / 300')).toBeInTheDocument();
  });

  it('section 3 shows the leader and followers with states and a live summary', () => {
    render(<ReplicationSimulation />);
    step(5);
    const nodes = within(
      screen.getByRole('list', { name: 'Leader and followers' }),
    );
    expect(nodes.getByText('Leader')).toBeInTheDocument();
    expect(nodes.getAllByText('Follower')).toHaveLength(3);
    expect(nodes.getAllByText(/Writes behind/)).toHaveLength(3);
    expect(screen.getByText(/^Tick 5\./)).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(
      screen.getByText(
        'Let writes keep arriving and watch how far the followers keep up',
      ),
    ).toBeInTheDocument();
  });

  it('section 3 offers K only in synchronous mode', () => {
    render(<ReplicationSimulation />);
    expect(
      screen.queryByLabelText('Followers that must confirm (K)'),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText('Replication mode'), {
      target: { value: 'sync' },
    });
    expect(
      screen.getByLabelText('Followers that must confirm (K)'),
    ).toBeInTheDocument();
  });
});

const section = (raw: string, name: string) =>
  raw.split(/^## /m).find((s) => s.startsWith(`@${name}`)) ?? '';
const headings = (raw: string) =>
  [...section(raw, 'terms').matchAll(/^### (.+)$/gm)].map((m) => m[1]!.trim());
const bullets = (raw: string) =>
  [...section(raw, 'extreme').matchAll(/^- [「"]([^」"]+)[」"][:：]/gm)].map(
    (m) => m[1]!.trim(),
  );

const presetKeys = [
  'laggingFollower',
  'leaderFailsAsync',
  'leaderFailsSync',
  'networkPartition',
];

describe('replication labels follow the chapter', () => {
  it('T4: en preset, mode and routing labels use the chapter wording', () => {
    const locale = en as Record<string, string>;
    for (const key of presetKeys) {
      expect(bullets(enChapter)).toContain(locale[`sim.repl.preset.${key}`]);
    }
    expect(headings(enChapter)).toContain(locale['sim.repl.mode.async']);
    expect(headings(enChapter)).toContain(locale['sim.repl.mode.sync']);
    expect(headings(enChapter)).toContain(
      locale['sim.repl.routing.readYourOwnWrites'],
    );
    expect(headings(enChapter)).toContain(locale['sim.repl.node.leader']);
    expect(headings(enChapter)).toContain(locale['sim.repl.node.follower']);
    const how = section(enChapter, 'how').toLowerCase();
    expect(how).toContain(locale['sim.repl.routing.leader']!.toLowerCase());
    expect(how).toContain(
      locale['sim.repl.routing.anyFollower']!.toLowerCase(),
    );
    for (const key of ['acked', 'stale', 'lost', 'conflicts']) {
      expect(how).toContain(locale[`sim.repl.stats.${key}`]!.toLowerCase());
    }
  });

  it('T4: zh-TW preset, mode and routing labels use the chapter wording', () => {
    const locale = zh as Record<string, string>;
    for (const key of presetKeys) {
      expect(bullets(zhChapter)).toContain(locale[`sim.repl.preset.${key}`]);
    }
    expect(headings(zhChapter)).toContain(locale['sim.repl.mode.async']);
    expect(headings(zhChapter)).toContain(locale['sim.repl.mode.sync']);
    expect(headings(zhChapter)).toContain(
      locale['sim.repl.routing.readYourOwnWrites'],
    );
    expect(headings(zhChapter)).toContain(locale['sim.repl.node.leader']);
    expect(headings(zhChapter)).toContain(locale['sim.repl.node.follower']);
    const how = section(zhChapter, 'how');
    expect(how).toContain(locale['sim.repl.routing.leader']);
    expect(how).toContain(locale['sim.repl.routing.anyFollower']);
    for (const key of ['acked', 'stale', 'lost', 'conflicts']) {
      expect(how).toContain(locale[`sim.repl.stats.${key}`]);
    }
    expect(section(zhChapter, 'extreme')).toContain('升級');
  });

  it('T4: zh-TW renders the preset buttons', () => {
    useLanguage.setState({ language: 'zh-TW' });
    render(<ReplicationExtremePanel />);
    const presets = within(screen.getByRole('group', { name: '預設情境' }));
    for (const name of [
      '落後的從節點',
      '主節點故障（非同步）',
      '主節點故障（同步）',
      '網路分割',
    ]) {
      expect(presets.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});
