import { render, screen } from '@testing-library/react';
import CacheSimulation from '@/features/simulation/CacheSimulation';
import { useLanguage } from '@/stores/language';
import { jump } from '@/test/jump';

beforeEach(() => {
  useLanguage.setState({ language: 'en' });
});

describe('jump', () => {
  it('T1: a jump past the end of the run stops at the end without error', () => {
    render(<CacheSimulation />);
    const total = Number(
      /\/ (\d+)/.exec(screen.getByText(/^Time:/).textContent!)![1],
    );
    jump(total - 50);
    expect(
      screen.getByText(`Time: ${total - 50} / ${total}`),
    ).toBeInTheDocument();
    expect(() => jump(100)).not.toThrow();
    expect(screen.getByText(/The run is finished\./)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`Time: ${total} / ${total}`)),
    ).toBeInTheDocument();
  });
});
