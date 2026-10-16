export type ReactionKind = "laugh" | "groan" | "facepalm" | "drum";

export type JokeBackground = "red" | "navy" | "yellow" | "green" | "denim";

export interface Comment {
  id: string;
  author: string;
  handle: string;
  body: string;
  postedAt: string;
  tone: JokeBackground;
}

/** A person can read (get the daily joke), write (submit jokes), or both. */
export type Role = "reader" | "writer";

export type NotificationState = "on" | "off" | "denied" | "unsupported";

/** What onboarding collects before it is saved to the API in one call. */
export interface OnboardingDraft {
  email: string;
  name: string;
  handle: string;
  country: string;
  bio: string;
  roles: Role[];
  /** Topic slugs from GET /v1/topics. */
  topics: string[];
  /** "everywhere" or "local": whether to favour jokes from the reader's country. */
  jokeOrigin: "everywhere" | "local";
  /** Writer ids from GET /v1/creators. */
  following: string[];
  deliveryHour: number;
  notifications: NotificationState;
  payout: { method: "mpesa"; phone: string } | { method: "later" };
}
