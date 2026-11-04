import {
  checkDorHeadings,
  checkFrontmatter,
  checkProtectedPaths,
  checkSettings,
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
  return problems;
}

const validSettings = (deny: string[]) =>
  JSON.stringify({ permissions: { deny } });
const fullDeny = [
  'Bash(gh pr merge *--admin*)',
  'Bash(git push --force *)',
  'Bash(git push * --force-with-lease)',
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
