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

/** A person can read (get the daily joke), write (submit jokes), or both. */
export type Role = "reader" | "writer";

export type NotificationState = "on" | "off" | "denied" | "unsupported";

export interface Profile {
  email: string;
  name: string;
  handle: string;
  country: string;
  bio: string;
  roles: Role[];
  topics: string[];
  /** "everywhere" or "local": whether to favour jokes from the reader's country. */
  jokeOrigin: "everywhere" | "local";
  following: string[];
  deliveryHour: number;
  notifications: NotificationState;
  payout: { method: "mpesa"; phone: string } | { method: "later" };
}
