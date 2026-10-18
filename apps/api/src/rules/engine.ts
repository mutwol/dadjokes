import { UNARY_OPERATORS } from "./model";
import type { Condition, Group, Operator, Outcome, RuleDefinition } from "./model";

/*
 * The evaluator: pure and deterministic. Facts in; outputs, the matched rules
 * and a trace out. No I/O, no clock, no code execution, so it is safe to run
 * on every request and easy to reason about.
 */

export interface ConditionTrace {
  id: string;
  field: string;
  op: Operator;
  left: unknown;
  right: unknown;
  result: boolean;
}

export interface RuleTrace {
  ruleId: string;
  name: string;
  enabled: boolean;
  matched: boolean;
  conditions: ConditionTrace[];
}

export interface Evaluation {
  matched: string[];
  outputs: Record<string, unknown>;
  usedDefault: boolean;
  trace: RuleTrace[];
}

type Facts = Record<string, unknown>;

/** Reads a dotted path such as user.streak or reasons.offensive. Missing parts give undefined. */
export function readPath(facts: unknown, path: string): unknown {
  let cur: unknown = facts;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(part)) cur = cur[Number(part)];
    else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

function resolveValue(value: unknown, facts: Facts): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && "ref" in value) {
    return readPath(facts, String((value as { ref: unknown }).ref));
  }
  return value;
}

/** Fills {{path}} placeholders in output text from the facts. */
export function interpolate(text: string, facts: unknown): string {
  return text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g, (_, path: string) => {
    const v = readPath(facts, path);
    return v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  if (typeof v === "boolean") return null;
  return null;
};

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v)).toLowerCase();

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === null || v === undefined ? [] : [v]);

/** Loose equality: numbers compare as numbers, text compares without case. */
function same(a: unknown, b: unknown): boolean {
  const na = num(a);
  const nb = num(b);
  if (na !== null && nb !== null) return na === nb;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b || String(a) === String(b);
  return text(a) === text(b);
}

function isEmpty(v: unknown) {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

export function compare(op: Operator, left: unknown, right: unknown): boolean {
  switch (op) {
    case "eq":
      return same(left, right);
    case "neq":
      return !same(left, right);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = num(left);
      const b = num(right);
      if (a === null || b === null) return false;
      return op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b;
    }
    case "between": {
      const [lo, hi] = list(right);
      const a = num(left);
      const l = num(lo);
      const h = num(hi);
      return a !== null && l !== null && h !== null && a >= l && a <= h;
    }
    case "in":
      return list(right).some((r) => same(left, r));
    case "not_in":
      return !list(right).some((r) => same(left, r));
    case "contains":
      return Array.isArray(left) ? left.some((l) => same(l, right)) : text(left).includes(text(right));
    case "not_contains":
      return !(Array.isArray(left) ? left.some((l) => same(l, right)) : text(left).includes(text(right)));
    case "starts_with":
      return text(left).startsWith(text(right));
    case "starts_with_any":
      return list(right).some((r) => text(left).startsWith(text(r)));
    case "ends_with":
      return text(left).endsWith(text(right));
    case "is_empty":
      return isEmpty(left);
    case "is_not_empty":
      return !isEmpty(left);
    case "is_true":
      return left === true || left === "true" || left === 1;
    case "is_false":
      return !(left === true || left === "true" || left === 1);
  }
}

function evalCondition(c: Condition, facts: Facts, trace: ConditionTrace[]): boolean {
  const left = readPath(facts, c.field);
  const right = UNARY_OPERATORS.includes(c.op) ? undefined : resolveValue(c.value, facts);
  const result = compare(c.op, left, right);
  trace.push({ id: c.id, field: c.field, op: c.op, left: left ?? null, right: right ?? null, result });
  return result;
}

/** Evaluates every item (no short-circuit), so the trace always shows each condition. */
function evalGroup(g: Group, facts: Facts, trace: ConditionTrace[]): boolean {
  const results = g.items.map((item) =>
    item.kind === "group" ? evalGroup(item, facts, trace) : evalCondition(item, facts, trace),
  );
  if (!results.length) return g.match !== "none" ? g.match === "all" : true;
  if (g.match === "all") return results.every(Boolean);
  if (g.match === "any") return results.some(Boolean);
  return !results.some(Boolean);
}

function applyOutcomes(outcomes: Outcome[], facts: Facts, into: Record<string, unknown>) {
  for (const o of outcomes) into[o.key] = typeof o.value === "string" ? interpolate(o.value, facts) : o.value;
}

export function evaluate(def: RuleDefinition, facts: Facts): Evaluation {
  const trace: RuleTrace[] = [];
  const matched: string[] = [];
  const outputs: Record<string, unknown> = {};
  if (def.hitPolicy === "collect") applyOutcomes(def.default, facts, outputs);

  let decided = false;
  for (const rule of def.rules) {
    const conditions: ConditionTrace[] = [];
    if (!rule.enabled || (decided && def.hitPolicy === "first")) {
      trace.push({ ruleId: rule.id, name: rule.name, enabled: rule.enabled, matched: false, conditions });
      continue;
    }
    const ok = evalGroup(rule.when, facts, conditions);
    trace.push({ ruleId: rule.id, name: rule.name, enabled: true, matched: ok, conditions });
    if (!ok) continue;
    matched.push(rule.id);
    applyOutcomes(rule.then, facts, outputs);
    decided = true;
  }

  const usedDefault = matched.length === 0;
  if (usedDefault && def.hitPolicy === "first") applyOutcomes(def.default, facts, outputs);
  return { matched, outputs, usedDefault, trace };
}

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  outputs: Record<string, unknown>;
  /** Expected outputs that didn't match: key → { expected, actual }. */
  failures: Record<string, { expected: unknown; actual: unknown }>;
}

export function runTests(def: RuleDefinition): { passed: boolean; results: TestResult[] } {
  const results = def.tests.map((t): TestResult => {
    const { outputs } = evaluate(def, t.facts);
    const failures: TestResult["failures"] = {};
    for (const [key, expected] of Object.entries(t.expect)) {
      const actual = outputs[key];
      if (JSON.stringify(actual ?? null) !== JSON.stringify(expected ?? null) && !same(actual, expected)) {
        failures[key] = { expected, actual: actual ?? null };
      }
    }
    return { id: t.id, name: t.name, passed: Object.keys(failures).length === 0, outputs, failures };
  });
  return { passed: results.every((r) => r.passed), results };
}
