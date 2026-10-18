import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Queue } from "bullmq";
import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import {
  automationMessages,
  domainEvents,
  userRoles,
  userTags,
  workflowRuns,
  workflowRunSteps,
  workflows,
  workflowVersions,
} from "../db/schema";
import type { WorkflowRun } from "../db/schema";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EventsService } from "../platform/events.service";
import { evaluate, interpolate } from "../rules/engine";
import { RulesService } from "../rules/rules.service";
import { loadUserFacts, nextLocalHour } from "./facts";
import type { UserFacts } from "./facts";
import { WorkflowGraph } from "./model";
import type { WorkflowStep } from "./model";

export const AUTOMATION_QUEUE = "automation";

export type AutomationJob =
  | { name: "drain" }
  | { name: "sweep" }
  | { name: "scan" }
  | { name: "resume"; runId: string }
  | { name: "start"; workflowId: string; userId: string; mode: "test" | "live" };

/** Events handled per drain, so a backlog is worked through in steady batches. */
const DRAIN_BATCH = 200;
/** Stops a broken workflow from looping: no run may execute more steps than this. */
const MAX_STEPS_PER_RUN = 60;

type RunContext = {
  event: Record<string, unknown>;
  eventType: string;
  decision?: Record<string, unknown>;
  decisions?: Record<string, Record<string, unknown>>;
  /** Test runs use the draft and skip waits. */
  test?: boolean;
  graph?: WorkflowGraph;
};

type StepResult =
  | { status: "ok"; output?: unknown }
  | { status: "stopped"; output?: unknown }
  | { status: "skipped"; output?: unknown }
  | { status: "waiting"; resumeAt: Date; output?: unknown };

/**
 * Runs workflows in the worker. It reads the event outbox, starts a run for
 * each matching active workflow, and executes steps until the run finishes or
 * waits. Waits are durable: the run is saved as waiting with a resume time and
 * a delayed job, and a minute-by-minute sweep resumes any job that went missing.
 */
@Injectable()
export class AutomationEngine {
  private readonly logger = new Logger(AutomationEngine.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @InjectQueue(AUTOMATION_QUEUE) private readonly queue: Queue<AutomationJob>,
    private readonly rules: RulesService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly events: EventsService,
  ) {}

  /* --------------------------------------------------------------- events */

  async drain() {
    const pending = await this.db
      .select()
      .from(domainEvents)
      .where(isNull(domainEvents.processedAt))
      .orderBy(asc(domainEvents.id))
      .limit(DRAIN_BATCH);
    if (!pending.length) return 0;

    const types = [...new Set(pending.map((e) => e.type))];
    const active = await this.db
      .select({ id: workflows.id, triggerType: workflows.triggerType, version: workflows.publishedVersion, graph: workflowVersions.graph })
      .from(workflows)
      .innerJoin(workflowVersions, and(eq(workflowVersions.workflowId, workflows.id), eq(workflowVersions.version, workflows.publishedVersion)))
      .where(and(eq(workflows.status, "active"), inArray(workflows.triggerType, types)));

    let started = 0;
    for (const event of pending) {
      for (const wf of active.filter((w) => w.triggerType === event.type)) {
        const graph = WorkflowGraph.safeParse(wf.graph);
        if (!graph.success) continue;
        try {
          const runId = await this.startRun(wf.id, wf.version, graph.data, {
            eventId: event.id,
            userId: event.userId,
            event: event.payload,
            eventType: event.type,
          });
          if (runId) started++;
        } catch (e) {
          this.logger.error(`Couldn't start workflow ${wf.id} for event ${event.id}: ${(e as Error).message}`);
        }
      }
      await this.db.update(domainEvents).set({ processedAt: new Date() }).where(eq(domainEvents.id, event.id));
    }
    return started;
  }

  /**
   * Checks the trigger's conditions, then creates the run and starts it.
   * Returns null when the conditions don't hold or the event already started this workflow.
   */
  async startRun(
    workflowId: string,
    version: number,
    graph: WorkflowGraph,
    input: { eventId?: number | null; userId?: string | null; event: Record<string, unknown>; eventType: string; test?: boolean },
  ) {
    const user = input.userId ? await loadUserFacts(this.db, input.userId) : null;
    if (graph.trigger.when) {
      const facts = this.facts({ event: input.event, eventType: input.eventType }, user);
      const ok = evaluate({ hitPolicy: "first", rules: [{ id: "trigger", name: "", enabled: true, when: graph.trigger.when, then: [] }], default: [], tests: [] }, facts);
      if (!ok.matched.length) return null;
    }
    const context: RunContext = { event: input.event, eventType: input.eventType, test: input.test, graph: input.test ? graph : undefined };
    const [run] = await this.db
      .insert(workflowRuns)
      .values({ workflowId, workflowVersion: version, eventId: input.eventId ?? null, userId: input.userId ?? null, context })
      .onConflictDoNothing()
      .returning();
    if (!run) return null;
    await this.advance(run);
    return run.id;
  }

  /** A test or manual run for one person, from the admin console. */
  async startManual(workflowId: string, userId: string, mode: "test" | "live") {
    const [wf] = await this.db.select().from(workflows).where(eq(workflows.id, workflowId));
    if (!wf) return null;
    let graph: WorkflowGraph;
    let version = 0;
    if (mode === "test") {
      graph = WorkflowGraph.parse(wf.draft);
    } else {
      const [v] = await this.db
        .select()
        .from(workflowVersions)
        .where(and(eq(workflowVersions.workflowId, workflowId), eq(workflowVersions.version, wf.publishedVersion)));
      if (!v) return null;
      graph = WorkflowGraph.parse(v.graph);
      version = v.version;
    }
    return this.startRun(workflowId, version, graph, { userId, event: { manual: true }, eventType: "manual", test: mode === "test" });
  }

  /* ----------------------------------------------------------------- runs */

  async resume(runId: string) {
    // Claim it, so a delayed job and the sweep can't both resume the same run.
    const [run] = await this.db
      .update(workflowRuns)
      .set({ status: "running", resumeAt: null })
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.status, "waiting"), lte(workflowRuns.resumeAt, new Date(Date.now() + 1000))))
      .returning();
    if (run) await this.advance(run);
  }

  /** Every minute: resume waits whose job went missing (e.g. Redis was flushed). */
  async sweep() {
    const due = await this.db
      .select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(and(eq(workflowRuns.status, "waiting"), lte(workflowRuns.resumeAt, new Date(Date.now() - 60_000))))
      .limit(200);
    for (const r of due) await this.resume(r.id);
    return due.length;
  }

  private async graphFor(run: WorkflowRun): Promise<WorkflowGraph | null> {
    const ctx = run.context as RunContext;
    if (ctx.graph) return WorkflowGraph.parse(ctx.graph);
    const [v] = await this.db
      .select({ graph: workflowVersions.graph })
      .from(workflowVersions)
      .where(and(eq(workflowVersions.workflowId, run.workflowId), eq(workflowVersions.version, run.workflowVersion)));
    const parsed = v ? WorkflowGraph.safeParse(v.graph) : null;
    return parsed?.success ? parsed.data : null;
  }

  /** Runs steps from the run's current position until it ends or waits. */
  private async advance(run: WorkflowRun) {
    const graph = await this.graphFor(run);
    if (!graph) {
      await this.finish(run.id, "failed", "The workflow version is missing or invalid.");
      return;
    }
    const ctx = run.context as RunContext;
    let index = run.stepIndex;
    let executed = 0;
    while (index < graph.steps.length) {
      if (++executed > MAX_STEPS_PER_RUN) {
        await this.finish(run.id, "failed", "Too many steps in one go.");
        return;
      }
      const step = graph.steps[index];
      const user = run.userId ? await loadUserFacts(this.db, run.userId) : null;
      let result: StepResult;
      try {
        result = await this.execute(step, run, ctx, user);
      } catch (e) {
        const message = (e as Error).message.slice(0, 500);
        await this.log(run.id, index, step, "failed", null, message);
        await this.finish(run.id, "failed", message, index);
        return;
      }
      await this.log(run.id, index, step, result.status, result.output ?? null);
      index++;
      if (result.status === "stopped") {
        await this.finish(run.id, "stopped", null, index, ctx);
        return;
      }
      if (result.status === "waiting") {
        const delay = Math.max(0, result.resumeAt.getTime() - Date.now());
        await this.db
          .update(workflowRuns)
          .set({ status: "waiting", stepIndex: index, resumeAt: result.resumeAt, context: ctx })
          .where(eq(workflowRuns.id, run.id));
        await this.queue.add("resume", { name: "resume", runId: run.id }, { delay, jobId: `resume-${run.id}-${index}`, removeOnComplete: true, removeOnFail: 100 });
        return;
      }
      await this.db.update(workflowRuns).set({ stepIndex: index, context: ctx }).where(eq(workflowRuns.id, run.id));
    }
    await this.finish(run.id, "completed", null, index, ctx);
  }

  private async finish(runId: string, status: "completed" | "stopped" | "failed", error: string | null, stepIndex?: number, ctx?: RunContext) {
    await this.db
      .update(workflowRuns)
      .set({ status, error, finishedAt: new Date(), resumeAt: null, ...(stepIndex !== undefined ? { stepIndex } : {}), ...(ctx ? { context: ctx } : {}) })
      .where(eq(workflowRuns.id, runId));
  }

  private async log(runId: string, stepIndex: number, step: WorkflowStep, status: string, output: unknown, error?: string) {
    await this.db.insert(workflowRunSteps).values({ runId, stepIndex, stepId: step.id, type: step.type, status, output: output ?? null, error: error ?? null });
  }

  /** Facts for conditions and templates: user.*, event.*, decision.* and now.*. */
  private facts(ctx: Pick<RunContext, "event" | "eventType" | "decision" | "decisions">, user: UserFacts | null) {
    return {
      user: user ?? {},
      event: { ...ctx.event, type: ctx.eventType },
      decision: ctx.decision ?? {},
      decisions: ctx.decisions ?? {},
      now: { iso: new Date().toISOString() },
    };
  }

  /* ---------------------------------------------------------------- steps */

  private async execute(step: WorkflowStep, run: WorkflowRun, ctx: RunContext, user: UserFacts | null): Promise<StepResult> {
    const facts = this.facts(ctx, user);
    const fill = (text: string) => interpolate(text, facts);

    switch (step.type) {
      case "filter": {
        const r = evaluate({ hitPolicy: "first", rules: [{ id: step.id, name: step.name, enabled: true, when: step.when, then: [] }], default: [], tests: [] }, facts);
        const pass = r.matched.length > 0;
        return { status: pass ? "ok" : "stopped", output: { passed: pass, conditions: r.trace[0]?.conditions ?? [] } };
      }
      case "decision": {
        const r = await this.rules.evaluateLive(step.ruleSetKey, facts);
        if (!r) throw new Error(`Rule set ${step.ruleSetKey} has no live version.`);
        ctx.decision = r.outputs;
        ctx.decisions = { ...(ctx.decisions ?? {}), [step.id]: r.outputs };
        const output = { version: r.version, matched: r.matched, outputs: r.outputs };
        if (step.stopUnlessMatched && r.usedDefault) return { status: "stopped", output };
        return { status: "ok", output };
      }
      case "delay": {
        if (ctx.test) return { status: "ok", output: { skipped: "Test runs don't wait." } };
        return { status: "waiting", resumeAt: new Date(Date.now() + step.minutes * 60_000), output: { minutes: step.minutes } };
      }
      case "wait_until_hour": {
        if (ctx.test) return { status: "ok", output: { skipped: "Test runs don't wait." } };
        const at = nextLocalHour(user?.timezone ?? "UTC", step.hour);
        if (at.getTime() <= Date.now() + 1000) return { status: "ok", output: { alreadyThatHour: true } };
        return { status: "waiting", resumeAt: at, output: { until: at.toISOString() } };
      }
      case "send_push":
      case "send_email":
      case "notify": {
        if (!user) return { status: "skipped", output: { reason: "This event isn't about a person." } };
        const channel = step.type === "send_push" ? "push" : step.type === "send_email" ? "email" : "activity";
        const policy = await this.sendPolicy(channel, run.workflowId, user);
        if (!policy.allow) return { status: "skipped", output: { reason: policy.reason, policyVersion: policy.version } };
        let title: string;
        if (step.type === "send_email") {
          title = fill(step.subject);
          const body = `${fill(step.body)}\n\n—\nYou get emails like this because you use Daddy Jokes. Change what you get in your profile.`;
          await this.mail.sendMessage({ to: user.email, subject: title, text: body });
        } else if (step.type === "send_push") {
          title = fill(step.title);
          await this.notifications.sendPush(user.id, { title, body: fill(step.body) || null, url: fill(step.url) || "/", tag: `wf-${run.workflowId}` });
        } else {
          title = fill(step.title);
          await this.notifications.notify({
            userId: user.id,
            type: "automation",
            data: { title, body: fill(step.body) || null, url: fill(step.url) || "/" },
            dedupeKey: `wf:${run.id}:${step.id}`,
          });
        }
        await this.db.insert(automationMessages).values({ userId: user.id, workflowId: run.workflowId, runId: run.id, channel, title });
        return { status: "ok", output: { channel, title, to: channel === "email" ? user.email : user.handle } };
      }
      case "add_tag":
      case "remove_tag": {
        if (!user) return { status: "skipped", output: { reason: "This event isn't about a person." } };
        if (step.type === "add_tag") {
          await this.db.insert(userTags).values({ userId: user.id, tag: step.tag }).onConflictDoNothing();
        } else {
          await this.db.delete(userTags).where(and(eq(userTags.userId, user.id), eq(userTags.tag, step.tag)));
        }
        return { status: "ok", output: { tag: step.tag } };
      }
      case "alert_staff": {
        const staff = await this.db.selectDistinct({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, ["curator", "admin"]));
        for (const s of staff) {
          await this.notifications.notify({
            userId: s.id,
            type: "automation",
            data: { title: fill(step.title), body: fill(step.body) || null, url: fill(step.url) || "/admin" },
            dedupeKey: `wf:${run.id}:${step.id}`,
          });
        }
        return { status: "ok", output: { alerted: staff.length } };
      }
    }
  }

  /** Asks automation.send_policy whether this message may go out. */
  private async sendPolicy(channel: string, workflowId: string, user: UserFacts) {
    const [counts] = (
      await this.db.execute<{ day: number; week: number; same: number }>(sql`
        select count(*) filter (where sent_at > now() - interval '24 hours')::int as day,
               count(*)::int as week,
               count(*) filter (where workflow_id = ${workflowId})::int as same
        from ${automationMessages}
        where user_id = ${user.id} and sent_at > now() - interval '7 days'`)
    ).rows;
    const facts = {
      channel,
      sentLast24h: counts.day,
      sentLast7d: counts.week,
      sameWorkflowLast7d: counts.same,
      localHour: user.localHour,
      user: { tags: user.tags, roles: user.roles },
    };
    const r = await this.rules.evaluateLive("automation.send_policy", facts);
    if (!r) {
      // No live policy: keep the same promise in code.
      const quiet = user.localHour < 7 || user.localHour >= 21;
      if (quiet) return { allow: false, reason: "Quiet hours", version: null };
      if (counts.day >= 2) return { allow: false, reason: "Daily cap", version: null };
      return { allow: true, reason: null, version: null };
    }
    return { allow: r.outputs.allow !== false, reason: typeof r.outputs.reason === "string" ? r.outputs.reason : "Blocked by the send policy", version: r.version };
  }

  /* --------------------------------------------------------------- scans */

  /**
   * Every ten minutes: turn delivery states into events. A joke still sealed
   * ten hours after it arrived is "unopened"; one that expired unopened is "missed".
   */
  async scanDeliveries() {
    const unopened = await this.db.execute<{ user_id: string; local_date: string; joke_id: string; hours_left: number }>(sql`
      select d.user_id, d.local_date::text, d.joke_id,
             floor(extract(epoch from (d.expires_at - now())) / 3600)::int as hours_left
      from deliveries d
      where d.opened_at is null and d.expires_at > now()
        and d.delivered_at < now() - interval '10 hours' and d.delivered_at > now() - interval '24 hours'
      limit 5000`);
    for (const r of unopened.rows) {
      await this.events.emit({
        type: "delivery.unopened",
        userId: r.user_id,
        payload: { jokeId: r.joke_id, date: r.local_date, hoursLeft: r.hours_left },
        dedupeKey: `unopened:${r.user_id}:${r.local_date}`,
      });
    }
    const missed = await this.db.execute<{ user_id: string; local_date: string; joke_id: string; in_a_row: number }>(sql`
      select d.user_id, d.local_date::text, d.joke_id,
        (select count(*)::int from (
           select sum(case when x.opened_at is not null then 1 else 0 end)
                    over (order by x.local_date desc rows unbounded preceding) as opened_since
           from deliveries x
           where x.user_id = d.user_id and x.local_date <= d.local_date and x.local_date > d.local_date - 60
         ) recent where recent.opened_since = 0) as in_a_row
      from deliveries d
      where d.opened_at is null and d.expires_at <= now() and d.expires_at > now() - interval '6 hours'
      limit 5000`);
    for (const r of missed.rows) {
      await this.events.emit({
        type: "delivery.missed",
        userId: r.user_id,
        payload: { jokeId: r.joke_id, date: r.local_date, missedInARow: r.in_a_row },
        dedupeKey: `missed:${r.user_id}:${r.local_date}`,
      });
    }
    return { unopened: unopened.rows.length, missed: missed.rows.length };
  }
}
