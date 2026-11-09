import { useEffect, useSyncExternalStore } from 'react';
import Header from '@/components/Header';
import ChapterList from '@/features/article-reader/ChapterList';
import ChapterPage from '@/features/article-reader/ChapterPage';
import { chapters } from '@/features/article-reader/registry';
import { parseHash } from '@/domain/navigation/route';
import { useLanguage } from '@/stores/language';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}

const knownIds = chapters.map((entry) => entry.en.id);

export default function App() {
  const language = useLanguage((state) => state.language);
  const route = parseHash(useHash(), knownIds);
  const entry =
    route.page === 'chapter'
      ? chapters.find((c) => c.en.id === route.id)
      : undefined;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <div className="min-h-svh bg-[#EAF3EF] text-[#1E2A2E]">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {entry ? <ChapterPage chapter={entry[language]} /> : <ChapterList />}
      </main>
    </div>
  );
}
