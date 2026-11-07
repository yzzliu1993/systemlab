import { lessonHash } from '@/domain/navigation/route';
import { roadmap } from '@/features/roadmap-view/shopRoadmap';
import { useT } from '@/stores/language';

type Stage = (typeof roadmap.nodes)[number];

export default function RoadmapHome({
  nodes = roadmap.nodes,
}: {
  nodes?: readonly Stage[];
}) {
  const t = useT();
  const openStages = nodes.filter((node) => node.open);

  return (
    <div>
      <h1 className="text-3xl font-bold">{t('home.title')}</h1>
      <p className="mt-2">{t('home.intro')}</p>
      {openStages.length > 0 && (
        <ol className="mt-6 flex flex-col gap-3">
          {openStages.map((node, index) => (
            <li
              key={node.id}
              className="rounded-lg border-2 border-[#0F5C58] bg-white p-4"
            >
              <p className="text-sm font-semibold text-[#0F5C58]">
                {t('home.stage')} {index + 1}
              </p>
              <a
                href={lessonHash(node.id)}
                className="inline-flex min-h-11 items-center text-xl font-bold text-[#0F5C58] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6452F]"
              >
                {t(node.title)}
              </a>
              <p className="mt-1">{t(node.summary)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
