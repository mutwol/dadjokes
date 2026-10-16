import { z } from "zod";
import { named } from "../common/zod";
import { IsoDate } from "../jokes/schemas";
import { Tone } from "../users/schemas";

export const ReactionKind = z.enum(["laugh", "groan", "facepalm", "drum"]);
export type ReactionKind = z.infer<typeof ReactionKind>;

export const ReactionCountsSchema = named(
  "ReactionCounts",
  z.object({ laugh: z.number().int(), groan: z.number().int(), facepalm: z.number().int(), drum: z.number().int() }),
);

export const JokeSchema = named(
  "Joke",
  z.object({
    id: z.uuid(),
    kind: z.enum(["text", "image"]),
    setup: z.string().nullable(),
    punchline: z.string().nullable(),
    imageUrl: z.string().nullable(),
    imageAlt: z.string().nullable(),
    caption: z.string().nullable(),
    background: Tone,
    region: z.string().nullable(),
    topics: z.array(z.string()),
    deliverOn: IsoDate.nullable(),
    creator: z.object({
      id: z.uuid(),
      name: z.string(),
      handle: z.string(),
      country: z.string().nullable(),
      tone: Tone,
      bio: z.string(),
      subscriberCount: z.number().int(),
      isSubscribed: z.boolean(),
    }),
    stats: z.object({
      views: z.number().int(),
      reactions: ReactionCountsSchema,
      comments: z.number().int(),
    }),
    myReaction: ReactionKind.nullable(),
    isMine: z.boolean(),
  }),
  "A joke as a reader sees it once it's opened.",
);
export type ReaderJoke = z.infer<typeof JokeSchema>;

export const DeliveryState = z.enum(["sealed", "opened", "missed"]);

export const DeliveryCardSchema = named(
  "DeliveryCard",
  z.object({
    date: IsoDate,
    state: DeliveryState,
    deliveredAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    kind: z.enum(["text", "image"]),
    background: Tone,
    creator: z.object({ name: z.string(), handle: z.string(), tone: Tone }),
    jokeId: z.uuid().nullable().describe("Only once opened: the joke stays sealed until then."),
  }),
  "A delivered joke, sealed until the reader opens it.",
);
export type DeliveryCard = z.infer<typeof DeliveryCardSchema>;

export const TodaySchema = named(
  "Today",
  z.object({
    date: IsoDate.describe("The reader's local date."),
    timezone: z.string(),
    deliveryHour: z.number().int(),
    nextDeliveryAt: z.iso.datetime(),
    current: DeliveryCardSchema.nullable().describe("Today's joke, or yesterday's if it can still be opened."),
    week: z.array(
      z.object({
        date: IsoDate,
        state: z.enum(["sealed", "opened", "missed", "upcoming", "none"]),
        creator: z.object({ name: z.string(), tone: Tone }).nullable(),
        jokeId: z.uuid().nullable(),
      }),
    ),
    streak: z.number().int().describe("Days in a row with the joke opened."),
  }),
  "Everything the Today screen shows.",
);
export type Today = z.infer<typeof TodaySchema>;

export const StudioSummarySchema = named(
  "StudioSummary",
  z.object({
    sent: z.number().int(),
    picked: z.number().int(),
    inReview: z.number().int(),
    reached: z.number().int().describe("Readers your jokes were delivered to."),
    opened: z.number().int(),
    tipsKes: z.number(),
  }),
);
