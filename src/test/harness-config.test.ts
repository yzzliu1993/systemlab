import {
  checkDorHeadings,
  checkLineBudget,
  checkFrontmatter,
  checkProtectedPaths,
  checkSettings,
  countLines,
} from './harness-config';

const skills = import.meta.glob<string>('/.claude/skills/*/SKILL.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const agents = import.meta.glob<string>('/.claude/agents/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const settings = import.meta.glob<string>('/.claude/settings.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const docs = import.meta.glob<string>(
  ['/CLAUDE.md', '/specs/HARNESS_SPEC.md'],
  { query: '?raw', import: 'default', eager: true },
);

const get = (m: Record<string, string>, path: string): string => {
  const v = m[path];
  if (v === undefined) throw new Error(`missing file ${path}`);
  return v;
};

const CLAUDE_MD_LIMIT = 200;
const SKILL_LIMIT = 300;
const AGENT_LIMIT = 100;

function runAll(): string[] {
  const problems: string[] = [];
  const fm = { ...skills, ...agents };
  if (Object.keys(skills).length === 0 || Object.keys(agents).length === 0) {
    problems.push('no skill or agent files found');
  }
  for (const [f, c] of Object.entries(fm))
    problems.push(...checkFrontmatter(f, c));
  problems.push(
    ...checkSettings(
      '.claude/settings.json',
      get(settings, '/.claude/settings.json'),
    ),
  );
  const spec = get(docs, '/specs/HARNESS_SPEC.md');
  problems.push(...checkDorHeadings('specs/HARNESS_SPEC.md', spec));
  problems.push(
    ...checkDorHeadings(
      '.claude/agents/decomposer.md',
      get(agents, '/.claude/agents/decomposer.md'),
    ),
  );
  problems.push(
    ...checkProtectedPaths({
      'CLAUDE.md': get(docs, '/CLAUDE.md'),
      'specs/HARNESS_SPEC.md': spec,
      '.claude/skills/ticket/SKILL.md': get(
        skills,
        '/.claude/skills/ticket/SKILL.md',
      ),
    }),
  );
  problems.push(
    ...checkLineBudget('CLAUDE.md', get(docs, '/CLAUDE.md'), CLAUDE_MD_LIMIT),
  );
  for (const [f, c] of Object.entries(skills))
    problems.push(...checkLineBudget(f, c, SKILL_LIMIT));
  for (const [f, c] of Object.entries(agents))
    problems.push(...checkLineBudget(f, c, AGENT_LIMIT));
  return problems;
}

const validSettings = (deny: string[]) =>
  JSON.stringify({ permissions: { deny } });
const fullDeny = [
  'Bash(gh pr merge *--admin*)',
  'Bash(git push --force *)',
  'Bash(git push * --force-with-lease)',
  'Bash(git push -f *)',
  'Bash(git reset --hard *)',
];

const PATHS = [
  '.claude/',
  '.github/',
  'specs/',
  'CLAUDE.md',
  'package.json',
  'package-lock.json',
  'tsconfig*',
  'vite.config.ts',
  'vitest.config.ts',
  '.oxlintrc.json',
  '.dependency-cruiser.cjs',
];
const pathsLine = (paths: string[]) =>
  'Protected paths: ' + paths.map((p) => '`' + p + '`').join(', ') + '.';

describe('harness config', () => {
  it('T1: real repo files pass all checks', () => {
    expect(runAll()).toEqual([]);
  });

  it('T2: quoted description containing ": " passes', () => {
    const content =
      '---\nname: x\ndescription: "does this: and that"\n---\nbody';
    expect(checkFrontmatter('a.md', content)).toEqual([]);
  });

  it('T3: unquoted ": " in description names the file', () => {
    const content = '---\nname: x\ndescription: does this: and that\n---\nbody';
    const problems = checkFrontmatter('a.md', content);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('a.md');
    expect(problems[0]).toContain('description');
  });

  it('T4: invalid JSON is reported without throwing', () => {
    const problems = checkSettings('settings.json', '{ not json');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('settings.json');
  });

  it('T5: missing --admin deny rule names the rule', () => {
    const problems = checkSettings(
      'settings.json',
      validSettings(fullDeny.slice(1)),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('--admin');
    expect(checkSettings('settings.json', validSettings(fullDeny))).toEqual([]);
  });

  it('T5: removing only the plain --force rules while keeping lease rules is reported', () => {
    const deny = [
      ...fullDeny.filter((r) => !/--force(?![-\w])/.test(r)),
      'Bash(git push * --force-with-lease)',
    ];
    const problems = checkSettings('settings.json', validSettings(deny));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('git push --force rule');
  });

  it('T2: missing git push -f rule is reported by name', () => {
    const deny = fullDeny.filter((r) => !/\s-f(?![-\w])/.test(r));
    const problems = checkSettings('settings.json', validSettings(deny));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('git push -f rule');
  });

  it('T6: protected path list missing package.json names file and path', () => {
    const good = pathsLine(PATHS);
    const bad = pathsLine(PATHS.filter((p) => p !== 'package.json'));
    const problems = checkProtectedPaths({
      'A.md': good,
      'B.md': bad,
      'C.md': good,
    });
    expect(
      problems.some((p) => p.includes('B.md') && p.includes('package.json')),
    ).toBe(true);
    expect(checkProtectedPaths({ 'A.md': good, 'B.md': good })).toEqual([]);
  });
});

describe('md line budgets and path copies', () => {
  const CRLF = String.fromCharCode(13, 10);
  const lines = (n: number, eol = '\n') =>
    Array.from({ length: n }, () => 'line').join(eol) + eol;

  it('T1: file under its limit returns no problem', () => {
    expect(checkLineBudget('a.md', lines(5), 10)).toEqual([]);
  });

  it('T2: file exactly at its limit returns no problem (LF and CRLF)', () => {
    expect(countLines(lines(10))).toBe(10);
    expect(countLines(lines(10, CRLF))).toBe(10);
    expect(checkLineBudget('a.md', lines(10), 10)).toEqual([]);
    expect(checkLineBudget('a.md', lines(10, CRLF), 10)).toEqual([]);
  });

  it('T3: file one line over names the file and limit', () => {
    for (const eol of ['\n', CRLF]) {
      const problems = checkLineBudget('big.md', lines(11, eol), 10);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('big.md');
      expect(problems[0]).toContain('10');
    }
  });

  it('T4: copy missing one protected path names the file and entry', () => {
    const good = pathsLine(PATHS);
    const bad = pathsLine(PATHS.filter((p) => p !== 'tsconfig*'));
    const problems = checkProtectedPaths({ 'A.md': good, 'B.md': bad });
    expect(
      problems.some((p) => p.includes('B.md') && p.includes('tsconfig*')),
    ).toBe(true);
  });
});
