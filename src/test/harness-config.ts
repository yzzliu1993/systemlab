/** Pure checks for harness config files. Each takes file content as strings and returns problem messages. */

export const DOR_HEADINGS = [
  '## Goal',
  '## Scope / Out of scope',
  '## Acceptance criteria',
  '## Test scenarios',
  '## Dependencies (blocked by)',
] as const;

export function checkFrontmatter(file: string, content: string): string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(content);
  if (!match) return [`${file}: missing frontmatter`];
  const problems: string[] = [];
  const values = new Map<string, string>();
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1] as string;
    const value = (kv[2] as string).trim();
    values.set(key, value);
    const quoted = /^(".*"|'.*')$/.test(value);
    if (!quoted && value.includes(': ')) {
      problems.push(`${file}: unquoted value of "${key}" contains ": "`);
    }
  }
  for (const key of ['name', 'description']) {
    if (!values.get(key))
      problems.push(`${file}: frontmatter is missing "${key}"`);
  }
  return problems;
}

export function checkSettings(file: string, content: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return [
      `${file}: invalid JSON (${e instanceof Error ? e.message : String(e)})`,
    ];
  }
  const deny = (parsed as { permissions?: { deny?: unknown } } | null)
    ?.permissions?.deny;
  if (!Array.isArray(deny))
    return [`${file}: permissions.deny is missing or not an array`];
  const rules = deny.filter((r): r is string => typeof r === 'string');
  const required: [string, (r: string) => boolean][] = [
    [
      'git push --force rule',
      (r) => r.includes('git push') && /--force(?![-\w])/.test(r),
    ],
    [
      'git push --force-with-lease rule',
      (r) => r.includes('git push') && r.includes('--force-with-lease'),
    ],
    ['git reset --hard rule', (r) => r.includes('git reset --hard')],
    [
      'gh pr merge --admin rule',
      (r) => r.includes('gh pr merge') && r.includes('--admin'),
    ],
  ];
  return required
    .filter(([, test]) => !rules.some(test))
    .map(([name]) => `${file}: deny is missing the ${name}`);
}

export function checkDorHeadings(file: string, content: string): string[] {
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  return DOR_HEADINGS.filter((h) => !lines.includes(h)).map(
    (h) => `${file}: missing Definition of Ready heading "${h}"`,
  );
}

export function extractProtectedPaths(content: string): string[] {
  const line = content
    .split(/\r?\n/)
    .find((l) => l.includes('Protected paths:'));
  if (!line) return [];
  const rest = line.slice(line.indexOf('Protected paths:'));
  return [...rest.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string);
}

export function checkProtectedPaths(files: Record<string, string>): string[] {
  const problems: string[] = [];
  const lists = Object.entries(files).map(([file, content]) => {
    const paths = extractProtectedPaths(content);
    if (paths.length === 0)
      problems.push(`${file}: no protected paths list found`);
    return [file, paths] as const;
  });
  const union = new Set(lists.flatMap(([, p]) => p));
  for (const [file, paths] of lists) {
    if (paths.length === 0) continue;
    for (const p of union) {
      if (!paths.includes(p))
        problems.push(`${file}: protected path list is missing "${p}"`);
    }
  }
  if (union.size !== 11) {
    problems.push(
      `protected paths: expected 11 distinct paths, found ${union.size}`,
    );
  }
  return problems;
}
