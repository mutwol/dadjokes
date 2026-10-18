import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { problemMessage, useGetRunQuery, useListRunsQuery, useListWorkflowRunsQuery } from "../../api/rtk/index.ts";
import type { WorkflowRun } from "../../api/rtk/index.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { cn } from "@/lib/utils.ts";
import { DataTable, columnsFor, useDataTableState } from "../../components/table/index.ts";
import type { FacetFilterDef } from "../../components/table/index.ts";
import { timeAgo } from "../../data/dates.ts";
import { LoadError, Loading, PageHeader } from "./ui.tsx";
import { RUN_TONE } from "./lib.ts";

type Status = WorkflowRun["status"];
const STEP_LABEL: Record<string, string> = { ok: "done", stopped: "stopped here", skipped: "skipped", failed: "failed", waiting: "waiting" };
const STATUS_FACET: FacetFilterDef = {
  id: "status",
  label: "Status",
  single: true,
  options: [
    { value: "completed", label: "Completed" },
    { value: "waiting", label: "Waiting" },
    { value: "stopped", label: "Stopped by a filter" },
    { value: "failed", label: "Failed" },
    { value: "running", label: "Running" },
  ],
};
const col = columnsFor<WorkflowRun>();
/** Runs change on their own (waits resume, steps finish): keep the list fresh while it's open. */
const LIVE = { pollingInterval: 15_000, skipPollingIfUnfocused: true, refetchOnFocus: true } as const;

/** Every workflow run, newest first. */
export function AdminRuns() {
  return (
    <>
      <PageHeader title="Runs" description="Each run is one workflow for one person. Open one to see every step, what it decided and why." />
      <RunList />
    </>
  );
}

/** A list of runs (all, or one workflow's) with a detail panel for the selected run. */
export function RunList({ workflowId }: { workflowId?: string }) {
  const [params, setParams] = useSearchParams();
  const selected = params.get("run");
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("run", id);
    else next.delete("run");
    setParams(next, { replace: true });
  };
  const state = useDataTableState({ id: "admin-runs", prefix: workflowId ? "r" : "", filterKeys: ["status"], defaultSort: [{ id: "startedAt", desc: true }] });
  const status = state.filters.status?.[0] as Status | undefined;
  // The API filters by status and returns the latest 100; the table searches and sorts those.
  const all = useListRunsQuery({ status, limit: 100 }, { skip: Boolean(workflowId), ...LIVE });
  const one = useListWorkflowRunsQuery({ id: workflowId ?? "", status, limit: 100 }, { skip: !workflowId, ...LIVE });
  const q = workflowId ? one : all;

  const columns = useMemo(
    () => [
      col.accessor("status", {
        header: "Status",
        meta: { label: "Status", alwaysVisible: true },
        cell: ({ row: { original: r } }) => (
          <div className="flex flex-wrap gap-1">
            <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge>
            {r.test ? <Badge tone="blue">test</Badge> : null}
          </div>
        ),
      }),
      ...(workflowId
        ? []
        : [
            col.accessor("workflowName", {
              header: "Workflow",
              sortFn: "alphanumeric",
              meta: { label: "Workflow" },
              cell: ({ row: { original: r } }) => (
                <div className="grid">
                  <span className="font-medium">{r.workflowName}</span>
                  <span className="text-xs text-ink-soft">{r.workflowVersion ? `v${r.workflowVersion}` : "draft"}</span>
                </div>
              ),
            }),
          ]),
      col.accessor((r) => (r.user ? r.user.handle || r.user.name : ""), {
        id: "user",
        header: "For",
        sortFn: "alphanumeric",
        meta: { label: "For" },
        cell: ({ getValue }) => (getValue() ? `@${getValue()}` : <span className="text-ink-faint">—</span>),
      }),
      col.accessor("eventType", { header: "Started by", meta: { label: "Started by", className: "font-mono text-xs" } }),
      col.accessor("startedAt", {
        header: "When",
        sortFn: "datetime",
        meta: { label: "When", className: "whitespace-nowrap text-ink-soft" },
        cell: ({ getValue }) => <span title={new Date(getValue()).toLocaleString()}>{timeAgo(getValue())}</span>,
      }),
    ],
    [workflowId],
  );

  return (
    <div className={cn("grid items-start gap-4", selected && "lg:grid-cols-[minmax(0,1fr)_28rem]")}>
      <DataTable
        caption={workflowId ? "Runs of this workflow" : "Workflow runs"}
        data={q.data?.data}
        columns={columns}
        getRowId={(r) => r.id}
        state={state}
        facets={[STATUS_FACET]}
        loading={q.isLoading}
        fetching={q.isFetching}
        error={q.error && !q.data ? problemMessage(q.error) : null}
        onRetry={() => void q.refetch()}
        searchPlaceholder="Search workflow, person or event"
        noun={["run", "runs"]}
        onRowClick={(r) => select(r.id)}
        activeRowId={selected}
        emptyMessage="No runs yet."
        toolbarEnd={
          <button type="button" className={button({ variant: "ghost", size: "sm" })} onClick={() => void q.refetch()} title="Refreshes every 15 seconds on its own">
            <Icon name="replay" size={16} />
            <span className="max-sm:sr-only">Refresh</span>
          </button>
        }
      />
      {selected ? <RunDetail id={selected} onClose={() => select(null)} /> : null}
    </div>
  );
}

function RunDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: run, error, refetch } = useGetRunQuery({ runId: id }, LIVE);
  // Keep the last run on screen while a newly picked one loads, but not a stale one for a different id.
  const data = run?.id === id ? run : undefined;
  return (
    <Card as="aside" className="sticky top-4 grid gap-3 p-4" aria-label="Run">
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 className="text-lg">{data?.workflowName ?? "Run"}</h2>
          {data ? (
            <p className="text-sm text-ink-soft">
              {data.user ? (
                <Link to={`/admin/people/${data.user.id}`} className="font-medium text-ink">
                  {data.user.name}
                </Link>
              ) : (
                "No person"
              )}{" "}
              · {timeAgo(data.startedAt)} · {data.workflowVersion ? `v${data.workflowVersion}` : "draft test"}
            </p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md border-0 bg-transparent text-ink-soft hover:bg-fridge">
          <Icon name="close" size={16} />
        </button>
      </div>
      {error && !data ? <LoadError error={problemMessage(error)} onRetry={() => void refetch()} /> : !data ? <Loading height="h-48" /> : null}
      {data ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={RUN_TONE[data.status]}>{data.status}</Badge>
            {data.resumeAt ? <span className="text-sm text-ink-soft">resumes {new Date(data.resumeAt).toLocaleString()}</span> : null}
          </div>
          {data.error ? <p className="rounded-md border border-tag-red/30 bg-tag-red/8 px-3 py-2 text-sm font-medium text-tag-red-deep">{data.error}</p> : null}
          <ol className="m-0 grid list-none gap-0 p-0">
            {data.steps.map((s, i) => (
              <li key={`${s.stepId}-${i}`} className="relative grid grid-cols-[1.5rem_1fr] gap-2.5 pb-3 last:pb-0">
                {i < data.steps.length - 1 ? <span className="absolute top-6 bottom-0 left-[0.6875rem] w-0.5 bg-line" aria-hidden="true" /> : null}
                <span
                  className={cn(
                    "relative z-1 mt-0.5 grid size-6 place-items-center rounded-full text-white",
                    s.status === "ok" ? "bg-lawn" : s.status === "failed" ? "bg-tag-red" : s.status === "waiting" ? "theme-light bg-highlighter text-ink" : "bg-line-strong",
                  )}
                >
                  <Icon name={s.status === "ok" ? "check" : s.status === "failed" ? "close" : s.status === "waiting" ? "clock" : "chevron"} size={12} />
                </span>
                <div className="grid min-w-0 gap-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm">
                    <strong className="font-mono">{s.type}</strong>
                    <Badge tone={RUN_TONE[s.status] ?? "grey"}>{STEP_LABEL[s.status] ?? s.status}</Badge>
                    <span className="text-xs text-ink-soft">{new Date(s.at).toLocaleTimeString()}</span>
                  </p>
                  {s.error ? <p className="text-sm text-tag-red-deep">{s.error}</p> : null}
                  {s.output ? <StepOutput output={s.output} /> : null}
                </div>
              </li>
            ))}
            {!data.steps.length ? <li className="text-sm text-ink-soft">No steps ran yet.</li> : null}
          </ol>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-ink-soft">The event</summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-fridge p-2.5 font-mono text-xs">{JSON.stringify(data.event, null, 2)}</pre>
          </details>
        </>
      ) : null}
    </Card>
  );
}

function StepOutput({ output }: { output: unknown }) {
  const o = output as Record<string, unknown>;
  if (typeof o.reason === "string") return <p className="text-sm text-ink-soft">{o.reason}</p>;
  if (typeof o.title === "string") return <p className="text-sm text-ink-soft">“{o.title}”{typeof o.to === "string" ? ` → ${o.to}` : ""}</p>;
  if (typeof o.passed === "boolean") return <p className="text-sm text-ink-soft">{o.passed ? "Conditions held." : "Conditions didn't hold, so the run stopped."}</p>;
  return <pre className="m-0 max-h-32 overflow-auto rounded-lg bg-fridge p-2 font-mono text-xs">{JSON.stringify(output, null, 2)}</pre>;
}
