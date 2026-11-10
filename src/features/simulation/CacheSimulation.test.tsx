import { fireEvent, render, screen, within } from '@testing-library/react';
import en from '@/content/locales/en.json';
import zh from '@/content/locales/zh-TW.json';
import CacheExtremePanel from '@/features/simulation/CacheExtremePanel';
import CacheSimulation from '@/features/simulation/CacheSimulation';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

const step = (times = 1) => {
  for (let i = 0; i < times; i += 1)
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
};
const stat = (label: string) =>
  within(screen.getByLabelText('Stats')).getByText(label).nextElementSibling!
    .textContent!;
const percent = (label: string) => parseFloat(stat(label));

describe('CacheSimulation', () => {
  it('T2: starts at tick 0 and Step moves to tick 1', () => {
    render(<CacheSimulation />);
    expect(screen.getByText('Tick 0 of 400')).toBeInTheDocument();
    step();
    expect(screen.getByText('Tick 1 of 400')).toBeInTheDocument();
    expect(stat('Cache hit rate')).toMatch(/%$/);
    expect(screen.getByText(/Tick 1\. Cache hit rate/)).toBeInTheDocument();
  });

  it('Reset starts the run again from tick 0', () => {
    render(<CacheSimulation />);
    step(3);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('Tick 0 of 400')).toBeInTheDocument();
    step();
    expect(screen.getByText('Tick 1 of 400')).toBeInTheDocument();
  });
});

describe('CacheExtremePanel', () => {
  it('T3: cache restart makes the hit rate fall after the restart', () => {
    render(<CacheExtremePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Cache restart' }));
    step(199);
    const before = percent('Cache hit rate');
    step(1);
    const after = percent('Cache hit rate');
    expect(after).toBeLessThan(before);
    expect(screen.getByLabelText('Cache capacity (keys)')).toHaveValue(100);
  });

  it('T4: coalescing lowers database reads after the hot key expires', () => {
    const run = (coalescing: boolean) => {
      const { unmount } = render(<CacheExtremePanel />);
      fireEvent.click(screen.getByRole('button', { name: 'Hot key expires' }));
      const box = screen.getByLabelText('Request coalescing');
      expect(box).not.toBeChecked();
      if (coalescing) {
        fireEvent.click(box);
        fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
      }
      step(210);
      const reads = Number(stat('Database reads'));
      unmount();
      return reads;
    };
    const without = run(false);
    const withCoalescing = run(true);
    expect(withCoalescing).toBeLessThan(without);
  });

  it('T5: database capacity 0 shows a message and leaves the run unchanged', () => {
    render(<CacheExtremePanel />);
    step(5);
    fireEvent.change(
      screen.getByLabelText('Database capacity (reads per tick)'),
      {
        target: { value: '0' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply settings' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The database capacity must be a whole number, 1 or more.',
    );
    expect(screen.getByText('Tick 5 of 400')).toBeInTheDocument();
  });

  it('presets set their values and stay editable', () => {
    render(<CacheExtremePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Cache too small' }));
    const capacity = screen.getByLabelText('Cache capacity (keys)');
    expect(capacity).toHaveValue(10);
    fireEvent.change(capacity, { target: { value: '20' } });
    expect(capacity).toHaveValue(20);
    fireEvent.click(
      screen.getByRole('button', { name: 'No invalidation on write' }),
    );
    expect(screen.getByLabelText('Invalidate on write')).not.toBeChecked();
    expect(screen.getByLabelText('Writes per tick')).toHaveValue(2);
  });

  it('has no score or countdown wording', () => {
    render(<CacheExtremePanel />);
    expect(screen.queryByText(/score|win|timer|countdown/i)).toBeNull();
  });
});

describe('cache labels', () => {
  it('T6: zh-TW shows the agreed terms', () => {
    useLanguage.setState({ language: 'zh-TW' });
    render(<CacheExtremePanel />);
    expect(screen.getByText(zh['sim.cache.stats.hitRate'])).toBeInTheDocument();
    expect(
      screen.getByLabelText(zh['sim.cache.settings.coalescing']),
    ).toBeInTheDocument();
    for (const name of [
      '快取太小',
      '快取重啟',
      '熱門 key 過期',
      '寫入時不做失效',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(zh['sim.cache.stats.dbReads']).toBe('資料庫讀取次數');
    expect(zh['sim.cache.stats.staleReads']).toBe('讀到過期資料的次數');
    expect(zh['sim.cache.queue.title']).toBe('資料庫的佇列');
    expect(zh['sim.cache.stats.evictions']).toBe('淘汰次數');
    expect(zh['sim.cache.eviction.lru']).toBe('最近最少使用（LRU）');
    expect(zh['sim.cache.hot']).toBe('熱門 key');
    expect(zh['sim.cache.settings.ttl']).toContain('存活時間（TTL');
    expect(zh['sim.cache.stats.evictions']).toContain('淘汰');
    expect(zh['sim.cache.settings.invalidate']).toContain('失效');
    expect(zh['sim.cache.contents.title']).toContain('快取');
    expect(Object.keys(zh).filter((k) => k.startsWith('sim.cache.'))).toEqual(
      Object.keys(en).filter((k) => k.startsWith('sim.cache.')),
    );
  });
});
