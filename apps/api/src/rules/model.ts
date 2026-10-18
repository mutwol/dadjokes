import { z } from "zod";
import { named } from "../common/zod";

/*
 * The rule model, stored as JSON in rule_sets.draft and rule_set_versions.definition.
 * We own this model; the evaluator in engine.ts interprets it directly. Every
 * condition is data (field, operator, value), so the admin builder can edit it
 * and nothing a rule author writes is ever executed as code.
 */

export const OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "in",
  "not_in",
  "contains",
  "not_contains",
  "starts_with",
  "starts_with_any",
  "ends_with",
  "is_empty",
  "is_not_empty",
  "is_true",
  "is_false",
] as const;
export const Operator = z.enum(OPERATORS);
export type Operator = z.infer<typeof Operator>;

/** Operators that take no value. */
export const UNARY_OPERATORS: readonly Operator[] = ["is_empty", "is_not_empty", "is_true", "is_false"];

const FactPath = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/, "Use a fact path like user.streak.");

/** Compare with another fact instead of a literal: `{ "ref": "item.reorder_point" }`. */
export const ValueRef = z.object({ ref: FactPath });

export const Condition = named(
  "RuleCondition",
  z.object({
    kind: z.literal("condition"),
    id: z.string().min(1).max(40),
    field: FactPath,
    op: Operator,
    value: z.unknown().optional().describe("A literal (number, text, true/false, a list), or { ref } to another fact."),
  }),
);
export type Condition = z.infer<typeof Condition>;

export interface Group {
  kind: "group";
  id: string;
  match: "all" | "any" | "none";
  items: (Condition | Group)[];
}

export const Group: z.ZodType<Group> = named(
  "RuleGroup",
  z.object({
    kind: z.literal("group"),
    id: z.string().min(1).max(40),
    match: z.enum(["all", "any", "none"]),
    get items(): z.ZodType<(Condition | Group)[]> {
      return z.array(z.union([Condition, Group])).max(30);
    },
  }),
  "Conditions joined with all (AND), any (OR) or none (NOT ANY). Groups can be nested.",
);

const OutputKey = z
  .string()
  .trim()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/, "Output names are letters, numbers and _.");

/** An output the rule set returns, e.g. hide = true. String values may use {{fact.path}}. */
export const Outcome = named("RuleOutcome", z.object({ key: OutputKey, value: z.unknown() }));
export type Outcome = z.infer<typeof Outcome>;

export const Rule = named(
  "Rule",
  z.object({
    id: z.string().min(1).max(40),
    name: z.string().trim().max(120).default(""),
    enabled: z.boolean().default(true),
    when: Group,
    then: z.array(Outcome).max(20),
  }),
);
export type Rule = z.infer<typeof Rule>;

export const RuleTestCase = named(
  "RuleTestCase",
  z.object({
    id: z.string().min(1).max(40),
    name: z.string().trim().max(120),
    facts: z.record(z.string(), z.unknown()),
    expect: z.record(z.string(), z.unknown()).describe("Outputs that must come out, e.g. { hide: true }."),
  }),
);
export type RuleTestCase = z.infer<typeof RuleTestCase>;

export const RuleDefinition = named(
  "RuleDefinition",
  z.object({
    /** first: the first rule that matches decides. collect: every matching rule adds its outputs, in order. */
    hitPolicy: z.enum(["first", "collect"]).default("first"),
    rules: z.array(Rule).max(100),
    /** Outputs when no rule matches ("otherwise"). With collect, they are the starting values. */
    default: z.array(Outcome).max(20).default([]),
    tests: z.array(RuleTestCase).max(100).default([]),
  }),
);
export type RuleDefinition = z.infer<typeof RuleDefinition>;

export const emptyDefinition = (): RuleDefinition => ({ hitPolicy: "first", rules: [], default: [], tests: [] });
