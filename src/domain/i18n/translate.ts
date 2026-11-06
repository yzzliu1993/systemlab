export const LANGUAGES = ['en', 'zh-TW'] as const;
export type Language = (typeof LANGUAGES)[number];
export type Messages = Readonly<Record<string, string>>;

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language === value);
}

export function translate(
  key: string,
  messages: Messages,
  fallback: Messages,
): string {
  return messages[key] ?? fallback[key] ?? key;
}
