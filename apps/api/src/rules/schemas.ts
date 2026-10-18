import { z } from "zod";
import { named } from "../common/zod";
import { RuleDefinition } from "./model";

const FactType = z.enum(["number", "text", "boolean", "list", "date"]);

export const DecisionPointSchema = named(
  "DecisionPoint",
  z.object({
    key: z.string(),
    label: z.string(),
    description: z.string(),
    facts: z.array(z.object({ path: z.string(), type: FactType, label: z.string(), example: z.unknown().optional() })),
    outputs: z.array(z.object({ key: z.string(), type: FactType, label: z.string() })),
  }),
  "Somewhere in the app that asks a rule set for a decision, and the facts it provides.",
);
export const DecisionPointListSchema = named("DecisionPointList", z.object({ data: z.array(DecisionPointSchema) }));

export const RuleSetSummarySchema = named(
  "RuleSetSummary",
  z.object({
    id: z.uuid(),
    key: z.string(),
    name: z.string(),
    description: z.string(),
    decisionPoint: z.string(),
    system: z.boolean().describe("Used by the app itself; can be edited but not archived."),
    status: z.enum(["draft", "published", "archived"]),
    liveVersion: z.number().int().describe("0 until first published."),
    ruleCount: z.number().int(),
    testCount: z.number().int(),
    hasUnpublishedChanges: z.boolean(),
    updatedAt: z.iso.datetime(),
    updatedBy: z.string().nullable().describe("Handle of whoever saved it last."),
  }),
);
export const RuleSetListSchema = named("RuleSetList", z.object({ data: z.array(RuleSetSummarySchema) }));

export const RuleSetDetailSchema = named(
  "RuleSetDetail",
  RuleSetSummarySchema.extend({
    revision: z.number().int().describe("Send it back when saving, so two people can't overwrite each other."),
    draft: RuleDefinition,
  }),
);
export type RuleSetDetailOut = z.infer<typeof RuleSetDetailSchema>;

const RuleKey = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/, "Use a dotted key like crm.engagement_tier.");

export const CreateRuleSetRequest = named(
  "CreateRuleSetRequest",
  z.object({
    key: RuleKey,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    decisionPoint: z.string().min(1),
  }),
);
export type CreateRuleSetRequest = z.infer<typeof CreateRuleSetRequest>;

export const UpdateRuleDraftRequest = named(
  "UpdateRuleDraftRequest",
  z.object({
    revision: z.number().int(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    draft: RuleDefinition,
  }),
);
export type UpdateRuleDraftRequest = z.infer<typeof UpdateRuleDraftRequest>;

const ConditionTrace = z.object({
  id: z.string(),
  field: z.string(),
  op: z.string(),
  left: z.unknown(),
  right: z.unknown(),
  result: z.boolean(),
});

export const EvaluationSchema = named(
  "RuleEvaluation",
  z.object({
    version: z.number().int().nullable().describe("The version evaluated; null for the draft."),
    matched: z.array(z.string()),
    outputs: z.record(z.string(), z.unknown()),
    usedDefault: z.boolean(),
    trace: z.array(
      z.object({ ruleId: z.string(), name: z.string(), enabled: z.boolean(), matched: z.boolean(), conditions: z.array(ConditionTrace) }),
    ),
  }),
  "What a rule set decided, and why: each rule and condition with the values it compared.",
);

export const EvaluateRequest = named(
  "EvaluateRuleSetRequest",
  z.object({
    facts: z.record(z.string(), z.unknown()),
    source: z.enum(["draft", "live"]).default("draft"),
    /** Evaluate this definition instead of the saved draft (unsaved edits in the builder). */
    definition: RuleDefinition.optional(),
  }),
);
export type EvaluateRequest = z.infer<typeof EvaluateRequest>;

export const TestReportSchema = named(
  "RuleTestReport",
  z.object({
    passed: z.boolean(),
    results: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        passed: z.boolean(),
        outputs: z.record(z.string(), z.unknown()),
        failures: z.record(z.string(), z.object({ expected: z.unknown(), actual: z.unknown() })),
      }),
    ),
  }),
);

export const RunTestsRequest = named("RunRuleTestsRequest", z.object({ definition: RuleDefinition.optional() }));

export const PublishResultSchema = named(
  "RulePublishResult",
  z.object({
    published: z.boolean().describe("False when a test failed; nothing changed then."),
    version: z.number().int().nullable(),
    tests: TestReportSchema,
  }),
);

export const RuleVersionListSchema = named(
  "RuleVersionList",
  z.object({
    data: z.array(z.object({ version: z.number().int(), publishedAt: z.iso.datetime(), publishedBy: z.string().nullable(), ruleCount: z.number().int() })),
  }),
);

export const RuleVersionSchema = named(
  "RuleVersion",
  z.object({ version: z.number().int(), publishedAt: z.iso.datetime(), publishedBy: z.string().nullable(), definition: RuleDefinition }),
);
