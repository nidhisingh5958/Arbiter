import { Skeleton, configureBoneyard } from 'boneyard-js/react';
import type { SkeletonResult } from 'boneyard-js';
import type { ReactNode } from 'react';

/**
 * Loading skeletons powered by boneyard-js. Bone layouts are hand-authored (x/w in %,
 * y/h in px) to mirror each real component; run `npx boneyard-js build` against the dev
 * server to replace them with pixel-perfect captured layouts.
 */
configureBoneyard({
  color: 'rgba(255,255,255,0.045)',
  darkColor: 'rgba(255,255,255,0.05)',
  animate: 'shimmer',
  shimmerColor: 'rgba(255,255,255,0.09)',
  darkShimmerColor: 'rgba(255,255,255,0.1)',
  speed: '1.6s',
  stagger: 45,
  transition: 260,
});

type Bone = [number, number, number, number, number];

function layout(name: string, height: number, bones: Bone[]): SkeletonResult {
  return { name, viewportWidth: 1280, width: 1200, height, bones };
}

const cards: Bone[] = [];
for (let row = 0; row < 2; row++) {
  for (let col = 0; col < 3; col++) cards.push([col * 33.9, row * 206, 32.2, 190, 24]);
}

const tiles: Bone[] = Array.from({ length: 5 }, (_, i) => [i * 20.2, 0, 19, 112, 22] as Bone);

const grid: Bone[] = [[0, 0, 100, 44, 14], ...Array.from({ length: 9 }, (_, i) => [0, 56 + i * 46, 100, 36, 10] as Bone)];

const timeline: Bone[] = [
  [0, 0, 100, 150, 24],
  [0, 168, 100, 150, 24],
  [0, 336, 100, 150, 24],
];

const review: Bone[] = [
  [0, 0, 100, 64, 18],
  [0, 84, 40, 300, 24],
  [41.5, 84, 58.5, 140, 24],
  [41.5, 240, 58.5, 144, 24],
  [0, 404, 40, 180, 24],
  [41.5, 404, 58.5, 180, 24],
];

const detail: Bone[] = [
  [0, 0, 60, 40, 12],
  [0, 56, 35, 18, 8],
  [0, 100, 64, 470, 24],
  [65.5, 100, 34.5, 220, 24],
  [65.5, 336, 34.5, 234, 24],
];

export const BONES = {
  cards: layout('contract-cards', 396, cards),
  tiles: layout('summary-tiles', 112, tiles),
  grid: layout('data-grid', 470, grid),
  timeline: layout('milestone-timeline', 486, timeline),
  review: layout('review-page', 584, review),
  detail: layout('contract-detail', 570, detail),
} as const;

export function Bones({ kind, loading, children }: { kind: keyof typeof BONES; loading: boolean; children: ReactNode }) {
  return (
    <Skeleton name={BONES[kind].name} loading={loading} initialBones={BONES[kind]} select="container">
      {children}
    </Skeleton>
  );
}
