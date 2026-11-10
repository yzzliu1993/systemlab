import { fireEvent, render, screen, within } from '@testing-library/react';
import enChapter from '@/content/chapters/consistent-hashing/en.md?raw';
import zhChapter from '@/content/chapters/consistent-hashing/zh-TW.md?raw';
import en from '@/content/locales/en.json';
import zh from '@/content/locales/zh-TW.json';
import HashingExtremePanel from '@/features/simulation/HashingExtremePanel';
import HashingSimulation from '@/features/simulation/HashingSimulation';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

const stat = (label: string) =>
  within(screen.getByLabelText('Stats')).getByText(label).nextElementSibling!
    .textContent!;
const pick = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
const number = (text: string) => parseFloat(text);

describe('HashingSimulation', () => {
  it('T2: adding a node moves a larger share with modulo hashing than with the ring', () => {
    const moved = (rule: string) => {
      const { unmount } = render(<HashingSimulation />);
      pick('Rule', rule);
      click('Add node');
      const share = number(stat('Share of keys moved'));
      expect(screen.getByText(/Node n4 was added\./)).toBeInTheDocument();
      unmount();
      return share;
    };
    const modulo = moved('modulo');
    const ring = moved('ring');
    expect(modulo).toBeGreaterThan(ring);
    expect(modulo).toBeGreaterThan(50);
  });

  it('T3: raising virtual nodes from 1 to 100 lowers the key imbalance', () => {
    render(<HashingSimulation />);
    pick('Virtual nodes per node', '1');
    const few = number(stat('Key imbalance (largest node divided by average)'));
    pick('Virtual nodes per node', '100');
    const many = number(
      stat('Key imbalance (largest node divided by average)'),
    );
    expect(many).toBeLessThan(few);
  });

  it('removing a node shows where its keys went', () => {
    render(<HashingSimulation />);
    pick('Node to remove', 'n1');
    click('Remove node');
    expect(screen.getByText(/Node n1 was removed\./)).toBeInTheDocument();
    expect(screen.getByText(/Keys of n1 went to:/)).toBeInTheDocument();
    expect(screen.queryByLabelText('n1')).toBeNull();
  });

  it('T4: with one node left, Remove node shows a message and changes nothing', () => {
    render(<HashingSimulation />);
    for (let i = 0; i < 3; i += 1) click('Remove node');
    const before = screen.getByLabelText('n3').textContent;
    expect(screen.queryByRole('alert')).toBeNull();
    click('Remove node');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The last node cannot be removed. Nothing changed.',
    );
    expect(screen.getByLabelText('n3').textContent).toBe(before);
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  it('labels every node on the ring and has no score or countdown wording', () => {
    render(<HashingSimulation />);
    const ring = screen.getByRole('img');
    for (const id of ['n0', 'n1', 'n2', 'n3']) {
      expect(within(ring).getByText(id)).toBeInTheDocument();
    }
    expect(screen.queryByText(/score|win|timer|countdown/i)).toBeNull();
  });
});

describe('HashingExtremePanel', () => {
  it('each preset sets its values and stays editable', () => {
    render(<HashingExtremePanel />);
    click('No virtual nodes');
    const vnodes = screen.getByLabelText('Virtual nodes per node');
    expect(vnodes).toHaveValue(1);
    fireEvent.change(vnodes, { target: { value: '5' } });
    expect(vnodes).toHaveValue(5);

    click('Hot key');
    expect(
      screen.getByLabelText('Share of requests to the hot key (0 to 1)'),
    ).toHaveValue(0.3);

    click('Remove a node');
    expect(screen.getByLabelText('Number of nodes')).toHaveValue(5);
    expect(screen.getByLabelText('Node to remove')).toHaveValue('n2');
    expect(screen.getByText(/Node n2 was removed\./)).toBeInTheDocument();

    click('Add a node');
    expect(screen.getByLabelText('Node change')).toHaveValue('add');
    expect(screen.getByText(/Node n4 was added\./)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Number of keys'), {
      target: { value: '500' },
    });
    click('Apply settings');
    expect(screen.getByText(/of 500 keys moved/)).toBeInTheDocument();
  });

  it('refuses invalid settings with a message', () => {
    render(<HashingExtremePanel />);
    fireEvent.change(screen.getByLabelText('Number of keys'), {
      target: { value: '0' },
    });
    click('Apply settings');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The number of keys must be a whole number from 1 to 10000.',
    );
  });
});

describe('hashing labels', () => {
  it('T5: zh-TW shows the agreed terms', () => {
    useLanguage.setState({ language: 'zh-TW' });
    render(<HashingExtremePanel />);
    const presets = within(screen.getByRole('group', { name: '預設情境' }));
    for (const name of ['新增節點', '移除節點', '沒有虛擬節點', '熱點鍵']) {
      expect(presets.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('每個節點的虛擬節點數')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: '取模雜湊' }),
    ).toBeInTheDocument();
    expect(Object.keys(zh).filter((k) => k.startsWith('sim.ch.'))).toEqual(
      Object.keys(en).filter((k) => k.startsWith('sim.ch.')),
    );
  });

  const presetKeys = ['addNode', 'removeNode', 'noVirtualNodes', 'hotKey'];
  const strategyKeys = ['modulo', 'ring', 'rendezvous'];
  const section = (raw: string, name: string) =>
    raw.split(/^## /m).find((s) => s.startsWith(`@${name}`)) ?? '';
  const headings = (raw: string) =>
    [...section(raw, 'terms').matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
  const bullets = (raw: string) =>
    [...section(raw, 'extreme').matchAll(/^- ([^:：]+)[:：]/gm)].map((m) =>
      m[1].trim(),
    );

  it('en: preset and strategy labels use the chapter wording', () => {
    const locale = en as Record<string, string>;
    for (const key of presetKeys) {
      expect(bullets(enChapter)).toContain(locale[`sim.ch.preset.${key}`]);
    }
    for (const key of strategyKeys) {
      expect(headings(enChapter)).toContain(locale[`sim.ch.strategy.${key}`]);
    }
    expect(section(enChapter, 'how')).toContain(
      locale['sim.ch.add'].toLowerCase(),
    );
    expect(section(enChapter, 'how')).toContain(
      locale['sim.ch.remove'].toLowerCase(),
    );
  });

  it('zh-TW: preset and strategy labels use the chapter wording', () => {
    const locale = zh as Record<string, string>;
    for (const key of presetKeys) {
      expect(bullets(zhChapter)).toContain(locale[`sim.ch.preset.${key}`]);
    }
    for (const key of strategyKeys) {
      const heading = headings(zhChapter);
      expect(heading).toContain(locale[`sim.ch.strategy.${key}`]);
    }
    expect(section(zhChapter, 'how')).toContain(locale['sim.ch.add']);
    expect(section(zhChapter, 'how')).toContain(locale['sim.ch.remove']);
    expect(section(zhChapter, 'how')).toContain(locale['sim.ch.virtualNodes']);
  });
});
