export type LocaleKeyProblems = {
  /** Keys present in one locale but not the other. */
  mismatched: string[];
  /** Keys that no source file uses, neither as a literal nor via a dynamic prefix. */
  unused: string[];
};

/**
 * Compares the key sets of two locales and finds keys no code uses.
 * A key counts as used when a source contains it as a quoted string literal,
 * or when it starts with one of `dynamicPrefixes` (keys built at runtime).
 */
export function checkLocaleKeys(
  locales: Readonly<Record<string, Readonly<Record<string, string>>>>,
  sources: readonly string[],
  dynamicPrefixes: readonly string[],
): LocaleKeyProblems {
  const keySets = Object.values(locales).map((m) => new Set(Object.keys(m)));
  const all = new Set(keySets.flatMap((s) => [...s]));
  const mismatched = [...all].filter((k) => !keySets.every((s) => s.has(k)));
  const text = sources.join('\n');
  const unused = [...all].filter(
    (k) =>
      !dynamicPrefixes.some((p) => k.startsWith(p)) &&
      !['"', "'", '`'].some((q) => text.includes(`${q}${k}${q}`)),
  );
  return { mismatched: mismatched.sort(), unused: unused.sort() };
}
