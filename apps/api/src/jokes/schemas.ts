import { z } from "zod";
import { named } from "../common/zod";
import { Tone } from "../users/schemas";

export const JokeStatus = z.enum(["in_review", "scheduled", "delivered", "declined", "withdrawn"]);
export const IsoDate = z.iso.date();
export const DeclineReason = z.enum(["possible_copy", "not_a_dad_joke", "offensive", "unclear", "other"]);

const Region = z
  .string()
  .trim()
  .min(2)
  .max(56)
  .nullable()
  .default(null)
  .describe("Country whose readers need local knowledge to get it. Null: works everywhere.");
const Topics = z.array(z.string()).max(3, "Pick up to 3 topics.").default([]);
const Original = z.literal(true, { error: "Confirm you wrote this joke yourself." });

export const CreateTextJokeRequest = z.object({
  kind: z.literal("text"),
  setup: z.string().trim().min(3, "Add a setup.").max(140),
  punchline: z.string().trim().min(1, "Add a punchline.").max(80),
  background: Tone.default("red"),
  region: Region,
  topics: Topics,
  original: Original,
});

export const CreateJokeRequest = named(
  "CreateJokeRequest",
  z.discriminatedUnion("kind", [CreateTextJokeRequest]),
  "A new joke for curators to review.",
);
export type CreateJokeRequest = z.infer<typeof CreateJokeRequest>;

export const SubmissionSchema = named(
  "Submission",
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
    status: JokeStatus,
    deliverOn: IsoDate.nullable(),
    submittedAt: z.iso.datetime(),
    declineReason: DeclineReason.nullable(),
    declineNote: z.string().nullable(),
    canWithdraw: z.boolean(),
  }),
  "One of my jokes, with where it is in curation.",
);
export type Submission = z.infer<typeof SubmissionSchema>;

export const SubmissionPageSchema = named(
  "SubmissionPage",
  z.object({ data: z.array(SubmissionSchema), nextCursor: z.string().nullable() }),
);

export const ListMyJokesQuery = z.object({
  status: JokeStatus.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});
export type ListMyJokesQuery = z.infer<typeof ListMyJokesQuery>;
