import { useState } from "react";
import { REACTIONS, compact, groanScore, totalReactions } from "../data/reactions.ts";
import type { ReactionKind } from "../data/types.ts";
import { cn } from "@/lib/utils.ts";

const SEGMENT: Record<ReactionKind, string> = {
  groan: "bg-tag-red",
  facepalm: "bg-denim",
  laugh: "bg-highlighter",
  drum: "bg-lawn",
};

export function ReactionBar({
  selected,
  counts,
  onReact,
  tone = "light",
}: {
  selected?: ReactionKind;
  counts?: Record<ReactionKind, number>;
  onReact: (kind: ReactionKind) => void;
  tone?: "light" | "dark";
}) {
  const [burst, setBurst] = useState<ReactionKind | null>(null);
  return (
    // minmax(0, 1fr): long labels ("Ba-dum-tss") truncate instead of pushing the row wider than its container.
    <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2" role="group" aria-label="React to this joke">
      {REACTIONS.map((r) => {
        const on = selected === r.kind;
        return (
          <button
            key={r.kind}
            type="button"
            className={cn(
              "flex min-w-0 flex-col items-center gap-0.5 border-2 border-transparent px-1 transition-[border-color,background-color] duration-120",
              // The status viewer is a compact overlay; the joke page gets the roomier tiles.
              tone === "light" ? "rounded-2xl pt-2.5 pb-2" : "rounded-xl pt-1.5 pb-1.5",
              tone === "light"
                ? on
                  ? "border-ink bg-cream"
                  : "border-line bg-paper hover:border-line-strong"
                : on
                  ? "theme-light bg-white text-ink"
                  : "bg-white/12 text-white backdrop-blur-sm hover:bg-white/20",
            )}
            aria-pressed={on}
            onClick={() => {
              onReact(r.kind);
              setBurst(on ? null : r.kind);
            }}
          >
            <span
              className={cn("inline-block leading-[1.1]", tone === "light" ? "text-[1.75rem]" : "text-[1.5rem]", burst === r.kind && "animate-burst")}
              onAnimationEnd={() => setBurst(null)}
              aria-hidden="true"
            >
              {r.emoji}
            </span>
            <span className="max-w-full truncate text-xs font-medium max-xs:text-2xs">{r.label}</span>
            {counts ? <span className="text-xs text-ink-soft">{compact(counts[r.kind])}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function GroanMeter({ counts }: { counts: Record<ReactionKind, number> }) {
  const total = totalReactions(counts);
  const score = groanScore(counts);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline gap-3.5">
        <p className="flex items-baseline gap-1.5">
          <strong className="text-3xl leading-none font-bold">{score}</strong>
          <span className="font-medium text-ink-soft">groan score</span>
        </p>
        <p className="text-sm text-ink-soft">
          {score >= 60
            ? "Certified groaner. That's the goal."
            : score >= 40
              ? "Solid groan. Some people actually laughed."
              : "Too many laughs. Suspiciously funny."}
        </p>
      </div>
      <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-paper" aria-hidden="true">
        {REACTIONS.map((r) => (
          <span
            key={r.kind}
            className={cn("basis-0", SEGMENT[r.kind])}
            style={{ flexGrow: counts[r.kind] }}
          />
        ))}
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1.5 p-0 text-sm">
        {REACTIONS.map((r) => (
          <li key={r.kind} className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", SEGMENT[r.kind])} aria-hidden="true" />
            {r.label}
            <strong className="ml-auto">{total ? Math.round((counts[r.kind] / total) * 100) : 0}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
