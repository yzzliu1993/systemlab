import { fireEvent, render, screen } from '@testing-library/react';
import * as hashing from '@/domain/simulation/consistentHashing';
import en from '@/content/locales/en.json';
import zh from '@/content/locales/zh-TW.json';
import HashingSimulation from '@/features/simulation/HashingSimulation';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

function fillToTwentyNodes() {
  render(<HashingSimulation />);
  // One virtual node per node keeps each re-render small.
  fireEvent.change(screen.getByLabelText('Virtual nodes per node'), {
    target: { value: '1' },
  });
  const add = screen.getByRole('button', { name: 'Add node' });
  for (let i = 0; i < 16; i++) fireEvent.click(add);
}

describe('hashing ring performance and limits', () => {
  it('T1: changing the node to remove does not recompute ring positions', () => {
    render(<HashingSimulation />);
    fireEvent.change(screen.getByLabelText('Virtual nodes per node'), {
      target: { value: '10' },
    });
    const spy = vi.spyOn(hashing, 'ringPositions');
    fireEvent.change(screen.getByLabelText('Node to remove'), {
      target: { value: 'n2' },
    });
    expect(screen.getByLabelText('Node to remove')).toHaveValue('n2');
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Virtual nodes per node'), {
      target: { value: '11' },
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('T2: Add node is disabled at 20 nodes with a linked reason', () => {
    fillToTwentyNodes();
    const add = screen.getByRole('button', { name: 'Add node' });
    expect(add).toBeDisabled();
    const reason = document.getElementById(
      add.getAttribute('aria-describedby')!,
    );
    expect(reason).toHaveTextContent(/limit of 20 nodes/);
  });

  it('T3: zh-TW simulation strings use one tick word and no tick or 步', () => {
    const strings = Object.entries(zh)
      .filter(([key]) => key.startsWith('sim.'))
      // 同步 is the chapter's term for synchronous (in 非同步複製 too), not the old tick word.
      .map(([, value]) =>
        String(value)
          .replace(/\{tick\}/g, '')
          .replace(/同步/g, ''),
      );
    for (const text of strings) {
      expect(text).not.toMatch(/tick/i);
      expect(text).not.toContain('步');
    }
    expect(zh['sim.step']).toContain('格');
    expect(Object.keys(zh)).toEqual(expect.arrayContaining(Object.keys(en)));
  });
});
