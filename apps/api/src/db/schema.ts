import { sql } from "drizzle-orm";
import {
  check,
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
    imageUrl: text("image_url"),
    imageAlt: text("image_alt"),
    caption: text("caption"),
    background: toneEnum("background").notNull().default("red"),
    /** Country whose readers need local knowledge to get it, e.g. Kenya. Null: works everywhere. */
    region: text("region"),
    status: jokeStatusEnum("status").notNull().default("in_review"),
    /** The day it goes out. Set exactly when the joke is scheduled or delivered. */
    deliverOn: date("deliver_on", { mode: "string" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
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
    check(
      "jokes_content",
      sql`(${t.kind} = 'text' and ${t.setup} is not null and ${t.punchline} is not null)
        or (${t.kind} = 'image' and ${t.imageUrl} is not null and ${t.imageAlt} is not null)`,
    ),
    check(
      "jokes_scheduled_has_day",
      sql`(${t.deliverOn} is not null) = (${t.status} in ('scheduled', 'delivered'))`,
    ),
  ],
);

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

export type Role = (typeof roleEnum.enumValues)[number];
export type Tone = (typeof toneEnum.enumValues)[number];
export type User = typeof users.$inferSelect;
export type Joke = typeof jokes.$inferSelect;
export type JokeStatus = (typeof jokeStatusEnum.enumValues)[number];
