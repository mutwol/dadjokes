import type { ReactionKind } from "./types.ts";

export const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "laugh", emoji: "😂", label: "Laughed" },
  { kind: "groan", emoji: "🙄", label: "Groaned" },
  { kind: "facepalm", emoji: "🤦", label: "Facepalmed" },
  { kind: "drum", emoji: "🥁", label: "Ba-dum-tss" },
];

export function totalReactions(r: Record<ReactionKind, number>): number {
  return r.laugh + r.groan + r.facepalm + r.drum;
}

/**
 * The groan score: the share of reactions that are groans or facepalms.
 * For a dad joke, a high score is the compliment.
 */
export function groanScore(r: Record<ReactionKind, number>): number {
  const total = totalReactions(r);
  if (total === 0) return 0;
  return Math.round(((r.groan + r.facepalm) / total) * 100);
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}
