import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import en from '@/content/locales/en.json';
import zh from '@/content/locales/zh-TW.json';
import CacheExtremePanel from '@/features/simulation/CacheExtremePanel';
import CacheSimulation from '@/features/simulation/CacheSimulation';
import ExtremeCasesPanel from '@/features/simulation/ExtremeCasesPanel';
import HashingExtremePanel from '@/features/simulation/HashingExtremePanel';
import HashingSimulation from '@/features/simulation/HashingSimulation';
import LoadBalancerSimulation from '@/features/simulation/LoadBalancerSimulation';
import MessageQueueSimulation from '@/features/simulation/MessageQueueSimulation';
import QueueExtremePanel from '@/features/simulation/QueueExtremePanel';
import RateLimitExtremePanel from '@/features/simulation/RateLimitExtremePanel';
import RateLimitSimulation from '@/features/simulation/RateLimitSimulation';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

const catalogs = { en, 'zh-TW': zh } as const;

const described = (button: HTMLElement) => {
  const id = button.getAttribute('aria-describedby');
  expect(id).toBeTruthy();
  return document.getElementById(id!)?.textContent;
};

const chapters: [string, ComponentType[], string][] = [
  [
    'load balancing',
    [LoadBalancerSimulation, ExtremeCasesPanel],
    'sim.play.hint',
  ],
  [
    'message queue',
    [MessageQueueSimulation, QueueExtremePanel],
    'sim.mq.play.hint',
  ],
  ['caching', [CacheSimulation, CacheExtremePanel], 'sim.cache.play.hint'],
  [
    'rate limiting',
    [RateLimitSimulation, RateLimitExtremePanel],
    'sim.rl.play.hint',
  ],
];

describe('plain-language simulation controls', () => {
  it.each(['zh-TW', 'en'] as const)(
    'T1/T2: load balancing buttons and hints in %s',
    (language) => {
      useLanguage.setState({ language });
      const m = catalogs[language];
      render(<LoadBalancerSimulation />);
      const pairs = [
        ['sim.play', 'sim.play.hint'],
        ['sim.step', 'sim.step.hint'],
        ['sim.reset', 'sim.reset.hint'],
      ] as const;
      for (const [label, hint] of pairs) {
        const button = screen.getByRole('button', { name: m[label] });
        expect(described(button)).toBe(m[hint]);
      }
      fireEvent.click(screen.getByRole('button', { name: m['sim.play'] }));
      const pause = screen.getByRole('button', { name: m['sim.pause'] });
      expect(described(pause)).toBe(m['sim.pause.hint']);
    },
  );

  it('T1: the zh-TW wording is the approved text', () => {
    useLanguage.setState({ language: 'zh-TW' });
    render(<LoadBalancerSimulation />);
    expect(described(screen.getByRole('button', { name: '▶ 開始' }))).toBe(
      '讓請求持續進來，看伺服器怎麼分工',
    );
    expect(screen.getByRole('button', { name: '往前一格' })).toBeVisible();
    expect(screen.getByRole('button', { name: '從頭開始' })).toBeVisible();
  });

  it('T3: the seed input is inside a collapsed Advanced area that shows the current seed', () => {
    render(<LoadBalancerSimulation />);
    const summary = screen.getByText('Advanced (current set: 7)');
    const details = summary.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(details).toContainElement(
      screen.getByLabelText('New set of requests'),
    );
    fireEvent.click(summary);
    expect(details).toHaveAttribute('open');
  });

  it('T4: applying a new number restarts the run with that seed', () => {
    render(<LoadBalancerSimulation />);
    fireEvent.click(screen.getByRole('button', { name: 'One step forward' }));
    expect(screen.getByText(/Time: 1 \//)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Advanced (current set: 7)'));
    fireEvent.change(screen.getByLabelText('New set of requests'), {
      target: { value: '9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText(/Time: 0 \//)).toBeInTheDocument();
    expect(screen.getByText('Advanced (current set: 9)')).toBeInTheDocument();
    expect(screen.getByLabelText('New set of requests')).toHaveValue(9);
  });

  describe.each(chapters)('%s', (_name, panels, hintKey) => {
    it.each(['zh-TW', 'en'] as const)(
      'T5: no old labels in %s, and the hint names the chapter subject',
      (language) => {
        useLanguage.setState({ language });
        const m = catalogs[language];
        for (const Panel of panels) {
          const { unmount } = render(<Panel />);
          const old =
            language === 'en'
              ? ['Step', 'Play', 'Reset', 'Seed']
              : ['單步', '種子', '播放', '重設'];
          for (const name of old) {
            expect(
              screen.queryByRole('button', { name }),
            ).not.toBeInTheDocument();
          }
          expect(screen.queryByLabelText(old[3]!)).not.toBeInTheDocument();
          const start = screen.getByRole('button', { name: m['sim.play'] });
          expect(described(start)).toBe(m[hintKey as keyof typeof m]);
          expect(
            screen.getByRole('button', { name: m['sim.step'] }),
          ).toBeVisible();
          expect(
            screen.getByRole('button', { name: m['sim.reset'] }),
          ).toBeVisible();
          unmount();
        }
      },
    );
  });

  it.each(['zh-TW', 'en'] as const)(
    'T6: only load balancing mentions servers in the Play hint (%s)',
    (language) => {
      const m = catalogs[language];
      const word = language === 'en' ? /servers?/i : /伺服器/;
      for (const key of [
        'sim.mq.play.hint',
        'sim.cache.play.hint',
        'sim.rl.play.hint',
      ] as const) {
        expect(m[key]).not.toMatch(word);
      }
      useLanguage.setState({ language });
      for (const Panel of [HashingSimulation, HashingExtremePanel]) {
        const { unmount } = render(<Panel />);
        expect(
          screen.queryByRole('button', { name: m['sim.play'] }),
        ).not.toBeInTheDocument();
        unmount();
      }
    },
  );

  it('T6: the rendered Play hint of other chapters does not say servers', () => {
    for (const [name, panels] of chapters.slice(1)) {
      const Panel = panels[0]!;
      const { unmount } = render(<Panel />);
      const start = screen.getByRole('button', { name: en['sim.play'] });
      expect(described(start), name).not.toMatch(/servers?/i);
      unmount();
    }
  });
});
