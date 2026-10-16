import type { StoryFace } from "../components/StoryCard.tsx";

/** The joke shown on the welcome screen, before anyone has signed in. */
export const SAMPLE_JOKE: StoryFace = {
  kind: "text",
  setup: "I only know 25 letters of the alphabet.",
  punchline: "I don't know y.",
  background: "red",
};

export const COUNTRIES = [
  "Kenya",
  "Nigeria",
  "South Africa",
  "Uganda",
  "Tanzania",
  "United Kingdom",
  "United States",
  "Mexico",
  "Somewhere else",
];
