import type { JokeBackground } from "@/data/types.ts";

/** Background and text colour for each joke background (also used for avatars). */
export const TONE: Record<JokeBackground, string> = {
  red: "bg-tag-red text-white",
  navy: "bg-navy text-white",
  yellow: "theme-light bg-highlighter text-ink",
  green: "bg-lawn text-white",
  denim: "bg-denim text-white",
};
