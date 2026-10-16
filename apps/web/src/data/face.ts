import type { StoryFace } from "../components/StoryCard.tsx";
import type { JokeBackground } from "./types.ts";

/** The parts of any joke shape (submission, curated, reader) a story card needs. */
interface FaceSource {
  kind: "text" | "image";
  setup: string | null;
  punchline: string | null;
  background: JokeBackground;
  imageUrl: string | null;
  imageAlt: string | null;
  caption: string | null;
}

export function faceOf(j: FaceSource): StoryFace {
  return j.kind === "text"
    ? { kind: "text", setup: j.setup ?? "", punchline: j.punchline ?? "", background: j.background }
    : { kind: "image", imageUrl: j.imageUrl ?? undefined, imageAlt: j.imageAlt ?? "", caption: j.caption ?? "" };
}
