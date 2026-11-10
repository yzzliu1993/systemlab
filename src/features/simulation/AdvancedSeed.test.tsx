import { fireEvent, render, screen } from '@testing-library/react';
import en from '@/content/locales/en.json';
import ExtremeCasesPanel from '@/features/simulation/ExtremeCasesPanel';
import { useLanguage } from '@/stores/language';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

const details = () => document.querySelector('details') as HTMLDetailsElement;

describe('Advanced seed area', () => {
  it('T1: stays open after applying a new seed and shows it in the summary', () => {
    render(<ExtremeCasesPanel />);
    details().open = true;
    fireEvent.change(screen.getByLabelText(en['sim.seed.label']), {
      target: { value: '42' },
    });
    fireEvent.click(screen.getByRole('button', { name: en['sim.seed.set'] }));
    expect(details().open).toBe(true);
    expect(details().querySelector('summary')?.textContent).toContain('42');
    expect(
      (screen.getByLabelText(en['sim.seed.label']) as HTMLInputElement).value,
    ).toBe('42');
  });

  it('T2: stays closed when another preset restarts the run', () => {
    render(<ExtremeCasesPanel />);
    expect(details().open).toBe(false);
    fireEvent.click(
      screen.getByRole('button', { name: en['sim.preset.down'] }),
    );
    expect(details().open).toBe(false);
  });
});
