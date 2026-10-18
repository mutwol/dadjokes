import { z } from "zod";
import { named } from "../common/zod";
import { WorkflowGraph } from "./model";

const FieldType = z.enum(["number", "text", "boolean", "list", "date"]);

export const AutomationCatalogSchema = named(
  "AutomationCatalog",
  z.object({
    triggers: z.array(z.object({ type: z.string(), label: z.string(), fields: z.array(z.object({ name: z.string(), type: FieldType })) })),
    steps: z.array(z.object({ type: z.string(), category: z.string(), label: z.string(), description: z.string() })),
    templates: z.array(z.object({ key: z.string(), name: z.string(), description: z.string(), triggerType: z.string(), stepCount: z.number().int() })),
    userFacts: z.array(z.object({ path: z.string(), type: FieldType, label: z.string() })),
  }),
  "What the workflow editor can offer: triggers, step types, templates and the facts known about people.",
);

export const WorkflowSummarySchema = named(
  "WorkflowSummary",
  z.object({
    id: z.uuid(),
    name: z.string(),
    description: z.string(),
    status: z.enum(["draft", "active", "paused"]),
    triggerType: z.string().describe("The draft's trigger."),
    publishedVersion: z.number().int(),
    hasUnpublishedChanges: z.boolean(),
    stepCount: z.number().int(),
    runs7d: z.number().int(),
    failed7d: z.number().int(),
    lastRunAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
    updatedBy: z.string().nullable(),
  }),
);
export const WorkflowListSchema = named("WorkflowList", z.object({ data: z.array(WorkflowSummarySchema) }));

export const WorkflowDetailSchema = named(
  "WorkflowDetail",
  WorkflowSummarySchema.extend({
    revision: z.number().int(),
    draft: WorkflowGraph,
    liveTriggerType: z.string().nullable(),
  }),
);
export type WorkflowDetailOut = z.infer<typeof WorkflowDetailSchema>;

export const CreateWorkflowRequest = named(
  "CreateWorkflowRequest",
  z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    templateKey: z.string().optional(),
  }),
);
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequest>;

export const UpdateWorkflowDraftRequest = named(
  "UpdateWorkflowDraftRequest",
  z.object({
    revision: z.number().int(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    draft: WorkflowGraph,
  }),
);
export type UpdateWorkflowDraftRequest = z.infer<typeof UpdateWorkflowDraftRequest>;

export const WorkflowPublishResultSchema = named(
  "WorkflowPublishResult",
  z.object({
    published: z.boolean(),
    version: z.number().int().nullable(),
    problems: z.array(z.string()).describe("Why it couldn't be published."),
  }),
);

export const WorkflowVersionListSchema = named(
  "WorkflowVersionList",
  z.object({ data: z.array(z.object({ version: z.number().int(), publishedAt: z.iso.datetime(), publishedBy: z.string().nullable(), triggerType: z.string(), stepCount: z.number().int() })) }),
);

const RunStatus = z.enum(["running", "waiting", "completed", "stopped", "failed"]);

export const WorkflowRunSchema = named(
  "WorkflowRun",
  z.object({
    id: z.uuid(),
    workflowId: z.uuid(),
    workflowName: z.string(),
    workflowVersion: z.number().int().describe("0 for test runs of the draft."),
    status: RunStatus,
    user: z.object({ id: z.uuid(), handle: z.string(), name: z.string() }).nullable(),
    eventType: z.string(),
    stepIndex: z.number().int(),
    resumeAt: z.iso.datetime().nullable(),
    error: z.string().nullable(),
    test: z.boolean(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
  }),
);
export type WorkflowRunOut = z.infer<typeof WorkflowRunSchema>;

export const WorkflowRunListSchema = named("WorkflowRunList", z.object({ data: z.array(WorkflowRunSchema) }));

export const WorkflowRunDetailSchema = named(
  "WorkflowRunDetail",
  WorkflowRunSchema.extend({
    event: z.record(z.string(), z.unknown()),
    steps: z.array(
      z.object({
        stepIndex: z.number().int(),
        stepId: z.string(),
        type: z.string(),
        status: z.string(),
        output: z.unknown(),
        error: z.string().nullable(),
        at: z.iso.datetime(),
      }),
    ),
  }),
);

export const RunsQuery = z.object({
  status: RunStatus.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type RunsQuery = z.infer<typeof RunsQuery>;

export const StartRunRequest = named(
  "StartWorkflowRunRequest",
  z.object({
    userId: z.uuid().optional().describe("Who to run it for. Defaults to you."),
    mode: z.enum(["test", "live"]).default("test").describe("test runs the draft and skips waits; live runs the published version."),
  }),
);
export type StartRunRequest = z.infer<typeof StartRunRequest>;

export const AutomationStatsSchema = named(
  "AutomationStats",
  z.object({
    pendingEvents: z.number().int(),
    waitingRuns: z.number().int(),
    runs24h: z.number().int(),
    failed24h: z.number().int(),
    messages24h: z.number().int(),
    skippedByPolicy24h: z.number().int(),
  }),
);
