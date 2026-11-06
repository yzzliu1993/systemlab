import { useEffect, useSyncExternalStore } from 'react';
import Header from '@/components/Header';
import LessonPage from '@/features/article-reader/LessonPage';
import RoadmapHome from '@/features/roadmap-view/RoadmapHome';
import { openLessonIds } from '@/features/roadmap-view/shopRoadmap';
import { parseHash } from '@/domain/navigation/route';
import { useLanguage } from '@/stores/language';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}

export default function App() {
  const language = useLanguage((state) => state.language);
  const route = parseHash(useHash(), openLessonIds);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <div className="min-h-svh bg-[#EAF3EF] text-[#1E2A2E]">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {route.page === 'lesson' ? <LessonPage /> : <RoadmapHome />}
      </main>
    </div>
  );
}
