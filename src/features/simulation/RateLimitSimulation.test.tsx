import { fireEvent, render, screen, within } from '@testing-library/react';
import enChapter from '@/content/chapters/rate-limiting/en.md?raw';
import zhChapter from '@/content/chapters/rate-limiting/zh-TW.md?raw';
import en from '@/content/locales/en.json';
import zh from '@/content/locales/zh-TW.json';
import RateLimitExtremePanel from '@/features/simulation/RateLimitExtremePanel';
import RateLimitSimulation from '@/features/simulation/RateLimitSimulation';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
const step = (times = 1) => {
  for (let i = 0; i < times; i += 1) click('One step forward');
};
const stat = (label: string) =>
  Number(
    within(screen.getByLabelText('Rate limit stats')).getByText(label)
      .nextElementSibling!.textContent,
  );

describe('RateLimitSimulation', () => {
  it('T2: Step moves tick 0 to tick 1 and shows accepted and rejected counts', () => {
    render(<RateLimitSimulation />);
    expect(screen.getByText(/Time: 0 \//)).toBeInTheDocument();
    expect(stat('Accepted')).toBe(0);
    step();
    expect(screen.getByText(/Time: 1 \//)).toBeInTheDocument();
    expect(stat('Accepted')).toBeGreaterThan(0);
    expect(stat(en['sim.rl.stats.rejected'])).toBe(0);
  });

  it('T2: Reset returns to tick 0', () => {
    render(<RateLimitSimulation />);
    step(5);
    click('Start over');
    expect(screen.getByText(/Time: 0 \//)).toBeInTheDocument();
  });

  it('has no score, win, lose or countdown wording', () => {
    const { container } = render(<RateLimitSimulation />);
    step(30);
    expect(container.textContent).not.toMatch(
      /score|\bwin\b|\bwon\b|lose|\blost\b|countdown/i,
    );
  });
});

describe('RateLimitExtremePanel', () => {
  it('each preset sets its values and stays editable', () => {
    render(<RateLimitExtremePanel />);
    click('Burst bigger than the bucket');
    expect(screen.getByLabelText('Bucket size (tokens)')).toHaveValue(10);
    expect(screen.getByLabelText('Number of clients')).toHaveValue(2);
    click('Retry storm');
    expect(screen.getByLabelText('Limiter algorithm')).toHaveValue(
      'fixedWindow',
    );
    expect(screen.getByLabelText('Retry mode')).toHaveValue('immediate');
    fireEvent.change(screen.getByLabelText('Requests allowed per window'), {
      target: { value: '30' },
    });
    click('Apply settings');
    expect(screen.getByLabelText('Requests allowed per window')).toHaveValue(
      30,
    );
  });

  it('T3: in the retry storm preset, backoff gives fewer retries than immediate retries', () => {
    render(<RateLimitExtremePanel />);
    click('Retry storm');
    step(100);
    const immediate = stat('Retries');
    fireEvent.change(screen.getByLabelText('Retry mode'), {
      target: { value: 'backoff' },
    });
    click('Apply settings');
    expect(screen.getByText(/Time: 0 \//)).toBeInTheDocument();
    step(100);
    const backoff = stat('Retries');
    expect(immediate).toBeGreaterThan(0);
    expect(backoff).toBeLessThan(immediate);
  });

  it('T4: with per-client limits, quiet clients are accepted as often as they send', () => {
    render(<RateLimitExtremePanel />);
    click('Noisy client');
    expect(
      screen.getByText('Noisy client', { selector: 'p' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Limit applies'), {
      target: { value: 'perClient' },
    });
    click('Apply settings');
    step(50);
    for (const n of [2, 3, 4]) {
      const client = within(
        screen.getByRole('region', { name: `Client ${n}` }),
      );
      const sent = Number(
        /(\d+)/.exec(client.getByText(/First attempts/).textContent!)![1],
      );
      const accepted = Number(
        /(\d+)/.exec(client.getByText(/Accepted/).textContent!)![1],
      );
      expect(sent).toBeGreaterThan(0);
      expect(accepted).toBeGreaterThanOrEqual(sent - 1);
    }
  });

  it('T5: 0 clients shows a message and leaves the run unchanged', () => {
    render(<RateLimitExtremePanel />);
    step(3);
    fireEvent.change(screen.getByLabelText('Number of clients'), {
      target: { value: '0' },
    });
    click('Apply settings');
    expect(screen.getByRole('alert')).toHaveTextContent(
      en['sim.rl.error.clients'],
    );
    expect(screen.getByText(/Time: 3 \//)).toBeInTheDocument();
  });
});

describe('rate limiting labels', () => {
  it('T6: in zh-TW the labels are Traditional Chinese', () => {
    useLanguage.setState({ language: 'zh-TW' });
    render(<RateLimitExtremePanel />);
    expect(
      screen.getByLabelText(zh['sim.rl.algorithm.label']),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: zh['sim.rl.algorithm.tokenBucket'] }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: zh['sim.rl.preset.retryStorm'] }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: zh['sim.step'] }),
    ).toBeInTheDocument();
    expect(screen.queryByText(en['sim.rl.stats.sent'])).not.toBeInTheDocument();
  });

  it('T6: zh-TW preset and algorithm names match the chapter wording', () => {
    const extreme = zhChapter.slice(zhChapter.indexOf('## @extreme'));
    const terms = zhChapter.slice(
      zhChapter.indexOf('## @terms'),
      zhChapter.indexOf('## @how'),
    );
    for (const key of [
      'burstBiggerThanBucket',
      'noisyClient',
      'retryStorm',
      'loadShedding',
    ] as const) {
      expect(extreme).toContain(zh[`sim.rl.preset.${key}`]);
    }
    for (const key of ['tokenBucket', 'leakyBucket', 'fixedWindow'] as const) {
      expect(terms).toContain(`### ${zh[`sim.rl.algorithm.${key}`]}（`);
    }
    expect(terms).toContain(`### ${zh['sim.rl.retry.backoff']}（`);
    expect(zh['sim.rl.stats.rejected']).toContain('429 請求過多');
  });

  it('T6: en preset and algorithm names match the chapter wording', () => {
    const extreme = enChapter.slice(enChapter.indexOf('## @extreme'));
    const terms = enChapter.slice(
      enChapter.indexOf('## @terms'),
      enChapter.indexOf('## @how'),
    );
    for (const key of [
      'burstBiggerThanBucket',
      'noisyClient',
      'retryStorm',
      'loadShedding',
    ] as const) {
      expect(extreme).toContain(en[`sim.rl.preset.${key}`]);
    }
    for (const key of ['tokenBucket', 'leakyBucket', 'fixedWindow'] as const) {
      expect(terms).toContain(`### ${en[`sim.rl.algorithm.${key}`]}`);
    }
    expect(terms).toContain(`### ${en['sim.rl.retry.backoff']}`);
    expect(en['sim.rl.stats.rejected']).toContain('429 Too Many Requests');
  });

  it('T6: both locales define the same sim.rl keys', () => {
    const keys = (d: Record<string, string>) =>
      Object.keys(d)
        .filter((k) => k.startsWith('sim.rl.'))
        .sort();
    expect(keys(zh)).toEqual(keys(en));
  });
});
