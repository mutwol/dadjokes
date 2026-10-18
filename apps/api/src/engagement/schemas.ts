import { z } from "zod";
import { named } from "../common/zod";
import { ReactionCountsSchema, ReactionKind } from "../deliveries/schemas";
import { Tone } from "../users/schemas";

export const ReactRequest = named("ReactRequest", z.object({ kind: ReactionKind }));
export type ReactRequest = z.infer<typeof ReactRequest>;

export const JokeStatsSchema = named(
  "JokeStats",
  z.object({
    views: z.number().int(),
    reactions: ReactionCountsSchema,
    comments: z.number().int(),
    myReaction: ReactionKind.nullable(),
  }),
  "Live counts for a joke, as the viewer sees them.",
);
export type JokeStats = z.infer<typeof JokeStatsSchema>;

export const CommentSchema = named(
  "Comment",
  z.object({
    id: z.uuid(),
    body: z.string(),
    createdAt: z.iso.datetime(),
    author: z.object({ id: z.uuid(), name: z.string(), handle: z.string(), tone: Tone }),
    isMine: z.boolean(),
    canDelete: z.boolean().describe("Authors can delete their own comments; admins any."),
    canHide: z.boolean().describe("Curators and admins can hide a comment from readers."),
    hidden: z.boolean().describe("Hidden from readers (only staff and the author see it)."),
  }),
);
export type CommentOut = z.infer<typeof CommentSchema>;

export const CommentPageSchema = named(
  "CommentPage",
  z.object({ data: z.array(CommentSchema), nextCursor: z.string().nullable() }),
);

export const CommentsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});
export type CommentsQuery = z.infer<typeof CommentsQuery>;

export const CreateCommentRequest = named(
  "CreateCommentRequest",
  z.object({ body: z.string().trim().min(1, "Write something first.").max(280) }),
);
export type CreateCommentRequest = z.infer<typeof CreateCommentRequest>;

export const ReportReason = z.enum(["copied", "offensive", "spam", "other"]);

export const CreateReportRequest = named(
  "CreateReportRequest",
  z
    .object({
      jokeId: z.uuid().optional(),
      commentId: z.uuid().optional(),
      reason: ReportReason,
      note: z.string().trim().max(280).optional(),
    })
    .refine((r) => Boolean(r.jokeId) !== Boolean(r.commentId), { message: "Report either a joke or a comment." }),
  "Flag a joke or a comment for the curators.",
);
export type CreateReportRequest = z.infer<typeof CreateReportRequest>;

export const EventsRequest = named(
  "EventsRequest",
  z.object({
    events: z
      .array(
        z.object({
          jokeId: z.uuid(),
          type: z.enum(["replay", "share"]),
          at: z.iso.datetime().optional().describe("When it happened. Defaults to now; clamped to the last day."),
        }),
      )
      .min(1)
      .max(50),
  }),
  "A batch of things the reader did with jokes.",
);
export type EventsRequest = z.infer<typeof EventsRequest>;

export const ReportedItemSchema = named(
  "ReportedItem",
  z.object({
    target: z.enum(["joke", "comment"]),
    jokeId: z.uuid(),
    commentId: z.uuid().nullable(),
    preview: z.string(),
    authorHandle: z.string(),
    reports: z.number().int(),
    reasons: z.record(z.string(), z.number().int()),
    notes: z.array(z.string()),
    firstReportedAt: z.iso.datetime(),
    hidden: z.boolean().describe("Hidden from readers automatically, waiting for a decision."),
    resolution: z.enum(["dismissed", "removed"]).nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    resolvedBy: z.string().nullable().describe("Handle of the curator who decided."),
  }),
  "Something readers flagged, with every report about it combined.",
);

export const ReportedItemListSchema = named("ReportedItemList", z.object({ data: z.array(ReportedItemSchema) }));

export const ResolveReportsRequest = named(
  "ResolveReportsRequest",
  z
    .object({
      jokeId: z.uuid().optional(),
      commentId: z.uuid().optional(),
      action: z.enum(["dismiss", "remove"]),
      note: z.string().trim().max(500).optional().describe("Why, for the audit log."),
    })
    .refine((r) => Boolean(r.jokeId) !== Boolean(r.commentId), { message: "Resolve either a joke or a comment." }),
  "Close every open report about one thing: leave it up, or take it down.",
);
export type ResolveReportsRequest = z.infer<typeof ResolveReportsRequest>;

export const ReportsQuery = z.object({ status: z.enum(["open", "resolved"]).default("open") });
export type ReportsQuery = z.infer<typeof ReportsQuery>;

export const ReportReceiptSchema = named(
  "ReportReceipt",
  z.object({
    alreadyReported: z.boolean(),
    hidden: z.boolean().describe("It's now hidden from readers while curators review it."),
  }),
);
