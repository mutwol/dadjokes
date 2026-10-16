import { z } from "zod";
import { named } from "../common/zod";
import { DeclineReason, IsoDate, JokeStatus, SubmissionSchema } from "../jokes/schemas";
import { Tone } from "../users/schemas";

export const JokeCreatorSchema = named(
  "JokeCreator",
  z.object({ id: z.uuid(), name: z.string(), handle: z.string(), country: z.string().nullable(), tone: Tone }),
);

export const CuratedJokeSchema = named(
  "CuratedJoke",
  SubmissionSchema.extend({ creator: JokeCreatorSchema, reviewedAt: z.iso.datetime().nullable() }),
  "A joke as curators see it, with its writer.",
);
export type CuratedJoke = z.infer<typeof CuratedJokeSchema>;

export const PossibleCopySchema = named(
  "PossibleCopy",
  z.object({
    id: z.uuid(),
    setup: z.string().nullable(),
    punchline: z.string().nullable(),
    status: JokeStatus,
    deliverOn: IsoDate.nullable(),
    creatorHandle: z.string(),
    sameWriter: z.boolean(),
    similarity: z.number().min(0).max(1),
  }),
  "An existing joke whose text is close to the one being reviewed.",
);

export const QueueItemSchema = named(
  "QueueItem",
  z.object({ joke: CuratedJokeSchema, possibleCopies: z.array(PossibleCopySchema) }),
);

export const QueuePageSchema = named(
  "QueuePage",
  z.object({ data: z.array(QueueItemSchema), nextCursor: z.string().nullable(), waiting: z.number().int() }),
);

export const QueueQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});
export type QueueQuery = z.infer<typeof QueueQuery>;

export const CalendarQuery = z.object({
  from: IsoDate.optional().describe("First day to show. Defaults to the first day still open for scheduling."),
  days: z.coerce.number().int().min(1).max(62).default(21),
});
export type CalendarQuery = z.infer<typeof CalendarQuery>;

export const CalendarSchema = named(
  "CurationCalendar",
  z.object({
    firstOpenDay: IsoDate,
    days: z.array(
      z.object({
        date: IsoDate,
        picks: z.array(
          z.object({
            jokeId: z.uuid(),
            region: z.string().nullable(),
            setup: z.string().nullable(),
            creatorName: z.string(),
            status: JokeStatus,
          }),
        ),
      }),
    ),
  }),
  "Which days have a joke going out, everywhere and per region.",
);

export const ScheduleRequest = named(
  "ScheduleJokeRequest",
  z.object({ deliverOn: IsoDate }),
  "Pick the day a joke goes out. Moving an already scheduled joke works the same way.",
);
export type ScheduleRequest = z.infer<typeof ScheduleRequest>;

export const DeclineRequest = named(
  "DeclineJokeRequest",
  z.object({ reason: DeclineReason, note: z.string().trim().max(280).optional() }),
  "Why the joke wasn't picked. The writer sees the reason and the note.",
);
export type DeclineRequest = z.infer<typeof DeclineRequest>;
