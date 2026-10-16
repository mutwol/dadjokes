import type { JokeBackground } from "../data/types.ts";
import "./StoryCard.css";

export interface StoryFace {
  kind: "text" | "image";
  setup?: string;
  punchline?: string;
  background?: JokeBackground;
  imageUrl?: string;
  imageAlt?: string;
  caption?: string;
}

/**
 * The face of a joke: setup first, punchline revealed with a highlighter swipe.
 * Rendered full-screen in the viewer and as a small card in previews.
 */
export function StoryCard({
  face,
  revealed,
  variant = "card",
  animate = true,
}: {
  face: StoryFace;
  revealed: boolean;
  variant?: "card" | "full" | "inline";
  animate?: boolean;
}) {
  if (face.kind === "image") {
    return (
      <div className={`story story-${variant} story-image`}>
        {face.imageUrl ? (
          <img src={face.imageUrl} alt={face.imageAlt ?? ""} />
        ) : (
          <div className="story-image-empty">Your image shows here</div>
        )}
        {face.caption ? <p className="story-caption">{face.caption}</p> : null}
      </div>
    );
  }

  const bg = face.background ?? "red";
  return (
    <div className={`story story-${variant} story-bg-${bg}`}>
      <div className="story-body">
        <p className="story-setup">{face.setup || "Your setup goes here."}</p>
        <p
          className={`story-punchline${revealed ? " is-revealed" : ""}${animate ? " is-animated" : ""}`}
          aria-hidden={!revealed}
        >
          <span>{face.punchline || "And the punchline here."}</span>
        </p>
      </div>
    </div>
  );
}
