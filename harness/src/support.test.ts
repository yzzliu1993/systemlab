import path from 'node:path';
import { loadConfig } from './config';
import { logFileFor, truncate } from './log';
import { renderTemplate } from './prompts';

describe('logFileFor', () => {
  it('以本機日期命名', () => {
    expect(logFileFor(new Date(2026, 10, 4, 23, 59), '/logs')).toBe(path.join('/logs', '2026-11-04.jsonl'));
  });
});

describe('truncate', () => {
  it('過長時保留尾端', () => {
    const out = truncate('abcdef', 3);
    expect(out.endsWith('def')).toBe(true);
    expect(out).toContain('截斷 3 字');
  });

  it('未超過長度時原樣回傳', () => {
    expect(truncate('abc', 3)).toBe('abc');
  });
});

describe('renderTemplate', () => {
  it('取代變數，未提供的變數換成空字串', () => {
    expect(renderTemplate('{{a}}-{{b}}-{{missing}}', { a: 'x', b: 2 })).toBe('x-2-');
  });
});

describe('loadConfig', () => {
  it('repo 內的 harness.config.json 符合 schema', () => {
    expect(loadConfig().repo).toBe('yzzliu1993/systemlab');
  });
});
