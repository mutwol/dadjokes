import { z } from "zod";
import { named } from "../common/zod";
import { Tone } from "../users/schemas";

const Day = z.iso.date();
const Role = z.enum(["reader", "writer", "curator", "admin"]);

export const RangeQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
export type RangeQuery = z.infer<typeof RangeQuery>;

export const AdminOverviewSchema = named(
  "AdminOverview",
  z.object({
    people: z.object({ total: z.number().int(), new7d: z.number().int(), readers: z.number().int(), writers: z.number().int(), suspended: z.number().int() }),
    today: z.object({
      delivered: z.number().int().describe("Jokes delivered in the last 24 hours."),
      opened: z.number().int(),
      openRate7d: z.number().describe("Share of delivered jokes opened, last 7 days (0-1)."),
    }),
    streaks: z.object({ active3plus: z.number().int(), longest: z.number().int() }),
    queue: z.object({ inReview: z.number().int(), scheduledAhead: z.number().int(), daysWithoutPick: z.number().int().describe("Of the next 7 days.") }),
    moderation: z.object({ openReports: z.number().int(), hidden: z.number().int(), openAppeals: z.number().int() }),
    money: z.object({ tips24hKes: z.number(), tips30dKes: z.number(), fees30dKes: z.number(), owedToWritersKes: z.number() }),
    series: z.array(z.object({ date: Day, signups: z.number().int(), opens: z.number().int(), tipsKes: z.number() })),
  }),
);

export const AdminFinanceSchema = named(
  "AdminFinance",
  z.object({
    days: z.number().int(),
    totals: z.object({
      tipsKes: z.number(),
      tipCount: z.number().int(),
      feesKes: z.number(),
      writerEarningsKes: z.number(),
      payoutsPaidKes: z.number(),
      payoutsPendingKes: z.number(),
      payoutsFailed: z.number().int(),
      tipsFailed: z.number().int(),
      owedToWritersKes: z.number().describe("Every writer balance combined, now."),
      clearingKes: z.number().describe("Net money through M-Pesa: tips in minus payouts out, all time."),
    }),
    series: z.array(z.object({ date: Day, tipsKes: z.number(), feesKes: z.number(), payoutsKes: z.number() })),
    topWriters: z.array(z.object({ id: z.uuid(), handle: z.string(), name: z.string(), tipsKes: z.number(), tips: z.number().int(), balanceKes: z.number() })),
    payouts: z.array(
      z.object({
        id: z.uuid(),
        handle: z.string(),
        amountKes: z.number().int(),
        status: z.enum(["requested", "processing", "paid", "failed"]),
        resultDesc: z.string().nullable(),
        createdAt: z.iso.datetime(),
        completedAt: z.iso.datetime().nullable(),
      }),
    ),
  }),
);

export const AdminEngagementSchema = named(
  "AdminEngagement",
  z.object({
    days: z.number().int(),
    daily: z.array(z.object({ date: Day, delivered: z.number().int(), opened: z.number().int(), reactions: z.number().int(), comments: z.number().int() })),
    streakBuckets: z.array(z.object({ label: z.string(), readers: z.number().int() })),
    topStreaks: z.array(z.object({ id: z.uuid(), handle: z.string(), name: z.string(), streak: z.number().int() })),
    topJokes: z.array(
      z.object({ id: z.uuid(), preview: z.string(), handle: z.string(), deliverOn: Day.nullable(), opens: z.number().int(), reactions: z.number().int(), comments: z.number().int(), shares: z.number().int() }),
    ),
    reactions: z.record(z.string(), z.number().int()),
    automation: z.object({ messages: z.number().int(), byChannel: z.record(z.string(), z.number().int()) }),
  }),
);

export const AdminUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: Role.optional(),
  tag: z.string().max(40).optional(),
  status: z.enum(["active", "suspended", "onboarding"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(10).max(100).default(25),
  sort: z
    .string()
    .regex(/^-?(name|createdAt|lastOpenAt)$/, "Sort by name, createdAt or lastOpenAt; prefix with - for descending.")
    .optional()
    .describe("Column to sort by: name, createdAt or lastOpenAt. Prefix with - for descending. Default: -createdAt."),
});
export type AdminUsersQuery = z.infer<typeof AdminUsersQuery>;

export const AdminUserRowSchema = named(
  "AdminUserRow",
  z.object({
    id: z.uuid(),
    name: z.string(),
    handle: z.string().nullable(),
    email: z.string(),
    country: z.string().nullable(),
    tone: Tone,
    roles: z.array(Role),
    tags: z.array(z.string()),
    streak: z.number().int(),
    lastOpenAt: z.iso.datetime().nullable(),
    onboarded: z.boolean(),
    suspended: z.boolean(),
    createdAt: z.iso.datetime(),
  }),
);
export const AdminUserPageSchema = named(
  "AdminUserPage",
  z.object({ data: z.array(AdminUserRowSchema), total: z.number().int(), page: z.number().int(), size: z.number().int() }),
);

export const AdminUserDetailSchema = named(
  "AdminUserDetail",
  AdminUserRowSchema.extend({
    bio: z.string(),
    timezone: z.string(),
    deliveryHour: z.number().int().nullable(),
    suspendedReason: z.string().nullable(),
    suspendedAt: z.iso.datetime().nullable(),
    stats: z.object({
      opens: z.number().int(),
      missed7d: z.number().int(),
      subscriptions: z.number().int(),
      subscribers: z.number().int(),
      tipsSent: z.number().int(),
      tipsSentKes: z.number(),
      tipsReceivedKes: z.number(),
      balanceKes: z.number(),
      jokesSubmitted: z.number().int(),
      jokesDelivered: z.number().int(),
      jokesRemoved: z.number().int(),
      reportsAgainst: z.number().int(),
      reportsFiled: z.number().int(),
    }),
    messages: z.array(z.object({ channel: z.string(), title: z.string(), workflowName: z.string().nullable(), sentAt: z.iso.datetime() })),
    runs: z.array(z.object({ id: z.uuid(), workflowName: z.string(), status: z.string(), startedAt: z.iso.datetime() })),
    audit: z.array(z.object({ action: z.string(), actor: z.string().nullable(), data: z.record(z.string(), z.unknown()), createdAt: z.iso.datetime() })),
  }),
);

export const SetRolesRequest = named("SetRolesRequest", z.object({ roles: z.array(Role).min(1) }));
export type SetRolesRequest = z.infer<typeof SetRolesRequest>;

export const SuspendRequest = named("SuspendRequest", z.object({ reason: z.string().trim().min(3).max(300) }));
export type SuspendRequest = z.infer<typeof SuspendRequest>;

export const TagListSchema = named("TagList", z.object({ data: z.array(z.object({ tag: z.string(), people: z.number().int() })) }));

export const AuditQuery = z.object({
  action: z.string().max(60).optional().describe("Starts with, e.g. report. or workflow."),
  targetType: z.string().max(40).optional(),
  before: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditQuery = z.infer<typeof AuditQuery>;

export const AuditEntrySchema = named(
  "AuditEntry",
  z.object({
    id: z.uuid(),
    actor: z.object({ id: z.uuid(), handle: z.string() }).nullable().describe("Null when the system did it."),
    action: z.string(),
    targetType: z.string(),
    targetId: z.string(),
    data: z.record(z.string(), z.unknown()),
    createdAt: z.iso.datetime(),
  }),
);
export const AuditPageSchema = named("AuditPage", z.object({ data: z.array(AuditEntrySchema), nextBefore: z.iso.datetime().nullable() }));

export const LandingSchema = named(
  "Landing",
  z.object({
    sample: z
      .object({ setup: z.string(), punchline: z.string(), background: Tone, writer: z.string() })
      .nullable()
      .describe("A recent favourite to show on the landing page."),
    stats: z.object({ readers: z.number().int(), writers: z.number().int(), jokesDelivered: z.number().int(), reactions: z.number().int() }),
    writers: z.array(z.object({ name: z.string(), handle: z.string(), tone: Tone, subscribers: z.number().int() })),
  }),
);
