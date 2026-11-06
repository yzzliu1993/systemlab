import { LANGUAGES } from '@/domain/i18n/translate';
import { useLanguage, useT } from '@/stores/language';

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C242]';

export default function Header() {
  const t = useT();
  const language = useLanguage((state) => state.language);
  const setLanguage = useLanguage((state) => state.setLanguage);

  return (
    <header className="bg-[#0F5C58] text-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <a
          href="#/"
          className={`inline-flex min-h-11 items-center text-lg font-bold ${focus}`}
        >
          {t('site.name')}
        </a>
        <nav className="flex flex-wrap items-center gap-2">
          <a
            href="#/"
            className={`inline-flex min-h-11 items-center px-3 underline ${focus}`}
          >
            {t('nav.home')}
          </a>
          <div role="group" aria-label={t('lang.label')} className="flex gap-1">
            {LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={language === code}
                onClick={() => setLanguage(code)}
                className={`min-h-11 min-w-11 rounded px-3 font-semibold ${focus} ${
                  language === code
                    ? 'bg-[#F5C242] text-[#1E2A2E]'
                    : 'bg-transparent text-white ring-1 ring-white'
                }`}
              >
                {t(`lang.${code}`)}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
