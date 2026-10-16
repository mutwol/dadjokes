import { useState } from "react";
import { REACTIONS, compact, groanScore, totalReactions } from "../data/reactions.ts";
import type { ReactionKind } from "../data/types.ts";
import "./Reactions.css";

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
    <div className={`reactions reactions-${tone}`} role="group" aria-label="React to this joke">
      {REACTIONS.map((r) => {
        const on = selected === r.kind;
        return (
          <button
            key={r.kind}
            type="button"
            className={`reaction${on ? " is-on" : ""}`}
            aria-pressed={on}
            onClick={() => {
              onReact(r.kind);
              setBurst(on ? null : r.kind);
            }}
          >
            <span
              className={`reaction-emoji${burst === r.kind ? " is-burst" : ""}`}
              onAnimationEnd={() => setBurst(null)}
              aria-hidden="true"
            >
              {r.emoji}
            </span>
            <span className="reaction-label">{r.label}</span>
            {counts ? <span className="reaction-count">{compact(counts[r.kind])}</span> : null}
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
    <div className="groanmeter">
      <div className="groanmeter-head">
        <p className="groanmeter-score">
          <strong>{score}</strong>
          <span>groan score</span>
        </p>
        <p className="groanmeter-note">
          {score >= 60
            ? "Certified groaner. That's the goal."
            : score >= 40
              ? "Solid groan. Some people actually laughed."
              : "Too many laughs. Suspiciously funny."}
        </p>
      </div>
      <div className="groanmeter-bar" aria-hidden="true">
        {REACTIONS.map((r) => (
          <span
            key={r.kind}
            className={`groanmeter-seg seg-${r.kind}`}
            style={{ flexGrow: counts[r.kind] }}
          />
        ))}
      </div>
      <ul className="groanmeter-legend">
        {REACTIONS.map((r) => (
          <li key={r.kind}>
            <span className={`groanmeter-dot seg-${r.kind}`} aria-hidden="true" />
            {r.label}
            <strong>{total ? Math.round((counts[r.kind] / total) * 100) : 0}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
