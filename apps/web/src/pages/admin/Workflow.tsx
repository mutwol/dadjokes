import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  api,
  problemMessage,
  useActivateWorkflowMutation,
  useDeleteWorkflowMutation,
  useDiscardWorkflowDraftMutation,
  useGetAutomationCatalogQuery,
  useGetWorkflowQuery,
  useListAdminUsersQuery,
  useListRuleSetsQuery,
  useListWorkflowVersionsQuery,
  usePauseWorkflowMutation,
  usePublishWorkflowMutation,
  useRestoreWorkflowVersionMutation,
  useSaveWorkflowDraftMutation,
  useStartWorkflowRunMutation,
} from "../../api/rtk/index.ts";
import type { AutomationCatalog, RuleSetSummary, WorkflowDetail, WorkflowGraph, WorkflowStep } from "../../api/rtk/index.ts";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.ts";
import { useAppDispatch } from "../../state/redux.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button, button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { ConfirmPopover } from "@/components/ui/confirm-popover.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import type { IconName } from "@/components/ui/icon.tsx";
import { field, Input } from "@/components/ui/input.tsx";
import { help, label } from "@/components/ui/label.tsx";
import { Select } from "@/components/ui/select.tsx";
import { Tabs } from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { cn } from "@/lib/utils.ts";
import { timeAgo } from "../../data/dates.ts";
import { GroupEditor } from "./rules/ConditionBuilder.tsx";
import { conditionLabel, countConditions, newCondition, newGroup, uid } from "./rules/model.ts";
import type { Field } from "./rules/model.ts";
import { RunList } from "./Runs.tsx";
import { LoadError, Loading } from "./ui.tsx";
import { WORKFLOW_STATUS, table } from "./lib.ts";

type StepType = WorkflowStep["type"];

const CATEGORY_ICON: Record<string, IconName> = { Flow: "rules", Wait: "clock", Message: "send", People: "users", Team: "shield", Trigger: "spark" };
const CATEGORY_TONE: Record<string, string> = {
  Trigger: "bg-ink text-on-ink",
  Flow: "bg-sky text-sky-ink",
  Wait: "bg-butter text-butter-ink",
  Message: "bg-mint text-forest",
  People: "bg-cream text-butter-ink-deep",
  Team: "bg-tag-red/12 text-tag-red-deep",
};

/** Selection in the editor: the trigger, a step, or the picker for a new step at a position. */
type Selection = { kind: "trigger" } | { kind: "step"; id: string } | { kind: "add"; at: number } | null;

export function AdminWorkflow() {
  const { id = "" } = useParams();
  const dispatch = useAppDispatch();
  const { data, error, refetch } = useGetWorkflowQuery({ id }, { skip: !id });
  const { data: catalog } = useGetAutomationCatalogQuery();
  const { data: ruleSets } = useListRuleSetsQuery();
  if (error && !data) return <LoadError error={problemMessage(error)} onRetry={() => void refetch()} />;
  if (!data || !catalog) return <Loading height="h-96" />;
  // Writes already update the cache (endpoints.ts); this covers callers holding a detail.
  const onSaved = (w: WorkflowDetail) => dispatch(api.util.upsertQueryData("getWorkflow", { id: w.id }, w));
  return <Editor key={`${data.id}-${data.revision}`} wf={data} catalog={catalog} ruleSets={ruleSets?.data ?? []} onSaved={onSaved} />;
}

function Editor({ wf, catalog, ruleSets, onSaved }: { wf: WorkflowDetail; catalog: AutomationCatalog; ruleSets: RuleSetSummary[]; onSaved: (w: WorkflowDetail) => void }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as "steps" | "runs" | "versions" | null) ?? "steps";
  const [graph, setGraph] = useState<WorkflowGraph>(wf.draft);
  const [name, setName] = useState(wf.name);
  const [selected, setSelected] = useState<Selection>({ kind: "trigger" });
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const dirty = JSON.stringify(graph) !== JSON.stringify(wf.draft) || name !== wf.name;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const trigger = catalog.triggers.find((t) => t.type === graph.trigger.type);
  const fields: Field[] = useMemo(
    () => [
      ...catalog.userFacts.map((f) => ({ ...f })),
      ...(trigger?.fields ?? []).map((f) => ({ path: `event.${f.name}`, type: f.type, label: `Event: ${f.name}` })),
      { path: "decision", type: "any" as const, label: "Outputs of the last Decision step (decision.<output>)" },
    ],
    [catalog.userFacts, trigger],
  );

  const [saveDraft] = useSaveWorkflowDraftMutation();
  const [publish] = usePublishWorkflowMutation();
  const [activate] = useActivateWorkflowMutation();
  const [pause] = usePauseWorkflowMutation();
  const [discard] = useDiscardWorkflowDraftMutation();
  const [remove] = useDeleteWorkflowMutation();
  const [startRun] = useStartWorkflowRunMutation();
  const save = () => saveDraft({ id: wf.id, updateWorkflowDraftRequest: { revision: wf.revision, name, draft: graph } }).unwrap();
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(problemMessage(e, label));
    } finally {
      setBusy(false);
    }
  };
  const id = wf.id;

  const onSave = () => run("Couldn't save.", async () => {
    onSaved(await save());
    toast.success("Draft saved.");
  });
  const onPublish = () => run("Couldn't publish.", async () => {
    if (dirty) await save();
    const r = await publish({ id }).unwrap();
    setProblems(r.problems);
    // Publishing invalidates this workflow, so the page refetches it.
    if (r.published) toast.success(`Published as version ${r.version}. It's on.`);
  });
  const onStatus = (on: boolean) => run("Couldn't change that.", async () => {
    await (on ? activate({ id }) : pause({ id })).unwrap();
    toast.success(on ? "Workflow is on." : "Paused. Runs already waiting will still finish.");
  });
  const onDiscard = () => run("Couldn't discard.", async () => {
    await discard({ id }).unwrap();
    toast.success("Edits discarded.");
  });
  const onDelete = () => run("Couldn't delete.", async () => {
    await remove({ id }).unwrap();
    toast.success("Workflow deleted.");
    void navigate("/admin/workflows");
  });
  const onTest = (userId?: string) => run("Couldn't start a test.", async () => {
    if (dirty) await save();
    await startRun({ id, startWorkflowRunRequest: { mode: "test", userId } }).unwrap();
    toast.success("Test started. Waits are skipped; see it in Runs in a moment.");
    setParams({ tab: "runs" }, { replace: true });
  });

  const steps = graph.steps;
  const setStep = (id: string, next: WorkflowStep | null) => setGraph({ ...graph, steps: next ? steps.map((s) => (s.id === id ? next : s)) : steps.filter((s) => s.id !== id) });
  const insert = (at: number, type: StepType) => {
    const step = newStep(type, ruleSets);
    setGraph({ ...graph, steps: [...steps.slice(0, at), step, ...steps.slice(at)] });
    setSelected({ kind: "step", id: step.id });
  };
  const move = (id: string, d: number) => {
    const i = steps.findIndex((s) => s.id === id);
    if (i + d < 0 || i + d >= steps.length) return;
    const next = [...steps];
    const [s] = next.splice(i, 1);
    next.splice(i + d, 0, s);
    setGraph({ ...graph, steps: next });
  };
  const selectedStep = selected?.kind === "step" ? steps.find((s) => s.id === selected.id) : undefined;

  return (
    <>
      <Link to="/admin/workflows" className="flex items-center gap-1 text-sm font-medium text-ink-soft no-underline">
        <Icon name="back" size={16} /> Workflows
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 flex-1 gap-1">
          <input className={field("sm", "max-w-xl border-transparent text-2xl font-bold hover:border-line")} value={name} onChange={(e) => setName(e.target.value)} aria-label="Workflow name" />
          <div className="flex flex-wrap items-center gap-1.5 px-2.5 text-sm text-ink-soft">
            <Badge tone={WORKFLOW_STATUS[wf.status].tone}>{WORKFLOW_STATUS[wf.status].label}</Badge>
            {wf.publishedVersion ? <span>Live: v{wf.publishedVersion}</span> : <span>Never published</span>}
            {dirty ? <span className="font-medium text-butter-ink">· Unsaved changes</span> : wf.hasUnpublishedChanges && wf.publishedVersion ? <span className="font-medium text-butter-ink">· Saved, not published</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TestButton disabled={busy} onTest={onTest} />
          <Button variant="quiet" size="sm" disabled={busy || !dirty} onClick={() => void onSave()}>
            Save draft
          </Button>
          {wf.publishedVersion ? (
            wf.status === "active" ? (
              <Button variant="quiet" size="sm" disabled={busy} onClick={() => void onStatus(false)}>
                <Icon name="pause" size={14} /> Pause
              </Button>
            ) : (
              <Button variant="quiet" size="sm" disabled={busy} onClick={() => void onStatus(true)}>
                <Icon name="play" size={14} /> Turn on
              </Button>
            )
          ) : null}
          <Button size="sm" disabled={busy || (!dirty && !wf.hasUnpublishedChanges)} onClick={() => void onPublish()}>
            Publish
          </Button>
        </div>
      </header>

      {problems.length ? (
        <div className="grid gap-1 rounded-2xl bg-tag-red/10 px-4 py-3 text-tag-red-deep" role="alert">
          <strong>Couldn't publish:</strong>
          <ul className="m-0 pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Tabs
        value={tab}
        onChange={(t) => setParams(t === "steps" ? {} : { tab: t }, { replace: true })}
        tabs={[
          { id: "steps", label: "Steps" },
          { id: "runs", label: `Runs${wf.runs7d ? ` (${wf.runs7d} this week)` : ""}` },
          { id: "versions", label: "Versions" },
        ]}
      />

      {tab === "steps" ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
          {/* The flow: a vertical canvas of nodes joined by connectors, read top to bottom. */}
          <div className="grid justify-items-center rounded-3xl border border-line bg-[radial-gradient(var(--color-line)_1px,transparent_1px)] bg-size-[18px_18px] px-3 py-6">
            <Node
              category="Trigger"
              title={trigger?.label ?? graph.trigger.type}
              summary={graph.trigger.when?.items.length ? `Only if ${countConditions(graph.trigger.when)} condition${countConditions(graph.trigger.when) === 1 ? "" : "s"} hold` : "Every time"}
              selected={selected?.kind === "trigger"}
              onClick={() => setSelected({ kind: "trigger" })}
            />
            {steps.map((s, i) => {
              const meta = catalog.steps.find((x) => x.type === s.type);
              return (
                <div key={s.id} className="grid justify-items-center">
                  <Connector onAdd={() => setSelected({ kind: "add", at: i })} active={selected?.kind === "add" && selected.at === i} />
                  <Node
                    category={meta?.category ?? "Flow"}
                    title={meta?.label ?? s.type}
                    summary={summarize(s, ruleSets)}
                    selected={selected?.kind === "step" && selected.id === s.id}
                    onClick={() => setSelected({ kind: "step", id: s.id })}
                    menu={
                      <>
                        <MenuBtn icon="up" label="Move up" disabled={i === 0} onClick={() => move(s.id, -1)} />
                        <MenuBtn icon="down" label="Move down" disabled={i === steps.length - 1} onClick={() => move(s.id, 1)} />
                        <MenuBtn icon="copy" label="Duplicate" onClick={() => setGraph({ ...graph, steps: [...steps.slice(0, i + 1), { ...structuredClone(s), id: uid("s") }, ...steps.slice(i + 1)] })} />
                        <ConfirmPopover
                          trigger={<MenuBtn icon="trash" label="Delete step" />}
                          title={`Delete “${meta?.label ?? s.type}”?`}
                          description="The step and its settings are removed from this draft."
                          confirmLabel="Delete step"
                          onConfirm={() => setStep(s.id, null)}
                        />
                      </>
                    }
                  />
                </div>
              );
            })}
            <Connector onAdd={() => setSelected({ kind: "add", at: steps.length })} active={selected?.kind === "add" && selected.at === steps.length} />
            <button
              type="button"
              onClick={() => setSelected({ kind: "add", at: steps.length })}
              className={cn(
                "flex w-full max-w-[22rem] items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-4 font-medium",
                selected?.kind === "add" && selected.at === steps.length ? "border-ink bg-paper text-ink" : "border-line-strong bg-paper/70 text-ink-soft hover:border-ink hover:text-ink",
              )}
            >
              <Icon name="plus" size={18} /> Add a step
            </button>
          </div>

          <aside className="sticky top-4 grid gap-3" aria-label="Step settings">
            {selected?.kind === "trigger" ? (
              <Panel title="Trigger" subtitle="What starts a run. Each run is about one person: the one the event is about.">
                <label className="grid gap-1">
                  <span className={label}>When this happens</span>
                  <Select fieldSize="sm" value={graph.trigger.type} onChange={(e) => setGraph({ ...graph, trigger: { ...graph.trigger, type: e.target.value as WorkflowGraph["trigger"]["type"] } })}>
                    {catalog.triggers.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </label>
                {trigger?.fields.length ? (
                  <p className={help}>
                    The event carries: {trigger.fields.map((f) => <code key={f.name} className="mr-1 rounded bg-fridge px-1 text-xs">event.{f.name}</code>)}
                  </p>
                ) : null}
                <div className="grid gap-1.5">
                  <span className={label}>Only start if… (optional)</span>
                  {graph.trigger.when ? (
                    <>
                      <GroupEditor group={graph.trigger.when} fields={fields} onChange={(when) => setGraph({ ...graph, trigger: { ...graph.trigger, when } })} />
                      <ConfirmPopover
                        trigger={
                          <button type="button" className="justify-self-start border-0 bg-transparent p-0 text-sm font-medium text-ink-soft underline">
                            Remove conditions
                          </button>
                        }
                        align="start"
                        title="Remove all start conditions?"
                        description="Every event of this type will start a run."
                        confirmLabel="Remove"
                        onConfirm={() => setGraph({ ...graph, trigger: { type: graph.trigger.type } })}
                      />
                    </>
                  ) : (
                    <Button variant="quiet" size="sm" className="justify-self-start" onClick={() => setGraph({ ...graph, trigger: { ...graph.trigger, when: newGroup("all", [newCondition("user.streak", "gte")]) } })}>
                      <Icon name="plus" size={16} /> Add conditions
                    </Button>
                  )}
                </div>
              </Panel>
            ) : selected?.kind === "add" ? (
              <Panel title="Add a step" subtitle={selected.at === steps.length ? "At the end." : `Before step ${selected.at + 1}.`}>
                {groupBy(catalog.steps, (s) => s.category).map(([category, items]) => (
                  <div key={category} className="grid gap-1.5">
                    <p className="text-xs font-semibold tracking-[0.06em] text-ink-faint uppercase">{category}</p>
                    {items.map((s) => (
                      <button
                        key={s.type}
                        type="button"
                        onClick={() => insert(selected.at, s.type as StepType)}
                        className="flex items-start gap-3 rounded-xl border border-line bg-paper p-2.5 text-left hover:border-ink"
                      >
                        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", CATEGORY_TONE[category])}>
                          <Icon name={CATEGORY_ICON[category] ?? "flow"} size={16} />
                        </span>
                        <span className="grid">
                          <strong className="text-sm">{s.label}</strong>
                          <span className="text-xs text-ink-soft">{s.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </Panel>
            ) : selectedStep ? (
              <StepPanel key={selectedStep.id} step={selectedStep} onChange={(s) => setStep(selectedStep.id, s)} fields={fields} ruleSets={ruleSets} catalog={catalog} triggerFields={trigger?.fields.map((f) => f.name) ?? []} />
            ) : (
              <Panel title="Nothing selected" subtitle="Click the trigger or a step to change it, or a + to add a step." />
            )}
            <Card className="grid gap-2 p-3.5 text-sm">
              <p className="font-semibold">Before anything is sent</p>
              <p className="text-ink-soft">
                Push, email and Activity steps check the <Link to="/admin/rules">send policy</Link> first: quiet hours and daily caps for every workflow. Blocked messages show as skipped in Runs.
              </p>
            </Card>
            <div className="flex flex-wrap gap-2">
              {wf.publishedVersion && (dirty || wf.hasUnpublishedChanges) ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="quiet" size="sm" disabled={busy}>
                      Discard edits
                    </Button>
                  }
                  title="Discard your edits?"
                  description={`The draft goes back to live version ${wf.publishedVersion}. Unpublished changes are lost.`}
                  confirmLabel="Discard edits"
                  pendingLabel="Discarding…"
                  onConfirm={onDiscard}
                />
              ) : null}
              {wf.status !== "active" ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="quiet" size="sm" disabled={busy} className="text-tag-red-deep">
                      <Icon name="trash" size={14} /> Delete workflow
                    </Button>
                  }
                  title={`Delete “${wf.name}”?`}
                  description="The workflow and all of its runs are deleted. You can't undo this."
                  confirmLabel="Delete workflow"
                  pendingLabel="Deleting…"
                  onConfirm={onDelete}
                />
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
      {tab === "runs" ? <RunList workflowId={wf.id} /> : null}
      {tab === "versions" ? <Versions wf={wf} onRestored={onSaved} /> : null}
    </>
  );
}

/* --------------------------------------------------------------- the flow */

function Node({
  category,
  title,
  summary,
  selected,
  onClick,
  menu,
}: {
  category: string;
  title: string;
  summary: string;
  selected: boolean;
  onClick: () => void;
  menu?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "group/node relative w-full max-w-[22rem] rounded-2xl border-2 bg-paper shadow-[0_6px_16px_-12px_rgb(28_35_64/0.5)] transition-[border-color]",
        selected ? "border-ink" : "border-line hover:border-line-strong",
      )}
    >
      <button type="button" onClick={onClick} className="grid w-full gap-1.5 border-0 bg-transparent p-3 text-left" aria-pressed={selected}>
        <span className={cn("inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold tracking-[0.06em] uppercase", CATEGORY_TONE[category] ?? "bg-fridge")}>
          <Icon name={CATEGORY_ICON[category] ?? "flow"} size={12} /> {category}
        </span>
        <span className="font-semibold">{title}</span>
        <span className="line-clamp-2 text-sm text-ink-soft">{summary}</span>
      </button>
      {menu ? <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 transition-opacity group-focus-within/node:opacity-100 group-hover/node:opacity-100 has-data-popup-open:opacity-100">{menu}</div> : null}
    </div>
  );
}

function Connector({ onAdd, active }: { onAdd: () => void; active: boolean }) {
  return (
    <div className="group/conn relative flex h-12 w-full items-center justify-center" aria-hidden={false}>
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-line-strong" />
      <button
        type="button"
        onClick={onAdd}
        aria-label="Insert a step here"
        className={cn(
          "relative z-1 grid size-7 place-items-center rounded-full border-2 bg-paper transition-opacity",
          active ? "border-ink text-ink opacity-100" : "border-line-strong text-ink-soft opacity-0 group-hover/conn:opacity-100 focus:opacity-100",
        )}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}

function MenuBtn({ icon, label: l, className, ...props }: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" title={l} aria-label={l} className={cn("grid size-7 place-items-center rounded-lg border-0 bg-paper text-ink-soft hover:bg-fridge hover:text-ink disabled:opacity-30 data-popup-open:bg-fridge data-popup-open:text-ink", className)} {...props}>
      <Icon name={icon} size={14} />
    </button>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <Card className="grid gap-3 p-4">
      <div className="grid gap-0.5">
        <h2 className="text-lg">{title}</h2>
        {subtitle ? <p className={help}>{subtitle}</p> : null}
      </div>
      {children}
    </Card>
  );
}

/* -------------------------------------------------------------- step forms */

function StepPanel({
  step,
  onChange,
  fields,
  ruleSets,
  catalog,
  triggerFields,
}: {
  step: WorkflowStep;
  onChange: (s: WorkflowStep) => void;
  fields: Field[];
  ruleSets: RuleSetSummary[];
  catalog: AutomationCatalog;
  triggerFields: string[];
}) {
  const meta = catalog.steps.find((s) => s.type === step.type);
  const vars = ["user.firstName", "user.name", "user.streak", "user.handle", ...triggerFields.map((f) => `event.${f}`), "decision.<output>"];

  let body: ReactNode = null;
  switch (step.type) {
    case "filter":
      body = (
        <>
          <TextField label="Label" value={step.name ?? ""} onChange={(name) => onChange({ ...step, name })} placeholder="e.g. Has a streak worth saving" />
          <GroupEditor group={step.when} fields={fields} onChange={(when) => onChange({ ...step, when })} />
        </>
      );
      break;
    case "decision": {
      const usable = ruleSets.filter((r) => r.status !== "archived");
      body = (
        <>
          <label className="grid gap-1">
            <span className={label}>Rule set</span>
            <Select fieldSize="sm" value={step.ruleSetKey} onChange={(e) => onChange({ ...step, ruleSetKey: e.target.value })}>
              {!usable.some((r) => r.key === step.ruleSetKey) ? <option value={step.ruleSetKey}>{step.ruleSetKey || "Pick one"}</option> : null}
              {usable.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name} ({r.key}){r.liveVersion ? "" : " · not published"}
                </option>
              ))}
            </Select>
            <span className={help}>
              It gets the person (user.*) and the event (event.*) as facts. Later steps read its outputs as <code>decision.&lt;output&gt;</code>.{" "}
              <Link to="/admin/rules">Manage rule sets</Link>
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-4.5 accent-ink" checked={step.stopUnlessMatched ?? false} onChange={(e) => onChange({ ...step, stopUnlessMatched: e.target.checked })} />
            Stop the run if no rule matched
          </label>
        </>
      );
      break;
    }
    case "delay": {
      const unit = step.minutes % 1440 === 0 ? 1440 : step.minutes % 60 === 0 ? 60 : 1;
      body = (
        <div className="flex gap-2">
          <Input fieldSize="sm" type="number" min={1} className="w-28" value={step.minutes / unit} onChange={(e) => onChange({ ...step, minutes: Math.max(1, Math.round(Number(e.target.value) || 1)) * unit })} aria-label="How long" />
          <Select fieldSize="sm" className="w-36" value={unit} onChange={(e) => onChange({ ...step, minutes: Math.max(1, Math.round(step.minutes / unit)) * Number(e.target.value) })} aria-label="Unit">
            <option value={1}>minutes</option>
            <option value={60}>hours</option>
            <option value={1440}>days</option>
          </Select>
        </div>
      );
      break;
    }
    case "wait_until_hour":
      body = (
        <label className="grid gap-1">
          <span className={label}>Their local time</span>
          <Select fieldSize="sm" value={step.hour} onChange={(e) => onChange({ ...step, hour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h === 0 ? "Midnight" : h < 12 ? `${h}am` : h === 12 ? "Noon" : `${h - 12}pm`}
              </option>
            ))}
          </Select>
          <span className={help}>If it's already that hour, it carries on straight away.</span>
        </label>
      );
      break;
    case "send_push":
    case "notify":
    case "alert_staff":
      body = (
        <>
          <TextField label="Title" value={step.title} onChange={(title) => onChange({ ...step, title })} />
          <TextField label="Text" value={step.body ?? ""} onChange={(b) => onChange({ ...step, body: b })} multiline />
          <TextField label="Opens" value={step.url ?? ""} onChange={(url) => onChange({ ...step, url })} placeholder="/" />
          <TemplateVars vars={vars} />
        </>
      );
      break;
    case "send_email":
      body = (
        <>
          <TextField label="Subject" value={step.subject} onChange={(subject) => onChange({ ...step, subject })} />
          <TextField label="Message" value={step.body} onChange={(b) => onChange({ ...step, body: b })} multiline rows={8} />
          <p className={help}>Plain text; blank lines become paragraphs. A footer explaining why they got it is added.</p>
          <TemplateVars vars={vars} />
        </>
      );
      break;
    case "add_tag":
    case "remove_tag":
      body = (
        <TextField
          label="Tag"
          value={step.tag}
          onChange={(tag) => onChange({ ...step, tag: tag.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
          placeholder="e.g. lapsing"
        />
      );
      break;
  }
  return (
    <Panel title={meta?.label ?? step.type} subtitle={meta?.description}>
      {body}
    </Panel>
  );
}

function TextField({ label: l, value, onChange, placeholder, multiline, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; rows?: number }) {
  return (
    <label className="grid gap-1">
      <span className={label}>{l}</span>
      {multiline ? (
        <Textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <Input fieldSize="sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </label>
  );
}

function TemplateVars({ vars }: { vars: string[] }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-semibold tracking-[0.06em] text-ink-faint uppercase">Fill in from the run (click to copy)</span>
      <div className="flex flex-wrap gap-1">
        {vars.map((v) => (
          <button
            key={v}
            type="button"
            className="rounded-md border border-line bg-fridge px-1.5 py-0.5 font-mono text-xs hover:border-ink"
            onClick={() => {
              void navigator.clipboard?.writeText(`{{${v}}}`).then(() => toast.success(`Copied {{${v}}}`));
            }}
          >
            {`{{${v}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function TestButton({ onTest, disabled }: { onTest: (userId?: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim(), 250);
  const { data: found } = useListAdminUsersQuery({ q: search, size: 10 }, { skip: !open || search.length < 2 });
  const matches = open && search.length >= 2 ? (found?.data ?? []) : [];
  return (
    <div className="relative">
      <Button variant="quiet" size="sm" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="play" size={14} /> Test
      </Button>
      {open ? (
        <Card className="absolute top-[calc(100%+6px)] right-0 z-30 grid w-80 gap-2 p-3 shadow-frame">
          <p className="text-sm text-ink-soft">Runs your current draft for one person. Waits are skipped and messages really send, so try it on yourself first.</p>
          <Button
            size="sm"
            onClick={() => {
              setOpen(false);
              onTest();
            }}
          >
            Test on me
          </Button>
          <input className={field("sm")} placeholder="…or find someone by name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a person" />
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-left text-sm hover:border-ink-faint hover:bg-fridge"
              onClick={() => {
                setOpen(false);
                onTest(m.id);
              }}
            >
              <strong>{m.name}</strong> <span className="text-ink-soft">{m.handle ? `@${m.handle}` : m.email}</span>
            </button>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- versions */

function Versions({ wf, onRestored }: { wf: WorkflowDetail; onRestored: (w: WorkflowDetail) => void }) {
  const { data: versions } = useListWorkflowVersionsQuery({ id: wf.id });
  const data = versions?.data;
  const [restoreVersion] = useRestoreWorkflowVersionMutation();
  const restore = async (version: number) => {
    try {
      onRestored(await restoreVersion({ id: wf.id, version }).unwrap());
      toast.success(`Version ${version} copied into the draft. Publish to use it.`);
    } catch (e) {
      toast.error(problemMessage(e));
    }
  };
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead>
          <tr>
            <th className={table.th}>Version</th>
            <th className={table.th}>Trigger</th>
            <th className={table.th}>Published</th>
            <th className={table.th} />
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((v) => (
            <tr key={v.version} className={table.row}>
              <td className={table.td}>
                <strong>v{v.version}</strong> {v.version === wf.publishedVersion ? <Badge tone="green">live</Badge> : null}
                <span className="block text-xs text-ink-soft">{v.stepCount} steps</span>
              </td>
              <td className={`${table.td} font-mono text-xs`}>{v.triggerType}</td>
              <td className={`${table.td} text-ink-soft`}>
                {timeAgo(v.publishedAt)}
                {v.publishedBy ? ` by @${v.publishedBy}` : ""}
              </td>
              <td className={`${table.td} text-right`}>
                <button type="button" className={button({ variant: "quiet", size: "sm" })} onClick={() => void restore(v.version)}>
                  Restore to draft
                </button>
              </td>
            </tr>
          ))}
          {data && !data.length ? (
            <tr>
              <td className={table.td} colSpan={4}>
                Not published yet. Runs always use the version they started on, so editing never affects runs in flight.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------------------------------------------- helpers */

function newStep(type: StepType, ruleSets: RuleSetSummary[]): WorkflowStep {
  const id = uid("s");
  switch (type) {
    case "filter":
      return { id, type, name: "", when: newGroup("all", [newCondition("user.streak", "gte")]) };
    case "decision":
      return { id, type, name: "", ruleSetKey: ruleSets.find((r) => r.decisionPoint === "workflow" && r.liveVersion)?.key ?? "", stopUnlessMatched: false };
    case "delay":
      return { id, type, minutes: 60 };
    case "wait_until_hour":
      return { id, type, hour: 18 };
    case "send_push":
      return { id, type, title: "Hi {{user.firstName}}", body: "", url: "/" };
    case "notify":
      return { id, type, title: "Hi {{user.firstName}}", body: "", url: "/" };
    case "send_email":
      return { id, type, subject: "A note from Daddy Jokes", body: "Hi {{user.firstName}},\n\n" };
    case "add_tag":
    case "remove_tag":
      return { id, type, tag: "" };
    case "alert_staff":
      return { id, type, title: "Heads up", body: "", url: "/admin" };
  }
}

function summarize(s: WorkflowStep, ruleSets: RuleSetSummary[]): string {
  switch (s.type) {
    case "filter": {
      const first = s.when.items[0];
      const n = countConditions(s.when);
      return s.name || (first && first.kind === "condition" ? `${conditionLabel(first)}${n > 1 ? ` (+${n - 1} more)` : ""}` : "No conditions yet");
    }
    case "decision":
      return s.ruleSetKey ? `Ask ${ruleSets.find((r) => r.key === s.ruleSetKey)?.name ?? s.ruleSetKey}` : "Pick a rule set";
    case "delay":
      return s.minutes % 1440 === 0 ? `${s.minutes / 1440} day${s.minutes === 1440 ? "" : "s"}` : s.minutes % 60 === 0 ? `${s.minutes / 60} hour${s.minutes === 60 ? "" : "s"}` : `${s.minutes} minutes`;
    case "wait_until_hour":
      return `Until ${s.hour}:00 their time`;
    case "send_push":
    case "notify":
    case "alert_staff":
      return s.title || "No title yet";
    case "send_email":
      return s.subject || "No subject yet";
    case "add_tag":
    case "remove_tag":
      return s.tag ? `“${s.tag}”` : "Pick a tag";
  }
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return [...m.entries()];
}
