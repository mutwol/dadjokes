import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  api,
  problemMessage,
  useArchiveRuleSetMutation,
  useEvaluateRuleSetMutation,
  useGetRuleSetQuery,
  useLazyGetRuleVersionQuery,
  useListDecisionPointsQuery,
  useListRuleVersionsQuery,
  usePublishRuleSetMutation,
  useRestoreRuleVersionMutation,
  useSaveRuleDraftMutation,
  useTestRuleSetMutation,
  useUnarchiveRuleSetMutation,
} from "../../api/rtk/index.ts";
import type { DecisionPoint, RuleEvaluation, RuleSetDetail, RuleTestReport } from "../../api/rtk/index.ts";
import { useAppDispatch } from "../../state/redux.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button, button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { ConfirmPopover } from "@/components/ui/confirm-popover.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { field, Input } from "@/components/ui/input.tsx";
import { help, label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Tabs } from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { cn } from "@/lib/utils.ts";
import { timeAgo } from "../../data/dates.ts";
import { GroupEditor, ValueInput } from "./rules/ConditionBuilder.tsx";
import { OutcomesEditor } from "./rules/OutcomesEditor.tsx";
import { TraceView } from "./rules/TraceView.tsx";
import { exampleFacts, fieldsOf, newRule, normalize, operator, operatorsFor, outputKeys, setOutcome, singleCondition, typeOf, uid } from "./rules/model.ts";
import type { Definition, Field, FullRule } from "./rules/model.ts";
import { LoadError, Loading } from "./ui.tsx";
import { table } from "./lib.ts";

type Tab = "builder" | "tests" | "versions" | "details" | "json";

/**
 * One rule set. Builder (When/Then cards, or a decision table), a Try panel
 * with a trace, test cases that must pass to publish, versions and the JSON.
 */
export function AdminRuleSet() {
  const { id = "" } = useParams();
  const dispatch = useAppDispatch();
  const { data, error, refetch } = useGetRuleSetQuery({ id }, { skip: !id });
  const { data: points } = useListDecisionPointsQuery();
  if (error && !data) return <LoadError error={problemMessage(error)} onRetry={() => void refetch()} />;
  if (!data || !points) return <Loading height="h-96" />;
  // Writes already update the cache (endpoints.ts); this covers callers holding a detail.
  const onSaved = (s: RuleSetDetail) => dispatch(api.util.upsertQueryData("getRuleSet", { id: s.id }, s));
  return <Editor key={`${data.id}-${data.revision}`} set={data} dp={points.data.find((p) => p.key === data.decisionPoint)} onSaved={onSaved} />;
}

function Editor({ set, dp, onSaved }: { set: RuleSetDetail; dp: DecisionPoint | undefined; onSaved: (s: RuleSetDetail) => void }) {
  const [saveDraft] = useSaveRuleDraftMutation();
  const [publish] = usePublishRuleSetMutation();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab | null) ?? "builder";
  const setTab = (t: Tab) => setParams(t === "builder" ? {} : { tab: t }, { replace: true });
  const saved = useMemo(() => normalize(set.draft), [set.draft]);
  const [draft, setDraft] = useState<Definition>(saved);
  const [meta, setMeta] = useState({ name: set.name, description: set.description });
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RuleTestReport | null>(null);
  const [result, setResult] = useState<RuleEvaluation | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || meta.name !== set.name || meta.description !== set.description;

  const fields = useMemo(() => fieldsOf(dp), [dp]);
  const outputs = outputKeys(draft, dp);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    return saveDraft({ id: set.id, updateRuleDraftRequest: { revision: set.revision, name: meta.name, description: meta.description, draft } }).unwrap();
  };

  const onSave = async () => {
    setBusy(true);
    try {
      onSaved(await save());
      toast.success("Draft saved.");
    } catch (e) {
      toast.error(problemMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async () => {
    setBusy(true);
    try {
      const saved = dirty ? await save() : set;
      const r = await publish({ id: set.id }).unwrap();
      setReport(r.tests);
      if (r.published) {
        // Publishing invalidates this rule set, so the page refetches the live version.
        toast.success(`Published as version ${r.version}. It's live now.`);
      } else {
        if (dirty) onSaved(saved);
        toast.error("Not published: some tests failed.");
        setTab("tests");
      }
    } catch (e) {
      toast.error(problemMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const conditionResults = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of result?.trace ?? []) for (const c of r.conditions) m.set(c.id, c.result);
    return m;
  }, [result]);

  return (
    <>
      <Link to="/admin/rules" className="flex items-center gap-1 text-sm font-medium text-ink-soft no-underline">
        <Icon name="back" size={16} /> Rule sets
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl">
            {meta.name}
            {set.status === "published" ? <Badge tone="green">live v{set.liveVersion}</Badge> : set.status === "archived" ? <Badge>archived</Badge> : <Badge tone="yellow">draft</Badge>}
            {set.system ? <Badge tone="blue">used by the app</Badge> : null}
          </h1>
          <p className="font-mono text-sm text-ink-soft">{set.key}</p>
          <p className="text-sm text-ink-soft">{dp?.label ?? set.decisionPoint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? <span className="text-sm font-medium text-butter-ink">Unsaved changes</span> : set.hasUnpublishedChanges && set.liveVersion ? <span className="text-sm font-medium text-butter-ink">Saved, not published</span> : null}
          <Button variant="quiet" size="sm" disabled={busy || !dirty} onClick={() => void onSave()}>
            Save draft
          </Button>
          <Button size="sm" disabled={busy || set.status === "archived"} onClick={() => void onPublish()}>
            {busy ? "Working…" : "Test and publish"}
          </Button>
        </div>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "builder", label: "Builder" },
          { id: "tests", label: `Tests (${draft.tests.length})` },
          { id: "versions", label: "Versions" },
          { id: "details", label: "Details" },
          { id: "json", label: "JSON" },
        ]}
      />

      {tab === "builder" ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Builder draft={draft} onChange={setDraft} fields={fields} outputs={outputs} results={result ? conditionResults : undefined} matched={new Set(result?.matched ?? [])} />
          <TryPanel
            setId={set.id}
            draft={draft}
            dp={dp}
            fields={fields}
            result={result}
            onResult={setResult}
            onSaveAsTest={(facts, outputsSeen) => {
              setDraft({ ...draft, tests: [...draft.tests, { id: uid("t"), name: `Case ${draft.tests.length + 1}`, facts, expect: outputsSeen }] });
              toast.success("Added as a test case. Save to keep it.");
            }}
          />
        </div>
      ) : null}
      {tab === "tests" ? <TestsTab setId={set.id} draft={draft} onChange={setDraft} report={report} onReport={setReport} dp={dp} /> : null}
      {tab === "versions" ? <VersionsTab set={set} onRestored={onSaved} /> : null}
      {tab === "details" ? <DetailsTab set={set} dp={dp} meta={meta} onMeta={setMeta} draft={draft} onChange={setDraft} onSaved={onSaved} /> : null}
      {tab === "json" ? <JsonTab draft={draft} onApply={setDraft} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ Builder */

function Builder({
  draft,
  onChange,
  fields,
  outputs,
  results,
  matched,
}: {
  draft: Definition;
  onChange: (d: Definition) => void;
  fields: Field[];
  outputs: string[];
  results?: Map<string, boolean>;
  matched: Set<string>;
}) {
  const [view, setView] = useState<"cards" | "table">("cards");
  const setRule = (i: number, r: FullRule | null) => onChange({ ...draft, rules: r ? draft.rules.map((x, j) => (j === i ? r : x)) : draft.rules.filter((_, j) => j !== i) });
  const move = (i: number, d: number) => {
    const rules = [...draft.rules];
    const [r] = rules.splice(i, 1);
    rules.splice(i + d, 0, r);
    onChange({ ...draft, rules });
  };
  const add = () => onChange({ ...draft, rules: [...draft.rules, newRule(fields, outputs.map((key) => ({ key })), draft.rules.length + 1)] });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          {draft.hitPolicy === "first" ? "Rules are checked top to bottom; the first one that matches decides." : "Every matching rule adds its outputs, top to bottom."}
        </p>
        <div className="inline-flex rounded-lg bg-paper p-0.5 shadow-[inset_0_0_0_1px_var(--color-line)]" role="radiogroup" aria-label="Layout">
          {(["cards", "table"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cn("min-h-8 rounded-md border-0 px-3 text-sm font-medium", view === v ? "bg-ink text-on-ink" : "bg-transparent text-ink-soft")}>
              {v === "cards" ? "Rules" : "Table"}
            </button>
          ))}
        </div>
      </div>

      {view === "table" ? (
        <DecisionTable draft={draft} onChange={onChange} fields={fields} outputs={outputs} matched={matched} onOpenCards={() => setView("cards")} />
      ) : (
        <>
          {draft.rules.map((rule, i) => (
            <Card key={rule.id} as="section" className={cn("grid gap-3 p-3.5", matched.has(rule.id) && "border-lawn bg-mint/30", !rule.enabled && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-fridge text-sm font-semibold text-ink-soft">{i + 1}</span>
                <input className={field("sm", "min-w-0 flex-1 border-transparent font-semibold hover:border-line")} defaultValue={rule.name} onBlur={(e) => setRule(i, { ...rule, name: e.target.value })} aria-label="Rule name" />
                {matched.has(rule.id) ? <Badge tone="green">matched</Badge> : null}
                <Switch checked={rule.enabled} onClick={() => setRule(i, { ...rule, enabled: !rule.enabled })} aria-label={rule.enabled ? "Turn rule off" : "Turn rule on"} />
                <IconBtn label="Move up" icon="up" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconBtn label="Move down" icon="down" disabled={i === draft.rules.length - 1} onClick={() => move(i, 1)} />
                <IconBtn label="Duplicate" icon="copy" onClick={() => onChange({ ...draft, rules: [...draft.rules.slice(0, i + 1), cloneRule(rule), ...draft.rules.slice(i + 1)] })} />
                <ConfirmPopover
                  trigger={<IconBtn label="Delete rule" icon="trash" />}
                  title={`Delete “${rule.name || `Rule ${i + 1}`}”?`}
                  description="Its conditions and outputs are removed from this draft."
                  confirmLabel="Delete rule"
                  onConfirm={() => setRule(i, null)}
                />
              </div>
              <div className="grid gap-1">
                <p className="text-xs font-semibold tracking-[0.06em] text-ink-faint uppercase">When</p>
                <GroupEditor group={rule.when} onChange={(when) => setRule(i, { ...rule, when })} fields={fields} results={results} />
              </div>
              <div className="grid gap-1 border-t border-line pt-3">
                <p className="text-xs font-semibold tracking-[0.06em] text-ink-faint uppercase">Then</p>
                <OutcomesEditor key={`${rule.id}-${rule.then.length}`} outcomes={rule.then} onChange={(then) => setRule(i, { ...rule, then })} suggestions={outputs} />
              </div>
            </Card>
          ))}
          <button type="button" onClick={add} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-transparent font-medium text-ink-soft hover:border-ink hover:text-ink">
            <Icon name="plus" size={18} /> Add a rule
          </button>
        </>
      )}

      <Card as="section" className="grid gap-1 p-3.5">
        <p className="text-xs font-semibold tracking-[0.06em] text-ink-faint uppercase">{draft.hitPolicy === "first" ? "Otherwise (no rule matched)" : "Start with"}</p>
        <OutcomesEditor key={`default-${draft.default.length}`} outcomes={draft.default} onChange={(d) => onChange({ ...draft, default: d })} suggestions={outputs} emptyText="No default outputs: callers get nothing back when no rule matches." />
      </Card>
    </div>
  );
}

function cloneRule(r: FullRule): FullRule {
  const reId = <T,>(x: T): T => JSON.parse(JSON.stringify(x), (k, v) => (k === "id" && typeof v === "string" ? uid(v.split("_")[0] || "x") : v)) as T;
  return { ...reId(r), name: `${r.name} (copy)` };
}

function IconBtn({ label: l, icon, className, ...props }: { label: string; icon: "up" | "down" | "copy" | "trash" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={l} title={l} className={cn("grid size-8 place-items-center rounded-lg border-0 bg-transparent text-ink-soft hover:bg-fridge hover:text-ink disabled:opacity-30 data-popup-open:bg-fridge data-popup-open:text-ink", className)} {...props}>
      <Icon name={icon} size={16} />
    </button>
  );
}

/** One row per rule. Rules with a single condition are edited in place. */
function DecisionTable({
  draft,
  onChange,
  fields,
  outputs,
  matched,
  onOpenCards,
}: {
  draft: Definition;
  onChange: (d: Definition) => void;
  fields: Field[];
  outputs: string[];
  matched: Set<string>;
  onOpenCards: () => void;
}) {
  const setRule = (i: number, r: FullRule) => onChange({ ...draft, rules: draft.rules.map((x, j) => (j === i ? r : x)) });
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead>
          <tr>
            <th className={table.th}>#</th>
            <th className={table.th}>Rule</th>
            <th className={table.th}>When</th>
            {outputs.map((o) => (
              <th key={o} className={cn(table.th, "font-mono normal-case")}>
                → {o}
              </th>
            ))}
            <th className={table.th}>On</th>
          </tr>
        </thead>
        <tbody>
          {draft.rules.map((rule, i) => {
            const c = singleCondition(rule);
            const type = c ? typeOf(fields, c.field) : undefined;
            return (
              <tr key={rule.id} className={cn(table.row, matched.has(rule.id) && "bg-mint/40", !rule.enabled && "opacity-60")}>
                <td className={cn(table.td, "font-medium text-ink-soft")}>{i + 1}</td>
                <td className={table.td}>
                  <input className={field("sm", "w-44 border-transparent font-medium hover:border-line")} defaultValue={rule.name} onBlur={(e) => setRule(i, { ...rule, name: e.target.value })} aria-label="Rule name" />
                </td>
                <td className={table.td}>
                  {c ? (
                    <div className="flex min-w-[22rem] items-center gap-1.5">
                      <input list="dt-fields" className={field("sm", "w-40 font-mono text-[0.8125rem]")} defaultValue={c.field} aria-label="Fact" onBlur={(e) => setRule(i, { ...rule, when: { ...rule.when, items: [{ ...c, field: e.target.value }] } })} />
                      <select className={field("sm", "w-36")} value={c.op} aria-label="Operator" onChange={(e) => setRule(i, { ...rule, when: { ...rule.when, items: [{ ...c, op: e.target.value as typeof c.op }] } })}>
                        {operatorsFor(type).map((o) => (
                          <option key={o.op} value={o.op}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {operator(c.op)?.value !== "none" ? (
                        <ValueInput key={`${c.id}-${c.op}`} value={c.value} type={type} shape={operator(c.op)?.value ?? "one"} onChange={(value) => setRule(i, { ...rule, when: { ...rule.when, items: [{ ...c, value }] } })} />
                      ) : null}
                    </div>
                  ) : (
                    <button type="button" className="border-0 bg-transparent p-0 text-sm font-medium text-sky-ink underline" onClick={onOpenCards}>
                      {rule.when.items.length ? "Several conditions: edit in Rules" : "Always"}
                    </button>
                  )}
                </td>
                {outputs.map((o) => {
                  const current = rule.then.find((x) => x.key === o);
                  return (
                    <td key={o} className={table.td}>
                      <ValueInput key={`${rule.id}-${o}-${String(current?.value)}`} className="w-28 min-w-0" value={current?.value} type={undefined} shape="one" onChange={(value) => setRule(i, { ...rule, then: setOutcome(rule.then, o, value) })} />
                    </td>
                  );
                })}
                <td className={table.td}>
                  <Switch checked={rule.enabled} onClick={() => setRule(i, { ...rule, enabled: !rule.enabled })} aria-label="Rule on" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <datalist id="dt-fields">
        {fields.map((f) => (
          <option key={f.path} value={f.path}>
            {f.label}
          </option>
        ))}
      </datalist>
      <div className="border-t border-line p-2">
        <button type="button" className={button({ variant: "quiet", size: "sm" })} onClick={() => onChange({ ...draft, rules: [...draft.rules, newRule(fields, outputs.map((key) => ({ key })), draft.rules.length + 1)] })}>
          <Icon name="plus" size={16} /> Row
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Try panel */

function TryPanel({
  setId,
  draft,
  dp,
  fields,
  result,
  onResult,
  onSaveAsTest,
}: {
  setId: string;
  draft: Definition;
  dp: DecisionPoint | undefined;
  fields: Field[];
  result: RuleEvaluation | null;
  onResult: (r: RuleEvaluation | null) => void;
  onSaveAsTest: (facts: Record<string, unknown>, outputs: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(exampleFacts(dp), null, 2));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [evaluate] = useEvaluateRuleSetMutation();
  const parse = (): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(text) as unknown;
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
      setError("");
      return v as Record<string, unknown>;
    } catch {
      setError("Facts must be a JSON object.");
      return null;
    }
  };
  const run = async () => {
    const facts = parse();
    if (!facts) return;
    setBusy(true);
    try {
      onResult(await evaluate({ id: setId, evaluateRuleSetRequest: { facts, source: "draft", definition: draft } }).unwrap());
    } catch (e) {
      setError(problemMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="sticky top-4 grid gap-3" aria-label="Try it">
      <Card className="grid gap-2.5 p-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Try it</h2>
          <button type="button" className="border-0 bg-transparent p-0 text-xs font-medium text-ink-soft underline" onClick={() => setText(JSON.stringify(exampleFacts(dp), null, 2))}>
            Reset example
          </button>
        </div>
        <p className={help}>Facts to decide on, as JSON. Runs your unsaved draft.</p>
        <textarea className={field("sm", "min-h-44 resize-y font-mono text-xs leading-relaxed")} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Facts" />
        {error ? <p className="text-sm font-medium text-tag-red-deep">{error}</p> : null}
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void run()} disabled={busy}>
            <Icon name="play" size={14} /> Run
          </Button>
          {result ? (
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                const facts = parse();
                if (facts) onSaveAsTest(facts, result.outputs);
              }}
            >
              Save as test
            </Button>
          ) : null}
          {result ? (
            <Button variant="quiet" size="sm" onClick={() => onResult(null)}>
              Clear
            </Button>
          ) : null}
        </div>
      </Card>
      {result ? <TraceView result={result} /> : null}
      <Card className="grid gap-2 p-3.5">
        <h2 className="text-sm font-semibold">Facts you can use</h2>
        <ul className="m-0 grid max-h-64 list-none gap-1 overflow-y-auto p-0 text-xs">
          {fields.map((f) => (
            <li key={f.path} className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-ink">{f.path}</span>
              <span className="text-right text-ink-soft">
                {f.label} · {f.type}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </aside>
  );
}

/* -------------------------------------------------------------------- Tests */

function TestsTab({
  setId,
  draft,
  onChange,
  report,
  onReport,
  dp,
}: {
  setId: string;
  draft: Definition;
  onChange: (d: Definition) => void;
  report: RuleTestReport | null;
  onReport: (r: RuleTestReport) => void;
  dp: DecisionPoint | undefined;
}) {
  const [runTests, testsState] = useTestRuleSetMutation();
  const run = async () => {
    try {
      onReport(await runTests({ id: setId, runRuleTestsRequest: { definition: draft } }).unwrap());
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };
  const setTest = (i: number, next: Definition["tests"][number] | null) =>
    onChange({ ...draft, tests: next ? draft.tests.map((t, j) => (j === i ? next : t)) : draft.tests.filter((_, j) => j !== i) });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-[40rem] text-sm text-ink-soft">
          Each test gives facts and the outputs that must come out. Publishing runs them all and stops if any fails, so a typo can't go live.
        </p>
        <div className="flex gap-2">
          <Button variant="quiet" size="sm" onClick={() => onChange({ ...draft, tests: [...draft.tests, { id: uid("t"), name: `Case ${draft.tests.length + 1}`, facts: exampleFacts(dp), expect: {} }] })}>
            <Icon name="plus" size={16} /> Test
          </Button>
          <Button size="sm" onClick={() => void run()} disabled={testsState.isLoading} aria-busy={testsState.isLoading || undefined}>
            <Icon name="play" size={14} /> Run all
          </Button>
        </div>
      </div>
      {report ? (
        <p className={cn("rounded-xl px-3.5 py-2.5 font-medium", report.passed ? "bg-mint text-forest" : "bg-tag-red/10 text-tag-red-deep")}>
          {report.passed ? `All ${report.results.length} tests pass.` : `${report.results.filter((r) => !r.passed).length} of ${report.results.length} tests fail.`}
        </p>
      ) : null}
      {draft.tests.map((t, i) => {
        const r = report?.results.find((x) => x.id === t.id);
        return (
          <Card key={t.id} className={cn("grid gap-2.5 p-3.5", r && (r.passed ? "border-lawn/50" : "border-tag-red/50"))}>
            <div className="flex items-center gap-2">
              {r ? <Badge tone={r.passed ? "green" : "red"}>{r.passed ? "pass" : "fail"}</Badge> : null}
              <input className={field("sm", "min-w-0 flex-1 border-transparent font-medium hover:border-line")} defaultValue={t.name} onBlur={(e) => setTest(i, { ...t, name: e.target.value })} aria-label="Test name" />
              <ConfirmPopover
                trigger={
                  <button type="button" aria-label="Delete test" className="grid size-8 place-items-center rounded-lg border-0 bg-transparent text-ink-soft hover:bg-tag-red/10 hover:text-tag-red-deep data-popup-open:bg-tag-red/10 data-popup-open:text-tag-red-deep">
                    <Icon name="trash" size={16} />
                  </button>
                }
                title={`Delete “${t.name || "this test"}”?`}
                confirmLabel="Delete test"
                onConfirm={() => setTest(i, null)}
              />
            </div>
            <div className="grid gap-2.5 lg:grid-cols-2">
              <JsonField label="Facts" value={t.facts} onChange={(facts) => setTest(i, { ...t, facts })} />
              <JsonField label="Must output" value={t.expect} onChange={(expect) => setTest(i, { ...t, expect })} />
            </div>
            {r && !r.passed ? (
              <ul className="m-0 grid list-none gap-1 p-0 text-sm">
                {Object.entries(r.failures).map(([k, f]) => (
                  <li key={k} className="font-mono text-tag-red-deep">
                    {k}: expected {JSON.stringify(f.expected)}, got {JSON.stringify(f.actual)}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        );
      })}
      {!draft.tests.length ? <p className="text-sm text-ink-soft">No tests yet. Run something in the Try panel and save it as a test.</p> : null}
    </div>
  );
}

function JsonField({ label: l, value, onChange }: { label: string; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold tracking-[0.06em] text-ink-faint uppercase">{l}</span>
      <textarea
        className={field("sm", cn("min-h-28 resize-y font-mono text-xs", bad && "border-tag-red"))}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            const v = JSON.parse(text) as unknown;
            if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
            setBad(false);
            onChange(v as Record<string, unknown>);
          } catch {
            setBad(true);
          }
        }}
      />
      {bad ? <span className="text-xs font-medium text-tag-red-deep">Not a JSON object.</span> : null}
    </label>
  );
}

/* ----------------------------------------------------------------- Versions */

function VersionsTab({ set, onRestored }: { set: RuleSetDetail; onRestored: (s: RuleSetDetail) => void }) {
  const { data: versions } = useListRuleVersionsQuery({ id: set.id });
  const data = versions?.data;
  const [loadVersion] = useLazyGetRuleVersionQuery();
  const [restoreVersion] = useRestoreRuleVersionMutation();
  const [viewing, setViewing] = useState<{ version: number; json: string } | null>(null);
  const view = async (version: number) => {
    try {
      const v = await loadVersion({ id: set.id, version }, true).unwrap();
      setViewing({ version, json: JSON.stringify(v.definition, null, 2) });
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };
  const restore = async (version: number) => {
    try {
      onRestored(await restoreVersion({ id: set.id, version }).unwrap());
      toast.success(`Version ${version} copied into the draft. Publish to make it live.`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className={table.wrap}>
        <table className={table.table}>
          <thead>
            <tr>
              <th className={table.th}>Version</th>
              <th className={table.th}>Published</th>
              <th className={table.th} />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((v) => (
              <tr key={v.version} className={table.row}>
                <td className={table.td}>
                  <span className="font-medium">v{v.version}</span> {v.version === set.liveVersion ? <Badge tone="green">live</Badge> : null}
                  <span className="block text-xs text-ink-soft">{v.ruleCount} rules</span>
                </td>
                <td className={`${table.td} text-ink-soft`}>
                  {timeAgo(v.publishedAt)}
                  {v.publishedBy ? ` by @${v.publishedBy}` : ""}
                </td>
                <td className={`${table.td} text-right whitespace-nowrap`}>
                  <button type="button" className={button({ variant: "quiet", size: "sm" })} onClick={() => void view(v.version)}>
                    View
                  </button>{" "}
                  <button type="button" className={button({ variant: "quiet", size: "sm" })} onClick={() => void restore(v.version)}>
                    Restore to draft
                  </button>
                </td>
              </tr>
            ))}
            {data && !data.length ? (
              <tr>
                <td className={table.td} colSpan={3}>
                  Not published yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {viewing ? (
        <Card className="grid gap-2 p-3.5">
          <h2 className="text-lg">Version {viewing.version}</h2>
          <pre className="m-0 max-h-[32rem] overflow-auto rounded-xl bg-fridge p-3 font-mono text-xs">{viewing.json}</pre>
        </Card>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Details */

function DetailsTab({
  set,
  dp,
  meta,
  onMeta,
  draft,
  onChange,
  onSaved,
}: {
  set: RuleSetDetail;
  dp: DecisionPoint | undefined;
  meta: { name: string; description: string };
  onMeta: (m: { name: string; description: string }) => void;
  draft: Definition;
  onChange: (d: Definition) => void;
  onSaved: (s: RuleSetDetail) => void;
}) {
  const [archiveSet] = useArchiveRuleSetMutation();
  const [unarchiveSet] = useUnarchiveRuleSetMutation();
  const archive = async (on: boolean) => {
    try {
      const r = await (on ? archiveSet({ id: set.id }) : unarchiveSet({ id: set.id })).unwrap();
      onSaved(r);
      toast.success(on ? "Archived. Nothing evaluates it any more." : "Back in use.");
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="grid gap-3 p-4">
        <label className="grid gap-1">
          <span className={label}>Name</span>
          <Input fieldSize="sm" value={meta.name} onChange={(e) => onMeta({ ...meta, name: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className={label}>Description</span>
          <Textarea rows={3} value={meta.description} onChange={(e) => onMeta({ ...meta, description: e.target.value })} />
        </label>
        <fieldset className="m-0 grid gap-1.5 border-0 p-0">
          <legend className={cn(label, "mb-1")}>When several rules match</legend>
          {(
            [
              ["first", "The first matching rule decides", "Order matters: put specific rules above general ones."],
              ["collect", "Every matching rule adds its outputs", "Later rules overwrite earlier ones for the same output."],
            ] as const
          ).map(([v, t, h]) => (
            <label key={v} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-2.5">
              <input type="radio" name="hit" checked={draft.hitPolicy === v} onChange={() => onChange({ ...draft, hitPolicy: v })} className="mt-1 accent-ink" />
              <span className="grid">
                <strong>{t}</strong>
                <span className={help}>{h}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className={help}>Save the draft to keep these changes.</p>
      </Card>
      <div className="grid gap-4">
        <Card className="grid gap-2 p-4">
          <h2 className="text-lg">How it's used</h2>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="font-medium">Key</dt>
            <dd className="m-0 font-mono">{set.key}</dd>
            <dt className="font-medium">Decides</dt>
            <dd className="m-0">{dp?.label ?? set.decisionPoint}</dd>
            <dt className="font-medium">Outputs read</dt>
            <dd className="m-0 font-mono">{dp?.outputs.map((o) => o.key).join(", ") || "any (workflow Decision steps read decision.<output>)"}</dd>
          </dl>
          {dp ? <p className={help}>{dp.description}</p> : null}
        </Card>
        <Card className="grid gap-2 p-4">
          <h2 className="text-lg">{set.status === "archived" ? "Archived" : "Archive"}</h2>
          {set.system ? (
            <p className={help}>The app relies on this rule set, so it can't be archived. If it's ever unpublished, the app falls back to safe built-in behaviour.</p>
          ) : set.status === "archived" ? (
            <Button variant="quiet" size="sm" className="justify-self-start" onClick={() => void archive(false)}>
              Bring it back
            </Button>
          ) : (
            <>
              <p className={help}>Workflows that use it will fail their Decision step until you bring it back.</p>
              <Button variant="quiet" size="sm" className="justify-self-start" onClick={() => void archive(true)}>
                Archive rule set
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- JSON */

function JsonTab({ draft, onApply }: { draft: Definition; onApply: (d: Definition) => void }) {
  const [text, setText] = useState(() => JSON.stringify(draft, null, 2));
  const [error, setError] = useState("");
  const apply = () => {
    try {
      const d = JSON.parse(text) as Definition;
      if (!Array.isArray(d.rules) || !Array.isArray(d.default ?? []) || !["first", "collect"].includes(d.hitPolicy)) throw new Error("Needs hitPolicy, rules and default.");
      onApply({ hitPolicy: d.hitPolicy, rules: d.rules, default: d.default ?? [], tests: d.tests ?? [] });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not valid JSON.");
    }
  };
  return (
    <div className="grid gap-2">
      <p className={help}>The whole draft as JSON, for copying between environments or bulk edits. Apply, then save; the server checks it.</p>
      <textarea className={field("sm", "min-h-[32rem] resize-y font-mono text-xs leading-relaxed")} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Rule set JSON" />
      {error ? <p className="text-sm font-medium text-tag-red-deep">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={apply}>
          Apply to draft
        </Button>
        <Button variant="quiet" size="sm" onClick={() => setText(JSON.stringify(draft, null, 2))}>
          Reset
        </Button>
      </div>
    </div>
  );
}
