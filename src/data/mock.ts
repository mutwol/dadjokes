import type { Creator, Joke, Submission } from "./types.ts";

/**
 * Mock data for the UI prototype. The shape mirrors what an API would return,
 * so swapping this module for real fetches later is a contained change.
 */

export const TODAY = "2026-10-16";

/** The reader's chosen delivery time for their daily joke (24h, local). */
export const DEFAULT_DELIVERY_HOUR = 8;

export const ME = {
  name: "Cyrus",
  handle: "cyrus",
  streak: 4,
  plan: "free" as "free" | "plus",
};

export const creators: Creator[] = [
  {
    id: "wanjiru",
    name: "Wanjiru Kamau",
    handle: "wanjiru_puns",
    region: "Nairobi, KE",
    bio: "Mother of two, collector of terrible puns.",
    subscribers: 18400,
    tone: "red",
  },
  {
    id: "otieno",
    name: "Otieno Okoth",
    handle: "baba_otieno",
    region: "Kisumu, KE",
    bio: "My kids stopped laughing in 2019. I did not stop.",
    subscribers: 9200,
    tone: "green",
  },
  {
    id: "dan",
    name: "Dan Whitfield",
    handle: "grillmaster_dan",
    region: "Leeds, UK",
    bio: "Grill on, socks with sandals, jokes at the ready.",
    subscribers: 31200,
    tone: "denim",
  },
  {
    id: "amara",
    name: "Amara Obi",
    handle: "amara_says_hi",
    region: "Lagos, NG",
    bio: "Hi hungry, I'm Amara.",
    subscribers: 12700,
    tone: "yellow",
  },
  {
    id: "maria",
    name: "María Torres",
    handle: "papa_jokes_mx",
    region: "Monterrey, MX",
    bio: "Dad jokes in two languages, groans in all of them.",
    subscribers: 6100,
    tone: "navy",
  },
];

export const jokes: Joke[] = [
  {
    id: "j-1016",
    kind: "text",
    creatorId: "wanjiru",
    deliverOn: "2026-10-16",
    region: "Global",
    tags: ["wordplay", "school"],
    setup: "I only know 25 letters of the alphabet.",
    punchline: "I don't know y.",
    background: "red",
    views: 48210,
    reactions: { laugh: 6120, groan: 9840, facepalm: 4310, drum: 2270 },
    comments: [
      {
        id: "c1",
        author: "Brian M.",
        handle: "brian_m",
        body: "My son read this out at breakfast and I had to leave the table.",
        postedAt: "2h",
        tone: "denim",
      },
      {
        id: "c2",
        author: "Achieng",
        handle: "achieng.o",
        body: "Sent it to the family group. Nobody has replied. Success.",
        postedAt: "3h",
        tone: "green",
      },
      {
        id: "c3",
        author: "Grillmaster Dan",
        handle: "grillmaster_dan",
        body: "Respect. Wish I'd written this one.",
        postedAt: "5h",
        tone: "yellow",
      },
    ],
  },
  {
    id: "j-1015",
    kind: "text",
    creatorId: "dan",
    deliverOn: "2026-10-15",
    region: "Global",
    tags: ["farm"],
    setup: "Why did the scarecrow win an award?",
    punchline: "He was outstanding in his field.",
    background: "green",
    views: 51870,
    reactions: { laugh: 7400, groan: 8120, facepalm: 3200, drum: 3010 },
    comments: [],
  },
  {
    id: "j-1014",
    kind: "text",
    creatorId: "otieno",
    deliverOn: "2026-10-14",
    region: "Global",
    tags: ["grooming"],
    setup: "I used to hate facial hair.",
    punchline: "But then it grew on me.",
    background: "denim",
    views: 44090,
    reactions: { laugh: 5010, groan: 7720, facepalm: 2980, drum: 1810 },
    comments: [],
  },
  {
    id: "j-1013",
    kind: "text",
    creatorId: "amara",
    deliverOn: "2026-10-13",
    region: "Kenya",
    tags: ["food"],
    setup: "What do you call a chapati that dozed off on the pan?",
    punchline: "A napati.",
    background: "yellow",
    views: 23400,
    reactions: { laugh: 4100, groan: 3300, facepalm: 2100, drum: 900 },
    comments: [],
  },
  {
    id: "j-1012",
    kind: "text",
    creatorId: "maria",
    deliverOn: "2026-10-12",
    region: "Global",
    tags: ["body"],
    setup: "Why can't a nose be 12 inches long?",
    punchline: "Because then it would be a foot.",
    background: "navy",
    views: 39900,
    reactions: { laugh: 4800, groan: 6900, facepalm: 2500, drum: 1300 },
    comments: [],
  },
];

/** Days of the current week that the reader opened their joke. */
export const seenDays = new Set(["2026-10-12", "2026-10-14", "2026-10-15"]);

export const mySubmissions: Submission[] = [
  {
    id: "s1",
    setup: "I'm reading a book about anti-gravity.",
    punchline: "It's impossible to put down.",
    background: "denim",
    submittedOn: "2026-10-14",
    status: "scheduled",
    scheduledFor: "2026-10-21",
  },
  {
    id: "s2",
    setup: "Why did the matatu bring a sweater?",
    punchline: "It heard the route had a lot of drafts.",
    background: "green",
    submittedOn: "2026-10-15",
    status: "in-review",
  },
  {
    id: "s3",
    setup: "What do you call a fake noodle?",
    punchline: "An impasta.",
    background: "yellow",
    submittedOn: "2026-10-02",
    status: "delivered",
    scheduledFor: "2026-10-08",
    deliveredTo: 41200,
  },
];

export function creatorById(id: string): Creator {
  const c = creators.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown creator ${id}`);
  return c;
}

export function jokeById(id: string): Joke | undefined {
  return jokes.find((j) => j.id === id);
}

export function jokeForDay(day: string): Joke | undefined {
  return jokes.find((j) => j.deliverOn === day);
}

/** Monday-to-Sunday dates (ISO) for the week containing `day`. */
export function weekOf(day: string): string[] {
  const d = new Date(`${day}T12:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

export function weekdayShort(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" });
}

export function longDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
