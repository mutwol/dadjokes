import { Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { ruleSets, ruleSetVersions, users } from "../db/schema";
import type { RuleSet } from "../db/schema";
import { AuditService } from "../platform/audit.service";
import { DECISION_POINTS, decisionPoint } from "./catalog";
import { evaluate, runTests } from "./engine";
import type { Evaluation } from "./engine";
import { RuleDefinition, emptyDefinition } from "./model";
import type { CreateRuleSetRequest, RuleSetDetailOut, UpdateRuleDraftRequest } from "./schemas";

/** How long a process trusts its copy of a live rule set. Publishing also clears it locally. */
const CACHE_MS = 15_000;

type Live = { version: number; definition: RuleDefinition; at: number } | null;

@Injectable()
export class RulesService {
  private cache = new Map<string, { live: Live; at: number }>();

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /* --------------------------------------------------------------- callers */

  /**
   * Evaluates the live version of a rule set. Returns null when it doesn't exist,
   * isn't published or is archived, so callers can fall back to a default.
   */
  async evaluateLive(key: string, facts: Record<string, unknown>): Promise<(Evaluation & { version: number }) | null> {
    const live = await this.live(key);
    if (!live) return null;
    return { ...evaluate(live.definition, facts), version: live.version };
  }

  private async live(key: string): Promise<Live> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.live;
    const [row] = await this.db
      .select({ version: ruleSetVersions.version, definition: ruleSetVersions.definition, status: ruleSets.status })
      .from(ruleSets)
      .innerJoin(ruleSetVersions, and(eq(ruleSetVersions.ruleSetId, ruleSets.id), eq(ruleSetVersions.version, ruleSets.liveVersion)))
      .where(eq(ruleSets.key, key));
    const parsed = row && row.status !== "archived" ? RuleDefinition.safeParse(row.definition) : null;
    const live: Live = parsed?.success ? { version: row!.version, definition: parsed.data, at: Date.now() } : null;
    this.cache.set(key, { live, at: Date.now() });
    return live;
  }

  /* ----------------------------------------------------------------- admin */

  decisionPoints() {
    return { data: DECISION_POINTS };
  }

  async list() {
    const rows = await this.db
      .select({ r: ruleSets, handle: users.handle })
      .from(ruleSets)
      .leftJoin(users, eq(users.id, ruleSets.updatedBy))
      .orderBy(ruleSets.key);
    const lives = await this.db.select().from(ruleSetVersions);
    return {
      data: rows.map(({ r, handle }) => {
        const live = lives.find((v) => v.ruleSetId === r.id && v.version === r.liveVersion);
        return summary(r, handle, live?.definition);
      }),
    };
  }

  async get(id: string): Promise<RuleSetDetailOut> {
    const [row] = await this.db
      .select({ r: ruleSets, handle: users.handle })
      .from(ruleSets)
      .leftJoin(users, eq(users.id, ruleSets.updatedBy))
      .where(eq(ruleSets.id, id));
    if (!row) throw notFound("Rule set");
    const [live] = row.r.liveVersion
      ? await this.db
          .select({ definition: ruleSetVersions.definition })
          .from(ruleSetVersions)
          .where(and(eq(ruleSetVersions.ruleSetId, id), eq(ruleSetVersions.version, row.r.liveVersion)))
      : [];
    return { ...summary(row.r, row.handle, live?.definition), revision: row.r.revision, draft: parseDef(row.r.draft) };
  }

  async create(actorId: string, req: CreateRuleSetRequest) {
    if (!decisionPoint(req.decisionPoint)) throw new AppError(422, "unknown_decision_point", "Pick one of the listed decision points.");
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(ruleSets)
        .values({ key: req.key, name: req.name, description: req.description, decisionPoint: req.decisionPoint, draft: emptyDefinition(), updatedBy: actorId })
        .onConflictDoNothing()
        .returning({ id: ruleSets.id });
      if (!row) throw new AppError(409, "rule_key_taken", "Another rule set already uses that key.");
      await this.audit.record({ actorId, action: "rule_set.created", targetType: "rule_set", targetId: row.id, data: { key: req.key } }, tx);
      return row.id;
    });
    return this.get(id);
  }

  async saveDraft(actorId: string, id: string, req: UpdateRuleDraftRequest) {
    const [row] = await this.db
      .update(ruleSets)
      .set({
        draft: req.draft,
        name: req.name,
        description: req.description,
        revision: req.revision + 1,
        updatedBy: actorId,
      })
      .where(and(eq(ruleSets.id, id), eq(ruleSets.revision, req.revision)))
      .returning({ id: ruleSets.id });
    if (!row) {
      const [exists] = await this.db.select({ id: ruleSets.id }).from(ruleSets).where(eq(ruleSets.id, id));
      if (!exists) throw notFound("Rule set");
      throw new AppError(409, "stale_revision", "Someone else saved this rule set. Reload to see their changes.");
    }
    return this.get(id);
  }

  async evaluateDraft(id: string, facts: Record<string, unknown>, source: "draft" | "live", definition?: RuleDefinition) {
    const r = await this.get(id);
    if (source === "live") {
      const live = await this.live(r.key);
      if (!live) throw new AppError(422, "not_published", "This rule set has no live version yet.");
      return { ...evaluate(live.definition, facts), version: live.version };
    }
    return { ...evaluate(definition ?? r.draft, facts), version: null };
  }

  async test(id: string, definition?: RuleDefinition) {
    const r = await this.get(id);
    return runTests(definition ?? r.draft);
  }

  /** Runs the tests and, if they all pass, freezes the draft as the next live version. */
  async publish(actorId: string, id: string) {
    const r = await this.get(id);
    const tests = runTests(r.draft);
    if (!tests.passed) return { published: false, version: null, tests };
    const version = await this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ version: ruleSetVersions.version })
        .from(ruleSetVersions)
        .where(eq(ruleSetVersions.ruleSetId, id))
        .orderBy(desc(ruleSetVersions.version))
        .limit(1);
      const next = (last?.version ?? 0) + 1;
      await tx.insert(ruleSetVersions).values({ ruleSetId: id, version: next, definition: r.draft, publishedBy: actorId });
      await tx.update(ruleSets).set({ liveVersion: next, status: "published", updatedBy: actorId }).where(eq(ruleSets.id, id));
      await this.audit.record({ actorId, action: "rule_set.published", targetType: "rule_set", targetId: id, data: { key: r.key, version: next } }, tx);
      return next;
    });
    this.cache.delete(r.key);
    return { published: true, version, tests };
  }

  async setArchived(actorId: string, id: string, archived: boolean) {
    const r = await this.get(id);
    if (archived && r.system) throw new AppError(422, "system_rule_set", "The app relies on this rule set, so it can't be archived. Edit it instead.");
    await this.db.transaction(async (tx) => {
      await tx
        .update(ruleSets)
        .set({ status: archived ? "archived" : r.liveVersion ? "published" : "draft", updatedBy: actorId })
        .where(eq(ruleSets.id, id));
      await this.audit.record({ actorId, action: archived ? "rule_set.archived" : "rule_set.restored", targetType: "rule_set", targetId: id, data: { key: r.key } }, tx);
    });
    this.cache.delete(r.key);
    return this.get(id);
  }

  async versions(id: string) {
    const rows = await this.db
      .select({ v: ruleSetVersions, handle: users.handle })
      .from(ruleSetVersions)
      .leftJoin(users, eq(users.id, ruleSetVersions.publishedBy))
      .where(eq(ruleSetVersions.ruleSetId, id))
      .orderBy(desc(ruleSetVersions.version));
    return {
      data: rows.map(({ v, handle }) => ({
        version: v.version,
        publishedAt: v.publishedAt.toISOString(),
        publishedBy: handle,
        ruleCount: parseDef(v.definition).rules.length,
      })),
    };
  }

  async version(id: string, version: number) {
    const [row] = await this.db
      .select({ v: ruleSetVersions, handle: users.handle })
      .from(ruleSetVersions)
      .leftJoin(users, eq(users.id, ruleSetVersions.publishedBy))
      .where(and(eq(ruleSetVersions.ruleSetId, id), eq(ruleSetVersions.version, version)));
    if (!row) throw notFound("Version");
    return { version: row.v.version, publishedAt: row.v.publishedAt.toISOString(), publishedBy: row.handle, definition: parseDef(row.v.definition) };
  }

  /** Copies an old version into the draft. Publish to make it live again. */
  async restoreVersion(actorId: string, id: string, version: number) {
    const v = await this.version(id, version);
    await this.db
      .update(ruleSets)
      .set({ draft: v.definition, revision: sqlIncrement(), updatedBy: actorId })
      .where(eq(ruleSets.id, id));
    return this.get(id);
  }
}

const sqlIncrement = () => sql`${ruleSets.revision} + 1`;

function parseDef(raw: unknown): RuleDefinition {
  const r = RuleDefinition.safeParse(raw);
  return r.success ? r.data : emptyDefinition();
}

function summary(r: RuleSet, handle: string | null, liveDefinition: unknown) {
  const draft = parseDef(r.draft);
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    decisionPoint: r.decisionPoint,
    system: r.system,
    status: r.status,
    liveVersion: r.liveVersion,
    ruleCount: draft.rules.length,
    testCount: draft.tests.length,
    hasUnpublishedChanges: !r.liveVersion || JSON.stringify(parseDef(liveDefinition)) !== JSON.stringify(draft),
    updatedAt: r.updatedAt.toISOString(),
    updatedBy: handle,
  };
}
