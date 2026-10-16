import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, ne, notInArray } from "drizzle-orm";
import { z } from "zod";
import { AppError, notFound } from "../common/errors";
import { CreatorsService } from "../creators/creators.service";
import { InjectDb } from "../db/db.module";
import type { Db, Tx } from "../db/db.module";
import { payoutMethods, topics, userPreferences, userRoles, users, userTopics } from "../db/schema";
import type { Role, Tone } from "../db/schema";
import {
  CompleteOnboardingRequest,
  HANDLE_PATTERN,
  PayoutMethodRequest,
  UpdateMeRequest,
  UpdatePreferencesRequest,
} from "./schemas";
import type { Me } from "./schemas";

/** Handles nobody can take: they'd look official or clash with app routes. */
const RESERVED_HANDLES = new Set([
  "admin", "api", "app", "dad", "daddy", "daddyjokes", "help", "me", "root", "settings",
  "staff", "studio", "support", "system", "welcome", "www",
]);

const TONES: Tone[] = ["red", "navy", "yellow", "green", "denim"];
const CHOSEN: Role[] = ["reader", "writer"];

const handleTaken = (handle: string) =>
  new AppError(409, "handle_taken", `@${handle} is taken.`, { detail: `Try @${handle}_jokes.` });

@Injectable()
export class UsersService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly creators: CreatorsService,
  ) {}

  /** Signs in an existing account or creates one. Email must already be verified. */
  async findOrCreateByEmail(email: string, name?: string): Promise<{ userId: string; isNew: boolean }> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ email, name: name ?? null, tone: TONES[Math.floor(Math.random() * TONES.length)] })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      if (created) {
        await tx.insert(userPreferences).values({ userId: created.id });
        return { userId: created.id, isNew: true };
      }
      const existing = await tx.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
      if (!existing) throw new Error("User vanished during sign-in");
      return { userId: existing.id, isNew: false };
    });
  }

  async getMe(userId: string, tx: Tx = this.db): Promise<Me> {
    const user = await tx.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw notFound("Account");
    // Sequential on purpose: inside a transaction these share one connection.
    const roles = await tx
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId))
      .orderBy(asc(userRoles.role));
    const prefs = await tx.query.userPreferences.findFirst({ where: eq(userPreferences.userId, userId) });
    const topicRows = await tx.select({ slug: userTopics.topicSlug }).from(userTopics).where(eq(userTopics.userId, userId));
    const payout = await tx.query.payoutMethods.findFirst({ where: eq(payoutMethods.userId, userId) });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      handle: user.handle,
      country: user.country,
      bio: user.bio,
      tone: user.tone,
      timezone: user.timezone,
      roles: roles.map((r) => r.role),
      preferences: {
        deliveryHour: prefs?.deliveryHour ?? 8,
        jokeOrigin: prefs?.jokeOrigin ?? "everywhere",
        topics: topicRows.map((t) => t.slug),
      },
      payout: payout ? { method: payout.method, phoneLast3: payout.phone.slice(-3), verified: Boolean(payout.verifiedAt) } : null,
      onboarded: Boolean(user.onboardedAt),
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateProfile(userId: string, patch: z.infer<typeof UpdateMeRequest>, tx: Tx = this.db): Promise<void> {
    if (patch.handle) await this.assertHandleFree(patch.handle, userId, tx);
    if (Object.keys(patch).length) await tx.update(users).set(patch).where(eq(users.id, userId));
  }

  /** Sets reader/writer. Staff roles are never touched from here. */
  async replaceRoles(userId: string, roles: ("reader" | "writer")[], tx: Tx = this.db): Promise<void> {
    await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), inArray(userRoles.role, CHOSEN), notInArray(userRoles.role, roles)));
    await tx
      .insert(userRoles)
      .values(roles.map((role) => ({ userId, role })))
      .onConflictDoNothing();
  }

  async updatePreferences(userId: string, patch: z.infer<typeof UpdatePreferencesRequest>, tx: Tx = this.db) {
    const { topics: topicSlugs, ...rest } = patch;
    if (Object.keys(rest).length) {
      await tx
        .insert(userPreferences)
        .values({ userId, ...rest })
        .onConflictDoUpdate({ target: userPreferences.userId, set: rest });
    }
    if (topicSlugs) {
      const unique = [...new Set(topicSlugs)];
      await this.assertTopicsExist(unique, tx);
      await tx.delete(userTopics).where(eq(userTopics.userId, userId));
      if (unique.length) await tx.insert(userTopics).values(unique.map((topicSlug) => ({ userId, topicSlug })));
    }
  }

  async setPayout(userId: string, req: z.infer<typeof PayoutMethodRequest>, tx: Tx = this.db) {
    // Changing the number means it has to be verified again.
    await tx
      .insert(payoutMethods)
      .values({ userId, method: req.method, phone: req.phone })
      .onConflictDoUpdate({ target: payoutMethods.userId, set: { method: req.method, phone: req.phone, verifiedAt: null } });
  }

  async removePayout(userId: string) {
    await this.db.delete(payoutMethods).where(eq(payoutMethods.userId, userId));
  }

  /** Saves everything from onboarding atomically: all of it or none of it. */
  async completeOnboarding(userId: string, req: z.infer<typeof CompleteOnboardingRequest>): Promise<Me> {
    return this.db.transaction(async (tx) => {
      const user = await tx.query.users.findFirst({ where: eq(users.id, userId), columns: { onboardedAt: true } });
      if (!user) throw notFound("Account");
      if (user.onboardedAt) {
        throw new AppError(409, "already_onboarded", "You've already finished signing up.");
      }
      if (req.payout && !req.roles.includes("writer")) {
        throw new AppError(422, "payout_needs_writer", "Only writers can add a payout method.");
      }

      await this.updateProfile(
        userId,
        { name: req.name, handle: req.handle, country: req.country, bio: req.bio, timezone: req.timezone },
        tx,
      );
      await this.replaceRoles(userId, req.roles, tx);
      await this.updatePreferences(
        userId,
        { deliveryHour: req.deliveryHour, jokeOrigin: req.jokeOrigin, topics: req.topics },
        tx,
      );
      if (req.following.length) await this.creators.subscribeMany(userId, req.following, tx);
      if (req.payout) await this.setPayout(userId, req.payout, tx);
      await tx.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, userId));
      return this.getMe(userId, tx);
    });
  }

  async handleAvailability(handle: string, userId: string) {
    const h = handle.toLowerCase();
    const suggest = async () => {
      for (const candidate of [`${h}_jokes`, `${h}_dad`, `${h}${Math.floor(Math.random() * 90 + 10)}`]) {
        if (candidate.length <= 20 && !(await this.isTaken(candidate, userId))) return candidate;
      }
      return undefined;
    };
    if (!HANDLE_PATTERN.test(h)) return { handle: h, available: false, reason: "invalid" as const };
    if (RESERVED_HANDLES.has(h)) return { handle: h, available: false, reason: "reserved" as const, suggestion: await suggest() };
    if (await this.isTaken(h, userId)) return { handle: h, available: false, reason: "taken" as const, suggestion: await suggest() };
    return { handle: h, available: true };
  }

  listTopics() {
    return this.db.select({ slug: topics.slug, label: topics.label }).from(topics).orderBy(asc(topics.position));
  }

  private async isTaken(handle: string, userId: string, tx: Tx = this.db) {
    const row = await tx.query.users.findFirst({
      where: and(eq(users.handle, handle), ne(users.id, userId)),
      columns: { id: true },
    });
    return Boolean(row);
  }

  private async assertHandleFree(handle: string, userId: string, tx: Tx) {
    if (RESERVED_HANDLES.has(handle) || (await this.isTaken(handle, userId, tx))) throw handleTaken(handle);
  }

  private async assertTopicsExist(slugs: string[], tx: Tx) {
    if (!slugs.length) return;
    const found = await tx.select({ slug: topics.slug }).from(topics).where(inArray(topics.slug, slugs));
    const missing = slugs.filter((s) => !found.some((f) => f.slug === s));
    if (missing.length) {
      throw new AppError(422, "unknown_topic", "Some topics don't exist.", {
        errors: missing.map((m) => ({ path: "topics", message: `Unknown topic: ${m}` })),
      });
    }
  }
}
