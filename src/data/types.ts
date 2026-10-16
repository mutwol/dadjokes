export type ReactionKind = "laugh" | "groan" | "facepalm" | "drum";

export type JokeBackground = "red" | "navy" | "yellow" | "green" | "denim";

export interface Creator {
  id: string;
  name: string;
  handle: string;
  region: string;
  bio: string;
  subscribers: number;
  /** Colour used for the initials avatar. */
  tone: JokeBackground;
}

export interface Comment {
  id: string;
  author: string;
  handle: string;
  body: string;
  postedAt: string;
  tone: JokeBackground;
}

interface JokeBase {
  id: string;
  creatorId: string;
  /** ISO date (YYYY-MM-DD) of the day this joke is delivered to subscribers. */
  deliverOn: string;
  region: string;
  tags: string[];
  views: number;
  reactions: Record<ReactionKind, number>;
  comments: Comment[];
}

export interface TextJoke extends JokeBase {
  kind: "text";
  setup: string;
  punchline: string;
  background: JokeBackground;
}

export interface ImageJoke extends JokeBase {
  kind: "image";
  imageUrl: string;
  imageAlt: string;
  caption: string;
}

export type Joke = TextJoke | ImageJoke;

export type SubmissionStatus = "in-review" | "scheduled" | "delivered" | "declined";

export interface Submission {
  id: string;
  setup: string;
  punchline: string;
  background: JokeBackground;
  submittedOn: string;
  status: SubmissionStatus;
  scheduledFor?: string;
  deliveredTo?: number;
}
