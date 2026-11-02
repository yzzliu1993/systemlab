import { describe, it, expect } from 'vitest';

describe('Sanity Check: Domain Test Harness', () => {
  it('should run tests without React dependency', () => {
    const sum = (a: number, b: number) => a + b;
    expect(sum(2, 3)).toBe(5);
  });
});
