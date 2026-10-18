import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { and, desc, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { AppError, notFound } from "../common/errors";
import { InjectDb } from "../db/db.module";
import type { Db } from "../db/db.module";
import { ruleSets, users, workflowRuns, workflowRunSteps, workflows, workflowVersions } from "../db/schema";
import type { Workflow, WorkflowRun } from "../db/schema";
import { AuditService } from "../platform/audit.service";
import { EVENT_TYPES } from "../platform/event-types";
import { USER_FACTS } from "../rules/catalog";
import { AUTOMATION_QUEUE } from "./engine.service";
import type { AutomationJob } from "./engine.service";
import { STEP_TYPES, WorkflowGraph, emptyGraph } from "./model";
import type { CreateWorkflowRequest, RunsQuery, UpdateWorkflowDraftRequest, WorkflowDetailOut, WorkflowRunOut } from "./schemas";
import { WORKFLOW_TEMPLATES } from "./templates";

/** Admin side of workflows: editing, publishing, pausing and looking at runs. Execution is in the worker. */
@Injectable()
export class AutomationService {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectQueue(AUTOMATION_QUEUE) private readonly queue: Queue<AutomationJob>,
    private readonly audit: AuditService,
  ) {}

  catalog() {
    return {
      triggers: Object.entries(EVENT_TYPES).map(([type, t]) => ({
        type,
        label: t.label,
        fields: Object.entries(t.fields).map(([name, ft]) => ({ name, type: ft })),
      })),
      steps: STEP_TYPES.map((s) => ({ ...s })),
      templates: WORKFLOW_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, triggerType: t.graph.trigger.type, stepCount: t.graph.steps.length })),
      userFacts: USER_FACTS.map(({ path, type, label }) => ({ path, type, label })),
    };
  }

  async stats() {
    const { rows } = await this.db.execute<{
      pending: number;
      waiting: number;
      runs: number;
      failed: number;
      messages: number;
      skipped: number;
    }>(sql`
      select
        (select count(*)::int from domain_events where processed_at is null) as pending,
        (select count(*)::int from workflow_runs where status = 'waiting') as waiting,
        (select count(*)::int from workflow_runs where started_at > now() - interval '24 hours') as runs,
        (select count(*)::int from workflow_runs where status = 'failed' and started_at > now() - interval '24 hours') as failed,
        (select count(*)::int from automation_messages where sent_at > now() - interval '24 hours') as messages,
        (select count(*)::int from workflow_run_steps where status = 'skipped' and at > now() - interval '24 hours') as skipped`);
    const r = rows[0];
    return { pendingEvents: r.pending, waitingRuns: r.waiting, runs24h: r.runs, failed24h: r.failed, messages24h: r.messages, skippedByPolicy24h: r.skipped };
  }

  async list() {
    const rows = await this.db
      .select({
        w: workflows,
        handle: users.handle,
        runs7d: sql<number>`(select count(*)::int from ${workflowRuns} r where r.workflow_id = ${workflows.id} and r.started_at > now() - interval '7 days')`,
        failed7d: sql<number>`(select count(*)::int from ${workflowRuns} r where r.workflow_id = ${workflows.id} and r.status = 'failed' and r.started_at > now() - interval '7 days')`,
        lastRunAt: sql<string | null>`(select max(started_at) from ${workflowRuns} r where r.workflow_id = ${workflows.id})`,
        live: sql<unknown>`(select v.graph from ${workflowVersions} v where v.workflow_id = ${workflows.id} and v.version = ${workflows.publishedVersion})`,
      })
      .from(workflows)
      .leftJoin(users, eq(users.id, workflows.updatedBy))
      .orderBy(desc(workflows.updatedAt));
    return { data: rows.map((r) => summary(r.w, r.handle, r.runs7d, r.failed7d, r.lastRunAt, r.live)) };
  }

  async get(id: string): Promise<WorkflowDetailOut> {
    const [r] = await this.db
      .select({
        w: workflows,
        handle: users.handle,
        runs7d: sql<number>`(select count(*)::int from ${workflowRuns} r where r.workflow_id = ${workflows.id} and r.started_at > now() - interval '7 days')`,
        failed7d: sql<number>`(select count(*)::int from ${workflowRuns} r where r.workflow_id = ${workflows.id} and r.status = 'failed' and r.started_at > now() - interval '7 days')`,
        lastRunAt: sql<string | null>`(select max(started_at) from ${workflowRuns} r where r.workflow_id = ${workflows.id})`,
        live: sql<unknown>`(select v.graph from ${workflowVersions} v where v.workflow_id = ${workflows.id} and v.version = ${workflows.publishedVersion})`,
      })
      .from(workflows)
      .leftJoin(users, eq(users.id, workflows.updatedBy))
      .where(eq(workflows.id, id));
    if (!r) throw notFound("Workflow");
    return {
      ...summary(r.w, r.handle, r.runs7d, r.failed7d, r.lastRunAt, r.live),
      revision: r.w.revision,
      draft: parseGraph(r.w.draft),
      liveTriggerType: r.w.triggerType,
    };
  }

  async create(actorId: string, req: CreateWorkflowRequest) {
    const template = req.templateKey ? WORKFLOW_TEMPLATES.find((t) => t.key === req.templateKey) : undefined;
    if (req.templateKey && !template) throw new AppError(422, "unknown_template", "That template doesn't exist.");
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(workflows)
        .values({
          name: req.name,
          description: req.description || template?.description || "",
          draft: template?.graph ?? emptyGraph(),
          templateKey: template?.key ?? null,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: workflows.id });
      await this.audit.record({ actorId, action: "workflow.created", targetType: "workflow", targetId: row.id, data: { name: req.name, template: req.templateKey ?? null } }, tx);
      return row.id;
    });
    return this.get(id);
  }

  async saveDraft(actorId: string, id: string, req: UpdateWorkflowDraftRequest) {
    const ids = req.draft.steps.map((s) => s.id);
    if (new Set(ids).size !== ids.length) throw new AppError(422, "duplicate_step_ids", "Two steps have the same id.");
    const [row] = await this.db
      .update(workflows)
      .set({ draft: req.draft, name: req.name, description: req.description, revision: req.revision + 1, updatedBy: actorId })
      .where(and(eq(workflows.id, id), eq(workflows.revision, req.revision)))
      .returning({ id: workflows.id });
    if (!row) {
      const [exists] = await this.db.select({ id: workflows.id }).from(workflows).where(eq(workflows.id, id));
      if (!exists) throw notFound("Workflow");
      throw new AppError(409, "stale_revision", "Someone else saved this workflow. Reload to see their changes.");
    }
    return this.get(id);
  }

  /** Checks the draft, freezes it as the next version and turns the workflow on. */
  async publish(actorId: string, id: string) {
    const w = await this.get(id);
    const problems = await this.check(w.draft);
    if (problems.length) return { published: false, version: null, problems };
    const version = await this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ version: workflowVersions.version })
        .from(workflowVersions)
        .where(eq(workflowVersions.workflowId, id))
        .orderBy(desc(workflowVersions.version))
        .limit(1);
      const next = (last?.version ?? 0) + 1;
      await tx.insert(workflowVersions).values({ workflowId: id, version: next, graph: w.draft, publishedBy: actorId });
      await tx
        .update(workflows)
        .set({ publishedVersion: next, triggerType: w.draft.trigger.type, status: "active", updatedBy: actorId })
        .where(eq(workflows.id, id));
      await this.audit.record({ actorId, action: "workflow.published", targetType: "workflow", targetId: id, data: { version: next } }, tx);
      return next;
    });
    return { published: true, version, problems: [] };
  }

  private async check(graph: WorkflowGraph) {
    const problems: string[] = [];
    if (!graph.steps.length) problems.push("Add at least one step.");
    const keys = [...new Set(graph.steps.flatMap((s) => (s.type === "decision" ? [s.ruleSetKey] : [])))];
    for (const key of keys) {
      const [r] = await this.db.select({ live: ruleSets.liveVersion, status: ruleSets.status }).from(ruleSets).where(eq(ruleSets.key, key));
      if (!r) problems.push(`The rule set ${key} doesn't exist.`);
      else if (!r.live || r.status === "archived") problems.push(`The rule set ${key} isn't published.`);
    }
    const last = graph.steps.at(-1);
    if (last && (last.type === "delay" || last.type === "wait_until_hour")) problems.push("The last step is a wait, so nothing happens after it.");
    if (graph.trigger.type === "manual" && !graph.steps.length) problems.push("A manual workflow needs steps.");
    return problems;
  }

  async setStatus(actorId: string, id: string, status: "active" | "paused") {
    const w = await this.get(id);
    if (status === "active" && !w.publishedVersion) throw new AppError(422, "not_published", "Publish the workflow first.");
    await this.db.transaction(async (tx) => {
      await tx.update(workflows).set({ status, updatedBy: actorId }).where(eq(workflows.id, id));
      await this.audit.record({ actorId, action: status === "active" ? "workflow.activated" : "workflow.paused", targetType: "workflow", targetId: id }, tx);
    });
    return this.get(id);
  }

  /** Throws away draft edits: the draft goes back to the published version. */
  async discardDraft(actorId: string, id: string) {
    const w = await this.get(id);
    if (!w.publishedVersion) throw new AppError(422, "not_published", "There's no published version to go back to.");
    const [v] = await this.db
      .select({ graph: workflowVersions.graph })
      .from(workflowVersions)
      .where(and(eq(workflowVersions.workflowId, id), eq(workflowVersions.version, w.publishedVersion)));
    await this.db.update(workflows).set({ draft: v.graph, revision: w.revision + 1, updatedBy: actorId }).where(eq(workflows.id, id));
    return this.get(id);
  }

  async remove(actorId: string, id: string) {
    const w = await this.get(id);
    if (w.status === "active") throw new AppError(422, "workflow_active", "Pause the workflow before deleting it.");
    await this.db.transaction(async (tx) => {
      await tx.delete(workflows).where(eq(workflows.id, id));
      await this.audit.record({ actorId, action: "workflow.deleted", targetType: "workflow", targetId: id, data: { name: w.name } }, tx);
    });
  }

  async versions(id: string) {
    const rows = await this.db
      .select({ v: workflowVersions, handle: users.handle })
      .from(workflowVersions)
      .leftJoin(users, eq(users.id, workflowVersions.publishedBy))
      .where(eq(workflowVersions.workflowId, id))
      .orderBy(desc(workflowVersions.version));
    return {
      data: rows.map(({ v, handle }) => {
        const g = parseGraph(v.graph);
        return { version: v.version, publishedAt: v.publishedAt.toISOString(), publishedBy: handle, triggerType: g.trigger.type, stepCount: g.steps.length };
      }),
    };
  }

  /** Copies a published version into the draft. */
  async restoreVersion(actorId: string, id: string, version: number) {
    const w = await this.get(id);
    const [v] = await this.db
      .select({ graph: workflowVersions.graph })
      .from(workflowVersions)
      .where(and(eq(workflowVersions.workflowId, id), eq(workflowVersions.version, version)));
    if (!v) throw notFound("Version");
    await this.db.update(workflows).set({ draft: v.graph, revision: w.revision + 1, updatedBy: actorId }).where(eq(workflows.id, id));
    return this.get(id);
  }

  async runs(q: RunsQuery, workflowId?: string) {
    const where: SQL[] = [];
    if (workflowId) where.push(eq(workflowRuns.workflowId, workflowId));
    if (q.status) where.push(eq(workflowRuns.status, q.status));
    const rows = await this.db
      .select({ r: workflowRuns, name: workflows.name, handle: users.handle, userName: users.name })
      .from(workflowRuns)
      .innerJoin(workflows, eq(workflows.id, workflowRuns.workflowId))
      .leftJoin(users, eq(users.id, workflowRuns.userId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(workflowRuns.startedAt))
      .limit(q.limit);
    return { data: rows.map((r) => toRun(r.r, r.name, r.handle, r.userName)) };
  }

  async run(runId: string) {
    const [r] = await this.db
      .select({ r: workflowRuns, name: workflows.name, handle: users.handle, userName: users.name })
      .from(workflowRuns)
      .innerJoin(workflows, eq(workflows.id, workflowRuns.workflowId))
      .leftJoin(users, eq(users.id, workflowRuns.userId))
      .where(eq(workflowRuns.id, runId));
    if (!r) throw notFound("Run");
    const steps = await this.db.select().from(workflowRunSteps).where(eq(workflowRunSteps.runId, runId)).orderBy(workflowRunSteps.at);
    const ctx = r.r.context as { event?: Record<string, unknown> };
    return {
      ...toRun(r.r, r.name, r.handle, r.userName),
      event: ctx.event ?? {},
      steps: steps.map((s) => ({ stepIndex: s.stepIndex, stepId: s.stepId, type: s.type, status: s.status, output: s.output, error: s.error, at: s.at.toISOString() })),
    };
  }

  /** Queues a run for one person; the worker picks it up within a second or two. */
  async start(actorId: string, id: string, userId: string, mode: "test" | "live") {
    const w = await this.get(id);
    if (mode === "live" && !w.publishedVersion) throw new AppError(422, "not_published", "Publish the workflow first, or run a test.");
    await this.queue.add("start", { name: "start", workflowId: id, userId, mode }, { removeOnComplete: true, removeOnFail: 100 });
    await this.audit.record({ actorId, action: `workflow.run_${mode}`, targetType: "workflow", targetId: id, data: { userId } });
    return { queued: true };
  }
}

function parseGraph(raw: unknown): WorkflowGraph {
  const r = WorkflowGraph.safeParse(raw);
  return r.success ? r.data : emptyGraph();
}

function summary(w: Workflow, handle: string | null, runs7d: number, failed7d: number, lastRunAt: string | null, live: unknown) {
  const draft = parseGraph(w.draft);
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    status: w.status,
    triggerType: draft.trigger.type,
    publishedVersion: w.publishedVersion,
    hasUnpublishedChanges: !w.publishedVersion || JSON.stringify(parseGraph(live)) !== JSON.stringify(draft),
    stepCount: draft.steps.length,
    runs7d,
    failed7d,
    lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
    updatedAt: w.updatedAt.toISOString(),
    updatedBy: handle,
  };
}

function toRun(r: WorkflowRun, workflowName: string, handle: string | null, name: string | null): WorkflowRunOut {
  const ctx = r.context as { eventType?: string; test?: boolean };
  return {
    id: r.id,
    workflowId: r.workflowId,
    workflowName,
    workflowVersion: r.workflowVersion,
    status: r.status,
    user: r.userId ? { id: r.userId, handle: handle ?? "", name: name ?? handle ?? "" } : null,
    eventType: ctx.eventType ?? "",
    stepIndex: r.stepIndex,
    resumeAt: r.resumeAt?.toISOString() ?? null,
    error: r.error,
    test: Boolean(ctx.test),
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}
