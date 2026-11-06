import { lessonHash } from '@/domain/navigation/route';
import { roadmap } from '@/features/roadmap-view/shopRoadmap';
import { useT } from '@/stores/language';

export default function RoadmapHome() {
  const t = useT();

  return (
    <div>
      <h1 className="text-3xl font-bold">{t('home.title')}</h1>
      <p className="mt-2">{t('home.intro')}</p>
      <ol className="mt-6 flex flex-col gap-3">
        {roadmap.nodes.map((node, index) => (
          <li
            key={node.id}
            className={`rounded-lg border-2 p-4 ${
              node.open
                ? 'border-[#0F5C58] bg-white'
                : 'border-dashed border-[#0F5C58]/40 bg-white/60'
            }`}
          >
            <p className="text-sm font-semibold text-[#0F5C58]">
              {t('home.stage')} {index + 1}
            </p>
            {node.open ? (
              <a
                href={lessonHash(node.id)}
                className="inline-flex min-h-11 items-center text-xl font-bold text-[#0F5C58] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6452F]"
              >
                {t(node.title)}
              </a>
            ) : (
              <h2 className="text-xl font-bold">{t(node.title)}</h2>
            )}
            <p className="mt-1">{t(node.summary)}</p>
            {!node.open && (
              <span className="mt-2 inline-block rounded bg-[#F5C242] px-2 py-1 text-sm font-semibold">
                {t('home.comingSoon')}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
