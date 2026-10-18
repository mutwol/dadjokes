import type { DecisionPoint, Rule, RuleCondition, RuleDefinition, RuleGroup, RuleOutcome, RuleTestCase } from "../../../api/rtk/index.ts";

/* Editing helpers for rule definitions. The API owns evaluation; this only shapes data. */

export type Operator = RuleCondition["op"];
export type FactType = "number" | "text" | "boolean" | "list" | "date" | "any";
export type Field = { path: string; type: FactType; label: string; example?: unknown };

export const OPERATORS: { op: Operator; label: string; types: FactType[]; value: "none" | "one" | "list" | "range" }[] = [
  { op: "eq", label: "is", types: ["number", "text", "boolean", "date", "any"], value: "one" },
  { op: "neq", label: "is not", types: ["number", "text", "boolean", "date", "any"], value: "one" },
  { op: "gt", label: "is more than", types: ["number", "date", "any"], value: "one" },
  { op: "gte", label: "is at least", types: ["number", "date", "any"], value: "one" },
  { op: "lt", label: "is less than", types: ["number", "date", "any"], value: "one" },
  { op: "lte", label: "is at most", types: ["number", "date", "any"], value: "one" },
  { op: "between", label: "is between", types: ["number", "date", "any"], value: "range" },
  { op: "in", label: "is one of", types: ["number", "text", "any"], value: "list" },
  { op: "not_in", label: "is none of", types: ["number", "text", "any"], value: "list" },
  { op: "contains", label: "contains", types: ["text", "list", "any"], value: "one" },
  { op: "not_contains", label: "doesn't contain", types: ["text", "list", "any"], value: "one" },
  { op: "starts_with", label: "starts with", types: ["text", "any"], value: "one" },
  { op: "starts_with_any", label: "starts with any of", types: ["text", "any"], value: "list" },
  { op: "ends_with", label: "ends with", types: ["text", "any"], value: "one" },
  { op: "is_empty", label: "is empty", types: ["text", "list", "any"], value: "none" },
  { op: "is_not_empty", label: "is not empty", types: ["text", "list", "any"], value: "none" },
  { op: "is_true", label: "is true", types: ["boolean", "any"], value: "none" },
  { op: "is_false", label: "is false", types: ["boolean", "any"], value: "none" },
];

export const operator = (op: string) => OPERATORS.find((o) => o.op === op);
export const operatorsFor = (type: FactType | undefined) => OPERATORS.filter((o) => o.types.includes(type ?? "any"));

export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export const newCondition = (field = "", op: Operator = "eq"): RuleCondition => ({ kind: "condition", id: uid("c"), field, op, value: undefined });
export const newGroup = (match: RuleGroup["match"] = "all", items: RuleGroup["items"] = []): RuleGroup => ({ kind: "group", id: uid("g"), match, items });

export function newRule(fields: Field[], outputs: { key: string }[], n: number): FullRule {
  return {
    id: uid("r"),
    name: `Rule ${n}`,
    enabled: true,
    when: newGroup("all", [newCondition(fields[0]?.path ?? "")]),
    then: outputs.slice(0, 1).map((o) => ({ key: o.key, value: true })),
  };
}

/** A rule with the server's defaults filled in, so the editor never deals with missing fields. */
export type FullRule = Omit<Rule, "name" | "enabled"> & { name: string; enabled: boolean };
export type Definition = {
  hitPolicy: "first" | "collect";
  rules: FullRule[];
  default: RuleOutcome[];
  tests: RuleTestCase[];
};

export function normalize(d: RuleDefinition): Definition {
  return {
    hitPolicy: d.hitPolicy ?? "first",
    rules: (d.rules ?? []).map((r) => ({ ...r, name: r.name ?? "", enabled: r.enabled ?? true })),
    default: d.default ?? [],
    tests: d.tests ?? [],
  };
}

export const emptyDefinition = (): Definition => ({ hitPolicy: "first", rules: [], default: [], tests: [] });

/** The fact fields a decision point offers, for pickers. */
export function fieldsOf(dp: DecisionPoint | undefined): Field[] {
  return (dp?.facts ?? []).map((f) => ({ path: f.path, type: f.type, label: f.label, example: f.example }));
}

export function typeOf(fields: Field[], path: string): FactType | undefined {
  const exact = fields.find((f) => f.path === path);
  if (exact) return exact.type;
  // event.* and other open-ended roots
  if (fields.some((f) => path.startsWith(`${f.path}.`))) return "any";
  return undefined;
}

/** Example facts for the "Try it" panel, built from the decision point's examples. */
export function exampleFacts(dp: DecisionPoint | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of dp?.facts ?? []) {
    if (f.example === undefined) continue;
    const parts = f.path.split(".");
    let cur = out;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) cur[p] = f.example;
      else cur = (cur[p] ??= {}) as Record<string, unknown>;
    });
  }
  return out;
}

/** Shows a literal the way the inputs accept it. */
export function display(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.map(display).join(", ");
  if (typeof v === "object") {
    if ("ref" in (v as object)) return `{${String((v as { ref: unknown }).ref)}}`;
    return JSON.stringify(v);
  }
  return String(v);
}

/** Reads what someone typed as a literal of the right kind. `{path}` refers to another fact. */
export function parseValue(raw: string, type: FactType | undefined, shape: "one" | "list" | "range" | "none"): unknown {
  const t = raw.trim();
  const ref = /^\{([A-Za-z_][A-Za-z0-9_.]*)\}$/.exec(t);
  if (ref && shape === "one") return { ref: ref[1] };
  const one = (s: string): unknown => {
    const v = s.trim();
    if (type === "number" || (type !== "text" && v !== "" && Number.isFinite(Number(v)))) return v === "" ? undefined : Number(v);
    if (type === "boolean" || v === "true" || v === "false") return v === "true";
    return v;
  };
  if (shape === "list" || shape === "range") return t ? t.split(",").map(one).filter((x) => x !== undefined && x !== "") : [];
  if (shape === "none") return undefined;
  return one(t);
}

/** A one-line description of a condition, e.g. "reasons.offensive is at least 2". */
export function conditionLabel(c: RuleCondition) {
  const o = operator(c.op);
  return `${c.field} ${o?.label ?? c.op}${o?.value === "none" ? "" : ` ${display(c.value)}`}`;
}

export function countConditions(g: RuleGroup): number {
  return g.items.reduce((n, i) => n + (i.kind === "group" ? countConditions(i) : 1), 0);
}

/** A rule with exactly one condition can be edited as a table row. */
export function singleCondition(r: FullRule): RuleCondition | null {
  return r.when.items.length === 1 && r.when.items[0].kind === "condition" && r.when.match !== "none" ? r.when.items[0] : null;
}

export function outputKeys(def: Definition, dp: DecisionPoint | undefined): string[] {
  const keys = new Set<string>((dp?.outputs ?? []).map((o) => o.key));
  for (const r of def.rules) for (const o of r.then) keys.add(o.key);
  for (const o of def.default) keys.add(o.key);
  return [...keys];
}

export function setOutcome(list: RuleOutcome[], key: string, value: unknown): RuleOutcome[] {
  if (value === undefined || value === "") return list.filter((o) => o.key !== key);
  return list.some((o) => o.key === key) ? list.map((o) => (o.key === key ? { ...o, value } : o)) : [...list, { key, value }];
}
