import type { JokeStatus, Tone } from "./schema";

/**
 * Test jokes for development. `day` is relative to today, so every seed run
 * keeps a joke on today, a fortnight of past jokes and a few days scheduled
 * ahead. Status follows from it: past days and today are delivered, later
 * days scheduled. Jokes without a day sit in review, or were declined or
 * withdrawn.
 *
 * `key` gives each joke a stable id, so re-seeding moves the same rows along
 * instead of adding new ones.
 */
export interface SeedJoke {
  key: string;
  writer: string;
  day?: number;
  status?: Extract<JokeStatus, "in_review" | "declined" | "withdrawn">;
  /** Country for local jokes; omit for jokes that work everywhere. */
  region?: string;
  topics: string[];
  background: Tone;
  setup: string;
  punchline: string;
}

export const SEED_JOKES: SeedJoke[] = [
  // Delivered, everywhere
  { key: "alphabet", writer: "wanjiru_puns", day: 0, topics: ["wordplay", "school"], background: "red", setup: "I only know 25 letters of the alphabet.", punchline: "I don't know y." },
  { key: "scarecrow", writer: "grillmaster_dan", day: -1, topics: ["wordplay", "work"], background: "green", setup: "Why did the scarecrow win an award?", punchline: "He was outstanding in his field." },
  { key: "facial-hair", writer: "baba_otieno", day: -2, topics: ["wordplay"], background: "denim", setup: "I used to hate facial hair.", punchline: "But then it grew on me." },
  { key: "nose", writer: "papa_jokes_mx", day: -3, topics: ["science"], background: "navy", setup: "Why can't a nose be 12 inches long?", punchline: "Because then it would be a foot." },
  { key: "seafood-diet", writer: "grillmaster_dan", day: -4, topics: ["food"], background: "yellow", setup: "I'm on a seafood diet.", punchline: "I see food and I eat it." },
  { key: "skeletons", writer: "amara_says_hi", day: -5, topics: ["science", "kids"], background: "green", setup: "Why don't skeletons fight each other?", punchline: "They don't have the guts." },
  { key: "fish-no-eyes", writer: "wanjiru_puns", day: -6, topics: ["animals", "wordplay"], background: "red", setup: "What do you call a fish with no eyes?", punchline: "A fsh." },
  { key: "shoe-recycling", writer: "baba_otieno", day: -7, topics: ["work"], background: "navy", setup: "I used to work in a shoe recycling shop.", punchline: "It was sole destroying." },
  { key: "impasta", writer: "papa_jokes_mx", day: -8, topics: ["food"], background: "yellow", setup: "What do you call a fake noodle?", punchline: "An impasta." },
  { key: "stadium-fans", writer: "grillmaster_dan", day: -9, topics: ["sports"], background: "denim", setup: "Why are football stadiums so cool?", punchline: "Every seat has a fan in it." },
  { key: "bulldozer", writer: "amara_says_hi", day: -10, topics: ["animals"], background: "green", setup: "What do you call a sleeping bull?", punchline: "A bulldozer." },
  { key: "homework-cake", writer: "wanjiru_puns", day: -11, topics: ["school", "kids"], background: "red", setup: "Why did the student eat his homework?", punchline: "The teacher said it was a piece of cake." },
  { key: "chemistry", writer: "baba_otieno", day: -12, topics: ["science"], background: "navy", setup: "I told a chemistry joke once.", punchline: "There was no reaction." },
  { key: "calendar", writer: "papa_jokes_mx", day: -13, topics: ["wordplay", "work"], background: "yellow", setup: "I'm worried about the calendar.", punchline: "Its days are numbered." },

  // Delivered, Kenya only
  { key: "napati", writer: "amara_says_hi", day: -3, region: "Kenya", topics: ["food"], background: "yellow", setup: "What do you call a chapati that dozed off on the pan?", punchline: "A napati." },
  { key: "ugali-side", writer: "wanjiru_puns", day: -6, region: "Kenya", topics: ["food"], background: "red", setup: "Why is ugali never lonely?", punchline: "It always comes with a side." },
  { key: "matatu-ladder", writer: "baba_otieno", day: 0, region: "Kenya", topics: ["work", "wordplay"], background: "green", setup: "Why did the matatu tout bring a ladder?", punchline: "He heard the fare was going up." },

  // Scheduled
  { key: "crummy-cookie", writer: "grillmaster_dan", day: 1, topics: ["food", "kids"], background: "red", setup: "Why did the cookie go to the doctor?", punchline: "It was feeling crummy." },
  { key: "wall-corner", writer: "wanjiru_puns", day: 2, topics: ["kids", "wordplay"], background: "yellow", setup: "What did one wall say to the other wall?", punchline: "Meet you at the corner." },
  { key: "gummy-bear", writer: "papa_jokes_mx", day: 3, topics: ["animals"], background: "green", setup: "What do you call a bear with no teeth?", punchline: "A gummy bear." },
  { key: "boda-crowd", writer: "wanjiru_puns", day: 3, region: "Kenya", topics: ["work"], background: "denim", setup: "Why did the boda boda rider take art classes?", punchline: "He wanted to learn to draw a crowd." },
  { key: "golf-trousers", writer: "baba_otieno", day: 4, topics: ["sports"], background: "navy", setup: "Why did the golfer pack two pairs of trousers?", punchline: "In case he got a hole in one." },
  { key: "anti-gravity", writer: "amara_says_hi", day: 5, topics: ["science"], background: "denim", setup: "I'm reading a book about anti-gravity.", punchline: "It's impossible to put down." },

  // In review
  { key: "matatu-sweater", writer: "baba_otieno", status: "in_review", region: "Kenya", topics: ["work"], background: "green", setup: "Why did the matatu bring a sweater?", punchline: "It heard the route had a lot of drafts." },
  { key: "pointless-pencil", writer: "grillmaster_dan", status: "in_review", topics: ["school"], background: "denim", setup: "I made a pencil with two erasers.", punchline: "It was pointless." },
  { key: "cow-bells", writer: "amara_says_hi", status: "in_review", topics: ["animals"], background: "yellow", setup: "Why do cows wear bells?", punchline: "Because their horns don't work." },
  { key: "construction", writer: "papa_jokes_mx", status: "in_review", topics: ["work"], background: "navy", setup: "I'd tell you a joke about construction.", punchline: "But I'm still working on it." },

  // Declined (a copy of a delivered joke) and withdrawn
  { key: "alphabet-copy", writer: "grillmaster_dan", status: "declined", topics: ["wordplay"], background: "red", setup: "I only know 25 letters of the alphabet.", punchline: "I don't know y." },
  { key: "tomato-blush", writer: "papa_jokes_mx", status: "withdrawn", topics: ["food"], background: "red", setup: "Why did the tomato blush?", punchline: "It saw the salad dressing." },
];
