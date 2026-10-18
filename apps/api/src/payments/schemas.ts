import { z } from "zod";
import { named } from "../common/zod";
import { KenyanMobile } from "../users/schemas";

export const CreateTipRequest = named(
  "CreateTipRequest",
  z.object({
    amountKes: z.number().int().min(10, "Tips start at KES 10.").max(10000, "Tips go up to KES 10,000."),
    phone: KenyanMobile.describe("The M-Pesa number to charge. It gets a prompt to enter the PIN."),
    note: z
      .string()
      .trim()
      .max(140, "Keep the message to 140 characters.")
      .optional()
      .describe("Shown with the tip under the joke and in the writer's notification."),
    anonymous: z.boolean().optional().describe("Hide my name on the joke and from the writer."),
  }),
);
export type CreateTipRequest = z.infer<typeof CreateTipRequest>;

export const TipSchema = named(
  "Tip",
  z.object({
    id: z.uuid(),
    jokeId: z.uuid(),
    amountKes: z.number().int(),
    status: z.enum(["pending", "paid", "failed", "cancelled", "expired"]),
    message: z.string().describe("What to tell the tipper about the current status."),
    simulated: z.boolean().describe("Test mode: no real money moves. Answer the prompt with simulateTipPrompt."),
    phoneLast3: z.string(),
    createdAt: z.iso.datetime(),
  }),
);
export type TipOut = z.infer<typeof TipSchema>;

export const BalanceSchema = named(
  "Balance",
  z.object({
    availableKes: z.number().describe("Can be withdrawn now."),
    pendingKes: z.number().describe("Earned but still on hold; becomes available after the hold."),
    nextReleaseAt: z.iso.datetime().nullable().describe("When the next pending earnings become available."),
    holdHours: z.number().int(),
    lifetimeTipsKes: z.number().describe("Everything tipped to you, after the platform fee."),
    creatorFundKes: z.number().describe("Everything paid to you from the creator fund."),
    paidOutKes: z.number(),
    pendingPayoutKes: z.number(),
    minimumPayoutKes: z.number().int(),
    payoutPhoneLast3: z.string().nullable(),
  }),
);

export const CreatePayoutRequest = named(
  "CreatePayoutRequest",
  z.object({ amountKes: z.number().int().min(1) }),
);
export type CreatePayoutRequest = z.infer<typeof CreatePayoutRequest>;

export const PayoutSchema = named(
  "PayoutTransfer",
  z.object({
    id: z.uuid(),
    amountKes: z.number().int(),
    phoneLast3: z.string(),
    status: z.enum(["requested", "processing", "paid", "failed"]),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  }),
  "Money sent from your balance to your M-Pesa.",
);
export type PayoutOut = z.infer<typeof PayoutSchema>;

export const PayoutListSchema = named("PayoutList", z.object({ data: z.array(PayoutSchema) }));

export const TipWallItemSchema = named(
  "TipWallItem",
  z.object({
    id: z.uuid(),
    amountKes: z.number().int(),
    note: z.string().nullable(),
    noteHidden: z.boolean().describe("The writer or a curator hid the message."),
    anonymous: z.boolean(),
    isMine: z.boolean(),
    from: z.object({ name: z.string(), handle: z.string(), tone: z.string() }).nullable().describe("Null when the tipper chose to stay anonymous."),
    paidAt: z.iso.datetime(),
  }),
);

export const TipWallSchema = named(
  "TipWall",
  z.object({
    count: z.number().int(),
    totalKes: z.number().int(),
    canModerate: z.boolean().describe("The viewer can hide messages (the writer, or a curator)."),
    data: z.array(TipWallItemSchema),
  }),
  "Paid tips on a joke with their messages, newest first.",
);
export type TipWallOut = z.infer<typeof TipWallSchema>;

export const HideTipNoteRequest = named("HideTipNoteRequest", z.object({ hidden: z.boolean() }));
export type HideTipNoteRequest = z.infer<typeof HideTipNoteRequest>;

/* ----------------------------------------------------------------- admin: money */

export const FeePolicySchema = named(
  "FeePolicy",
  z.object({
    id: z.uuid(),
    country: z.string(),
    creator: z.object({ id: z.uuid(), handle: z.string().nullable(), name: z.string().nullable() }).nullable(),
    bps: z.number().int().describe("Basis points: 1000 = 10%."),
    note: z.string(),
    effectiveFrom: z.iso.datetime(),
    /** When a newer policy for the same scope took over. */
    supersededAt: z.iso.datetime().nullable(),
    tips: z.number().int().describe("Paid tips charged at this rate."),
    createdAt: z.iso.datetime(),
  }),
);
export type FeePolicyOut = z.infer<typeof FeePolicySchema>;
export const FeePolicyListSchema = named("FeePolicyList", z.object({ data: z.array(FeePolicySchema) }));

export const CreateFeePolicyRequest = named(
  "CreateFeePolicyRequest",
  z.object({
    bps: z.number().int().min(0).max(5000, "The cut can be at most 50%."),
    creatorHandle: z
      .string()
      .trim()
      .regex(/^@?[a-z0-9_]{3,20}$/i, "Not a valid handle.")
      .optional()
      .describe("Leave out for the default rate; set for one writer's own rate."),
    note: z.string().trim().max(200).default(""),
    effectiveFrom: z.iso.datetime().optional().describe("Defaults to now. Can't be in the past."),
  }),
);
export type CreateFeePolicyRequest = z.infer<typeof CreateFeePolicyRequest>;

export const ReconciliationCheckSchema = named(
  "ReconciliationCheck",
  z.object({
    key: z.string(),
    label: z.string(),
    ok: z.boolean(),
    count: z.number().int(),
    amountKes: z.number().nullable(),
    detail: z.string().nullable(),
  }),
);
export const ReconciliationRunSchema = named(
  "ReconciliationRun",
  z.object({
    id: z.uuid(),
    status: z.enum(["ok", "issues", "failed"]),
    checks: z.array(ReconciliationCheckSchema),
    triggeredBy: z.string().nullable().describe("Handle of the admin who ran it; null for the daily run."),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
  }),
);
export type ReconciliationRunOut = z.infer<typeof ReconciliationRunSchema>;
export const ReconciliationRunListSchema = named("ReconciliationRunList", z.object({ data: z.array(ReconciliationRunSchema) }));

const isoDate = z.iso.date();
export const CreatorFundRequest = named(
  "CreatorFundRequest",
  z
    .object({
      periodStart: isoDate,
      periodEnd: isoDate,
      poolKes: z.number().int().min(1).max(10_000_000),
    })
    .refine((v) => v.periodEnd >= v.periodStart, { message: "The period ends before it starts.", path: ["periodEnd"] }),
);
export type CreatorFundRequest = z.infer<typeof CreatorFundRequest>;

export const CreatorFundAllocationSchema = named(
  "CreatorFundAllocation",
  z.object({
    creatorId: z.uuid(),
    handle: z.string().nullable(),
    name: z.string().nullable(),
    views: z.number().int(),
    sharePct: z.number(),
    amountKes: z.number(),
  }),
);
export const CreatorFundPreviewSchema = named(
  "CreatorFundPreview",
  z.object({
    periodStart: isoDate,
    periodEnd: isoDate,
    poolKes: z.number().int(),
    qualifiedViews: z.number().int().describe("Opens by readers other than the writer, of jokes still up, from writers in good standing."),
    allocations: z.array(CreatorFundAllocationSchema),
  }),
);
export type CreatorFundPreviewOut = z.infer<typeof CreatorFundPreviewSchema>;

export const CreatorFundRunSchema = named(
  "CreatorFundRun",
  z.object({
    id: z.uuid(),
    periodStart: isoDate,
    periodEnd: isoDate,
    poolKes: z.number(),
    allocatedKes: z.number(),
    qualifiedViews: z.number().int(),
    creators: z.number().int(),
    releasedKes: z.number(),
    createdBy: z.string().nullable(),
    createdAt: z.iso.datetime(),
  }),
);
export type CreatorFundRunOut = z.infer<typeof CreatorFundRunSchema>;
export const CreatorFundRunListSchema = named("CreatorFundRunList", z.object({ data: z.array(CreatorFundRunSchema) }));

export const SimulateTipPromptRequest = named(
  "SimulateTipPromptRequest",
  z.object({
    answer: z
      .enum(["approve", "cancel", "insufficient_funds", "wrong_pin"])
      .describe("What the tipper does on the simulated M-Pesa prompt."),
  }),
);
export type SimulateTipPromptRequest = z.infer<typeof SimulateTipPromptRequest>;
