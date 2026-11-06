import shop from '@/content/roadmaps/shop.json';
import { loadRoadmap } from '@/domain/roadmap/load';

export const { roadmap } = loadRoadmap(shop);

export const openLessonIds: string[] = roadmap.nodes
  .filter((node) => node.open)
  .map((node) => node.id);
