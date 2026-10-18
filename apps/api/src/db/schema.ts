import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  jsonb,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Accounts, sign-in, roles, preferences and subscriptions (phase 1), and jokes
 * with their topics (phase 2). Deliveries, engagement and payments arrive in
 * later migrations.
 * All timestamps are stored in UTC; a reader's own clock comes from `timezone`.
 */

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** reader/writer are chosen by the person; curator/admin are staff-only. */
export const roleEnum = pgEnum("role", ["reader", "writer", "curator", "admin"]);
export const toneEnum = pgEnum("tone", ["red", "navy", "yellow", "green", "denim"]);
export const jokeOriginEnum = pgEnum("joke_origin", ["everywhere", "local"]);
export const payoutMethodEnum = pgEnum("payout_method", ["mpesa"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stored lowercased. */
    email: text("email").notNull(),
    name: text("name"),
    /** Public @handle; null until the person picks one during onboarding. */
    handle: text("handle"),
    country: text("country"),
    bio: text("bio").notNull().default(""),
    tone: toneEnum("tone").notNull().default("denim"),
    /** IANA zone, e.g. Africa/Nairobi. Decides when the daily joke arrives. */
    timezone: text("timezone").notNull().default("UTC"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    /** Set by an admin. A suspended account can't use the API. */
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    uniqueIndex("users_handle_key").on(t.handle),
    check("users_handle_format", sql`${t.handle} ~ '^[a-z0-9_]{3,20}$'`),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    grantedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] }), index("user_roles_role_idx").on(t.role)],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Local hour (0-23) at which the daily joke is delivered. */
    deliveryHour: smallint("delivery_hour").notNull().default(8),
    jokeOrigin: jokeOriginEnum("joke_origin").notNull().default("everywhere"),
    updatedAt: updatedAt(),
  },
  (t) => [check("user_preferences_hour_range", sql`${t.deliveryHour} between 0 and 23`)],
);

export const topics = pgTable("topics", {
  slug: text("slug").primaryKey(),
  label: text("label").notNull(),
  position: integer("position").notNull().default(0),
});

export const userTopics = pgTable(
  "user_topics",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicSlug: text("topic_slug")
      .notNull()
      .references(() => topics.slug, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topicSlug] })],
);

/** A reader subscribing to a writer. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.subscriberId, t.creatorId] }),
    index("subscriptions_creator_idx").on(t.creatorId),
    check("subscriptions_not_self", sql`${t.subscriberId} <> ${t.creatorId}`),
  ],
);

/** One-time sign-in codes. Only an HMAC of the code is stored. */
export const emailCodes = pgTable(
  "email_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: smallint("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("email_codes_email_created_idx").on(t.email, t.createdAt)],
);

/**
 * A signed-in device. The refresh token is `<session id>.<secret>`; only a hash
 * of the secret is stored and it changes on every refresh.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secretHash: text("secret_hash").notNull(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Where a writer's tips are paid. Verified by a small test payment later. */
export const payoutMethods = pgTable("payout_methods", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  method: payoutMethodEnum("method").notNull(),
  /** E.164 without the plus, e.g. 254712345678. */
  phone: text("phone").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const jokeKindEnum = pgEnum("joke_kind", ["text", "image"]);
/**
 * in_review → scheduled (a curator picked a day) → delivered (that day has begun).
 * A joke can also be declined by a curator or withdrawn by its writer.
 */
export const jokeStatusEnum = pgEnum("joke_status", ["in_review", "scheduled", "delivered", "declined", "withdrawn"]);

/** Why a curator didn't pick a joke. Shown to the writer. */
export const declineReasonEnum = pgEnum("decline_reason", [
  "possible_copy",
  "not_a_dad_joke",
  "offensive",
  "unclear",
  "other",
]);

/** A joke a writer submitted. Text jokes have a setup and punchline; image jokes an image. */
export const jokes = pgTable(
  "jokes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: jokeKindEnum("kind").notNull().default("text"),
    setup: text("setup"),
    punchline: text("punchline"),
    /** Where the image is in storage (see StorageService). The API turns it into a public URL. */
    imageKey: text("image_key"),
    imageAlt: text("image_alt"),
    caption: text("caption"),
    background: toneEnum("background").notNull().default("red"),
    /** Country whose readers need local knowledge to get it, e.g. Kenya. Null: works everywhere. */
    region: text("region"),
    status: jokeStatusEnum("status").notNull().default("in_review"),
    /** The day it goes out. Set exactly when the joke is scheduled or delivered. */
    deliverOn: date("deliver_on", { mode: "string" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    /** The curator who last scheduled or declined it. */
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    declineReason: declineReasonEnum("decline_reason"),
    declineNote: text("decline_note"),
    /** Taken down after it went out (e.g. a reported copy). Hidden from readers from then on. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: uuid("removed_by").references(() => users.id, { onDelete: "set null" }),
    /** Hidden automatically after enough reports, until a curator looks at it. */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("jokes_creator_idx").on(t.creatorId, t.submittedAt),
    /** The curators' review queue, oldest first. */
    index("jokes_review_queue_idx").on(t.submittedAt).where(sql`${t.status} = 'in_review'`),
    /** One joke per day for everyone, plus at most one per day for each region. */
    uniqueIndex("jokes_one_per_day_key")
      .on(t.deliverOn, sql`coalesce(${t.region}, '')`)
      .where(sql`${t.deliverOn} is not null`),
    /** Trigram index behind possible-copy detection (needs the pg_trgm extension). */
    index("jokes_text_trgm_idx").using("gin", sql`${jokeText(t)} gin_trgm_ops`),
    check(
      "jokes_content",
      sql`(${t.kind} = 'text' and ${t.setup} is not null and ${t.punchline} is not null)
        or (${t.kind} = 'image' and ${t.imageKey} is not null and ${t.imageAlt} is not null)`,
    ),
    check("jokes_declined_has_reason", sql`(${t.status} = 'declined') = (${t.declineReason} is not null)`),
    check(
      "jokes_scheduled_has_day",
      sql`(${t.deliverOn} is not null) = (${t.status} in ('scheduled', 'delivered'))`,
    ),
  ],
);

/** The searchable text of a joke: setup and punchline, lowercased. */
export function jokeText(t: { setup: unknown; punchline: unknown }) {
  return sql`(lower(coalesce(${t.setup}, '') || ' ' || coalesce(${t.punchline}, '')))`;
}

export const jokeTopics = pgTable(
  "joke_topics",
  {
    jokeId: uuid("joke_id")
      .notNull()
      .references(() => jokes.id, { onDelete: "cascade" }),
    topicSlug: text("topic_slug")
      .notNull()
      .references(() => topics.slug, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.jokeId, t.topicSlug] }), index("joke_topics_topic_idx").on(t.topicSlug)],
);

/**
 * A reader's joke for one of their local days. Created when their delivery
 * hour arrives; "open once" is enforced here: it can be opened until it expires,
 * and once opened it stays readable.
 */
export const deliveries = pgTable(
  "deliveries",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The reader's own calendar date for this joke. */
    localDate: date("local_date", { mode: "string" }).notNull(),
    jokeId: uuid("joke_id")
      .notNull()
      .references(() => jokes.id, { onDelete: "cascade" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.localDate] }),
    index("deliveries_joke_idx").on(t.jokeId),
    check("deliveries_expiry_after_delivery", sql`${t.expiresAt} > ${t.deliveredAt}`),
  ],
);

export const reactionKindEnum = pgEnum("reaction_kind", ["laugh", "groan", "facepalm", "drum"]);

/** One reaction per reader per joke; reacting again replaces it. */
export const reactions = pgTable(
  "reactions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jokeId: uuid("joke_id")
      .notNull()
      .references(() => jokes.id, { onDelete: "cascade" }),
    kind: reactionKindEnum("kind").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.jokeId] }), index("reactions_joke_idx").on(t.jokeId, t.kind)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jokeId: uuid("joke_id")
      .notNull()
      .references(() => jokes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    /** Deleted by its author, or removed by a curator. Kept for reports and moderation history. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
    /** Hidden automatically after enough reports, until a curator looks at it. */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  },
  (t) => [
    index("comments_joke_idx").on(t.jokeId, t.createdAt),
    check("comments_body_length", sql`char_length(${t.body}) between 1 and 280`),
  ],
);

export const reportReasonEnum = pgEnum("report_reason", ["copied", "offensive", "spam", "other"]);
export const reportResolutionEnum = pgEnum("report_resolution", ["dismissed", "removed"]);

/** A reader flagging a joke or a comment for curators. One report per person per thing. */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jokeId: uuid("joke_id").references(() => jokes.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "cascade" }),
    reason: reportReasonEnum("reason").notNull(),
    note: text("note"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolution: reportResolutionEnum("resolution"),
  },
  (t) => [
    check("reports_one_target", sql`(${t.jokeId} is null) <> (${t.commentId} is null)`),
    uniqueIndex("reports_joke_once_key").on(t.reporterId, t.jokeId).where(sql`${t.jokeId} is not null`),
    uniqueIndex("reports_comment_once_key").on(t.reporterId, t.commentId).where(sql`${t.commentId} is not null`),
    index("reports_open_idx").on(t.createdAt).where(sql`${t.resolvedAt} is null`),
  ],
);

export const jokeEventTypeEnum = pgEnum("joke_event_type", ["replay", "share"]);

/** Things readers do with a joke besides opening it, sent in batches by the app. */
export const jokeEvents = pgTable(
  "joke_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jokeId: uuid("joke_id")
      .notNull()
      .references(() => jokes.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: jokeEventTypeEnum("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("joke_events_joke_idx").on(t.jokeId, t.occurredAt)],
);

/** Per-joke, per-day totals for Studio, rebuilt by the worker from the tables above. */
export const jokeStatsDaily = pgTable(
  "joke_stats_daily",
  {
    jokeId: uuid("joke_id")
      .notNull()
      .references(() => jokes.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    opens: integer("opens").notNull().default(0),
    replays: integer("replays").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    reactions: integer("reactions").notNull().default(0),
    comments: integer("comments").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.jokeId, t.day] })],
);

export const notificationTypeEnum = pgEnum("notification_type", [
  "joke_scheduled",
  "joke_declined",
  "joke_delivered",
  "joke_removed",
  "new_subscriber",
  "comment",
  "tip_received",
  "payout_paid",
  "payout_failed",
  "report_resolved",
  "appeal_resolved",
  "automation",
]);

/** The Activity feed: things that happened to you, newest first. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    jokeId: uuid("joke_id").references(() => jokes.id, { onDelete: "cascade" }),
    /** Type-specific details shown in the feed, e.g. a comment excerpt or a tip amount. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    /** Makes a notification happen once, e.g. one "new subscriber" per subscriber. */
    dedupeKey: text("dedupe_key"),
    createdAt: createdAt(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_dedupe_key").on(t.userId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

/** A browser that agreed to push notifications (Web Push). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_key").on(t.endpoint), index("push_subscriptions_user_idx").on(t.userId)],
);

export const tipStatusEnum = pgEnum("tip_status", ["pending", "paid", "failed", "cancelled", "expired"]);

/** A reader tipping a writer for a joke, paid with an M-Pesa STK push. */
export const tips = pgTable(
  "tips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jokeId: uuid("joke_id")
      .notNull()
      .references(() => jokes.id, { onDelete: "restrict" }),
    tipperId: uuid("tipper_id").references(() => users.id, { onDelete: "set null" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountKes: integer("amount_kes").notNull(),
    /** E.164 without the plus. */
    phone: text("phone").notNull(),
    status: tipStatusEnum("status").notNull().default("pending"),
    checkoutRequestId: text("checkout_request_id"),
    merchantRequestId: text("merchant_request_id"),
    receipt: text("receipt"),
    resultCode: text("result_code"),
    resultDesc: text("result_desc"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Which payment provider collected it, e.g. mpesa_daraja. */
    provider: text("provider").notNull().default("mpesa_daraja"),
    /** The fee policy in force when the tip was paid, and the split it produced. Never recomputed. */
    feePolicyId: uuid("fee_policy_id").references(() => feePolicies.id, { onDelete: "restrict" }),
    feeBps: integer("fee_bps"),
    feeCents: bigint("fee_cents", { mode: "number" }),
    writerCents: bigint("writer_cents", { mode: "number" }),
    /** Earnings wait in the writer's pending balance until this time, in case the payment is reversed. */
    releaseAt: timestamp("release_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    /** A short public message shown with the tip on the joke, like a Super Chat. */
    note: text("note"),
    /** Hide the tipper's name on the joke and in the writer's notification. */
    anonymous: boolean("anonymous").notNull().default(false),
    noteHiddenAt: timestamp("note_hidden_at", { withTimezone: true }),
    noteHiddenBy: uuid("note_hidden_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("tips_checkout_key").on(t.checkoutRequestId),
    index("tips_joke_paid_idx").on(t.jokeId, t.paidAt).where(sql`${t.status} = 'paid'`),
    index("tips_release_idx").on(t.releaseAt).where(sql`${t.status} = 'paid' and ${t.releasedAt} is null`),
    check("tips_note_length", sql`${t.note} is null or char_length(${t.note}) <= 140`),
    uniqueIndex("tips_receipt_key").on(t.receipt),
    index("tips_creator_idx").on(t.creatorId, t.createdAt),
    index("tips_pending_idx").on(t.createdAt).where(sql`${t.status} = 'pending'`),
    check("tips_amount_range", sql`${t.amountKes} between 10 and 10000`),
  ],
);

export const payoutStatusEnum = pgEnum("payout_status", ["requested", "processing", "paid", "failed"]);

/** A writer withdrawing their tips to M-Pesa (B2C). */
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountKes: integer("amount_kes").notNull(),
    phone: text("phone").notNull(),
    status: payoutStatusEnum("status").notNull().default("requested"),
    conversationId: text("conversation_id"),
    originatorConversationId: text("originator_conversation_id"),
    receipt: text("receipt"),
    resultCode: text("result_code"),
    resultDesc: text("result_desc"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    provider: text("provider").notNull().default("mpesa_daraja"),
  },
  (t) => [
    uniqueIndex("payouts_originator_key").on(t.originatorConversationId),
    index("payouts_user_idx").on(t.userId, t.createdAt),
    check("payouts_amount_min", sql`${t.amountKes} >= 1`),
  ],
);

/**
 * Double-entry ledger in cents. Every transaction (txn_id) sums to zero,
 * enforced by a deferred trigger. Positive is money held (debit), negative is
 * money owed or earned (credit). Accounts: mpesa:clearing, platform:fees,
 * platform:creator_fund (what the creator fund has paid out),
 * creator:<user id>:pending (earned, still on hold) and creator:<user id>
 * (available to withdraw).
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    txnId: uuid("txn_id").notNull(),
    account: text("account").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("KES"),
    tipId: uuid("tip_id").references(() => tips.id, { onDelete: "restrict" }),
    payoutId: uuid("payout_id").references(() => payouts.id, { onDelete: "restrict" }),
    fundAllocationId: uuid("fund_allocation_id").references(() => creatorFundAllocations.id, { onDelete: "restrict" }),
    memo: text("memo").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("ledger_account_idx").on(t.account, t.createdAt),
    index("ledger_txn_idx").on(t.txnId),
    check("ledger_nonzero", sql`${t.amountCents} <> 0`),
  ],
);

/* ------------------------------------------------------------------ money: fees, reconciliation, creator fund */

/**
 * The platform's cut, in basis points (100 bps = 1%). The newest policy whose
 * window covers a moment applies; a creator-specific one beats the default.
 * Rates change by adding a policy, never by editing one, so every tip can
 * point at the exact rate it was charged.
 */
export const feePolicies = pgTable(
  "fee_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** ISO country the rate applies to. */
    country: text("country").notNull().default("KE"),
    /** Null for everyone; set for a negotiated rate. */
    creatorId: uuid("creator_id").references(() => users.id, { onDelete: "cascade" }),
    bps: integer("bps").notNull(),
    note: text("note").notNull().default(""),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("fee_policies_scope_idx").on(t.country, t.creatorId, t.effectiveFrom),
    check("fee_policies_bps_range", sql`${t.bps} between 0 and 5000`),
  ],
);

export const reconciliationStatusEnum = pgEnum("reconciliation_status", ["ok", "issues", "failed"]);

export interface ReconciliationCheck {
  key: string;
  label: string;
  ok: boolean;
  /** How many things are off (rows, transactions, accounts). */
  count: number;
  /** Money involved, when it's about money. */
  amountCents?: number;
  detail?: string;
}

/** One run of the books check: the ledger against itself, the tips and the payouts. */
export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: reconciliationStatusEnum("status").notNull(),
    checks: jsonb("checks").$type<ReconciliationCheck[]>().notNull().default([]),
    /** Null when the daily schedule ran it. */
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reconciliation_runs_started_idx").on(t.startedAt)],
);

/** A creator fund payout for a period: a pool split by qualified views. */
export const creatorFundRuns = pgTable(
  "creator_fund_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    poolCents: bigint("pool_cents", { mode: "number" }).notNull(),
    /** What was actually allocated; rounding leaves a few cents in the pool. */
    allocatedCents: bigint("allocated_cents", { mode: "number" }).notNull(),
    qualifiedViews: integer("qualified_views").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("creator_fund_runs_period_key").on(t.periodStart, t.periodEnd),
    check("creator_fund_runs_period", sql`${t.periodEnd} >= ${t.periodStart}`),
    check("creator_fund_runs_pool", sql`${t.poolCents} > 0`),
  ],
);

export const creatorFundAllocations = pgTable(
  "creator_fund_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => creatorFundRuns.id, { onDelete: "restrict" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    views: integer("views").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    releaseAt: timestamp("release_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("creator_fund_allocations_key").on(t.runId, t.creatorId),
    index("creator_fund_allocations_release_idx").on(t.releaseAt).where(sql`${t.releasedAt} is null`),
  ],
);

export type Role = (typeof roleEnum.enumValues)[number];
export type Tone = (typeof toneEnum.enumValues)[number];
export type User = typeof users.$inferSelect;
export type Joke = typeof jokes.$inferSelect;
export type JokeStatus = (typeof jokeStatusEnum.enumValues)[number];
export type Delivery = typeof deliveries.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];
export type Tip = typeof tips.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type FeePolicy = typeof feePolicies.$inferSelect;
export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;
export type DeclineReason = (typeof declineReasonEnum.enumValues)[number];

/* ------------------------------------------------------------------ v1: moderation and audit */

/** Every staff action worth answering for later: moderation, roles, suspensions, shop and automation changes. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null when the system did it (e.g. auto-hide by a rule). */
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Dotted verb, e.g. report.resolved, user.suspended, order.shipped. */
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_target_idx").on(t.targetType, t.targetId)],
);

export const appealStatusEnum = pgEnum("appeal_status", ["open", "upheld", "overturned"]);

/** A writer asking for a taken-down joke to be looked at again. */
export const appeals = pgTable(
  "appeals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jokeId: uuid("joke_id")
      .notNull()
      .references(() => jokes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    status: appealStatusEnum("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
  },
  (t) => [
    /** One open appeal per joke at a time. */
    uniqueIndex("appeals_one_open_key").on(t.jokeId).where(sql`${t.status} = 'open'`),
    index("appeals_open_idx").on(t.createdAt).where(sql`${t.status} = 'open'`),
    check("appeals_message_length", sql`char_length(${t.message}) between 1 and 1000`),
  ],
);

/* ------------------------------------------------------------------ v1: rules and automations */

export const ruleSetStatusEnum = pgEnum("rule_set_status", ["draft", "published", "archived"]);

/**
 * A rule set decides something from facts, with no side effects: facts go in,
 * outputs and a trace come out. The draft is edited freely; publishing runs the
 * tests and freezes a version. Code and workflows evaluate the live version.
 */
export const ruleSets = pgTable(
  "rule_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable name callers use, e.g. moderation.auto_hide. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    /** Picks the facts the rules can use (see rules/catalog.ts). */
    decisionPoint: text("decision_point").notNull(),
    /** Platform rule sets are used by the app itself and can't be deleted. */
    system: boolean("system").notNull().default(false),
    status: ruleSetStatusEnum("status").notNull().default("draft"),
    draft: jsonb("draft").$type<unknown>().notNull(),
    liveVersion: integer("live_version").notNull().default(0),
    /** Bumped on every save, for optimistic concurrency. */
    revision: integer("revision").notNull().default(1),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("rule_sets_key_key").on(t.key), check("rule_sets_key_format", sql`${t.key} ~ '^[a-z0-9_]+(\\.[a-z0-9_]+)+$'`)],
);

export const ruleSetVersions = pgTable(
  "rule_set_versions",
  {
    ruleSetId: uuid("rule_set_id")
      .notNull()
      .references(() => ruleSets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: jsonb("definition").$type<unknown>().notNull(),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ruleSetId, t.version] })],
);

export const workflowStatusEnum = pgEnum("workflow_status", ["draft", "active", "paused"]);

/**
 * A workflow reacts to an event (a trigger) with a list of steps: filters,
 * decisions, waits and actions. Edits go to the draft; publishing freezes a
 * version, and runs always use the version they started on.
 */
export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: workflowStatusEnum("status").notNull().default("draft"),
    /** The trigger of the published version, so events find their workflows quickly. */
    triggerType: text("trigger_type"),
    draft: jsonb("draft").$type<unknown>().notNull(),
    publishedVersion: integer("published_version").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    templateKey: text("template_key"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("workflows_trigger_idx").on(t.triggerType).where(sql`${t.status} = 'active'`)],
);

export const workflowVersions = pgTable(
  "workflow_versions",
  {
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    graph: jsonb("graph").$type<unknown>().notNull(),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workflowId, t.version] })],
);

export const workflowRunStatusEnum = pgEnum("workflow_run_status", ["running", "waiting", "completed", "stopped", "failed"]);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    workflowVersion: integer("workflow_version").notNull(),
    eventId: bigint("event_id", { mode: "number" }),
    /** The person the run is about, when the event has one. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: workflowRunStatusEnum("status").notNull().default("running"),
    /** The next step to run. */
    stepIndex: integer("step_index").notNull().default(0),
    /** The event and everything earlier steps produced, available to later steps. */
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    resumeAt: timestamp("resume_at", { withTimezone: true }),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("workflow_runs_workflow_idx").on(t.workflowId, t.startedAt),
    index("workflow_runs_waiting_idx").on(t.resumeAt).where(sql`${t.status} = 'waiting'`),
    /** An event starts each workflow at most once. */
    uniqueIndex("workflow_runs_event_key").on(t.workflowId, t.eventId).where(sql`${t.eventId} is not null`),
  ],
);

export const workflowRunSteps = pgTable(
  "workflow_run_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    stepId: text("step_id").notNull(),
    type: text("type").notNull(),
    /** ok, stopped (a filter said no), skipped (e.g. a send blocked by the send policy), waiting, failed. */
    status: text("status").notNull(),
    output: jsonb("output").$type<unknown>(),
    error: text("error"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workflow_run_steps_run_idx").on(t.runId, t.stepIndex)],
);

/**
 * The outbox of things that happened, written in the same transaction as the
 * change itself. The worker reads it in order and starts matching workflows.
 */
export const domainEvents = pgTable(
  "domain_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** Makes an event happen once, e.g. one "unopened" event per delivery. */
    dedupeKey: text("dedupe_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("domain_events_pending_idx").on(t.id).where(sql`${t.processedAt} is null`),
    index("domain_events_type_idx").on(t.type, t.occurredAt),
    uniqueIndex("domain_events_dedupe_key").on(t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

/** Labels on people for the mini CRM: set by admins or by workflows. */
export const userTags = pgTable(
  "user_tags",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tag] }),
    index("user_tags_tag_idx").on(t.tag),
    check("user_tags_format", sql`${t.tag} ~ '^[a-z0-9][a-z0-9_-]{0,39}$'`),
  ],
);

/** Every message a workflow sent, for the send policy (frequency caps) and reports. */
export const automationMessages = pgTable(
  "automation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: "set null" }),
    channel: text("channel").notNull(),
    title: text("title").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("automation_messages_user_idx").on(t.userId, t.sentAt), index("automation_messages_workflow_idx").on(t.workflowId, t.sentAt)],
);

export type Appeal = typeof appeals.$inferSelect;
export type RuleSet = typeof ruleSets.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
