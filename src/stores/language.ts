import { create } from 'zustand';
import en from '@/content/locales/en.json';
import zhTW from '@/content/locales/zh-TW.json';
import { isLanguage, translate } from '@/domain/i18n/translate';
import type { Language, Messages } from '@/domain/i18n/translate';

const STORAGE_KEY = 'systemlab.language';

const catalogs: Record<Language, Messages> = { en, 'zh-TW': zhTW };

function readSaved(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(value)) return value;
  } catch {
    // Storage may be blocked; fall back to English.
  }
  return 'en';
}

function save(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Ignore storage errors; the choice still applies for this visit.
  }
}

type LanguageState = {
  language: Language;
  setLanguage: (language: Language) => void;
  hydrate: () => void;
};

export const useLanguage = create<LanguageState>((set) => ({
  language: 'en',
  setLanguage: (language) => {
    save(language);
    set({ language });
  },
  hydrate: () => set({ language: readSaved() }),
}));

export function useT(): (key: string) => string {
  const language = useLanguage((state) => state.language);
  return (key) => translate(key, catalogs[language], catalogs.en);
}
