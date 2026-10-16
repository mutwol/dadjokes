import { sql } from "drizzle-orm";
import {
  bigint,
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
  },
  (t) => [
    uniqueIndex("tips_checkout_key").on(t.checkoutRequestId),
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
 * creator:<user id> (what we owe a writer).
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
    memo: text("memo").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("ledger_account_idx").on(t.account, t.createdAt),
    index("ledger_txn_idx").on(t.txnId),
    check("ledger_nonzero", sql`${t.amountCents} <> 0`),
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
export type DeclineReason = (typeof declineReasonEnum.enumValues)[number];
