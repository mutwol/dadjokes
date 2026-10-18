import { useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import {
  problemMessage,
  useCreateWorkflowMutation,
  useGetAutomationCatalogQuery,
  useGetAutomationStatsQuery,
  useListWorkflowsQuery,
} from "../../api/rtk/index.ts";
import type { AutomationCatalog, WorkflowSummary } from "../../api/rtk/index.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { choice } from "@/components/ui/choice.tsx";
import { Form, FormError, SubmitButton, TextField } from "@/components/ui/form.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { useZodForm } from "@/hooks/useZodForm.ts";
import { DataTable, columnsFor, useDataTableState } from "../../components/table/index.ts";
import type { FacetFilterDef } from "../../components/table/index.ts";
import { timeAgo } from "../../data/dates.ts";
import { PageHeader, StatTile, Tiles } from "./ui.tsx";
import { WORKFLOW_STATUS, num } from "./lib.ts";

const col = columnsFor<WorkflowSummary>();

/** Workflows: what happens automatically when something happens to someone. */
export function AdminWorkflows() {
  const navigate = useNavigate();
  const workflows = useListWorkflowsQuery();
  const { data: catalog } = useGetAutomationCatalogQuery();
  const { data: stats } = useGetAutomationStatsQuery(undefined, { pollingInterval: 30_000, skipPollingIfUnfocused: true });
  const [creating, setCreating] = useState(false);
  // The whole list comes at once, so the table searches, filters and sorts in the browser.
  const state = useDataTableState({ id: "admin-workflows", filterKeys: ["status", "triggerType"], defaultSort: [{ id: "updatedAt", desc: true }] });

  const triggerLabel = useMemo(() => {
    const labels = new Map(catalog?.triggers.map((t) => [t.type, t.label]));
    return (t: string) => labels.get(t) ?? t;
  }, [catalog]);

  const facets = useMemo<FacetFilterDef[]>(
    () => [
      { id: "status", label: "Status", options: Object.entries(WORKFLOW_STATUS).map(([value, s]) => ({ value, label: s.label })) },
      { id: "triggerType", label: "Trigger", options: (catalog?.triggers ?? []).map((t) => ({ value: t.type, label: t.label })) },
    ],
    [catalog],
  );

  const columns = useMemo(
    () => [
      col.accessor("name", {
        header: "Workflow",
        sortFn: "alphanumeric",
        meta: { label: "Workflow", alwaysVisible: true, sticky: true },
        cell: ({ row: { original: w } }) => (
          <div className="grid min-w-48">
            <Link to={`/admin/workflows/${w.id}`} className="font-medium text-ink no-underline hover:underline">
              {w.name}
            </Link>
            <span className="text-xs text-ink-soft">
              {w.stepCount} steps{w.publishedVersion ? ` · v${w.publishedVersion}` : ""}
            </span>
          </div>
        ),
      }),
      col.accessor("triggerType", {
        header: "When",
        meta: { label: "Trigger", className: "text-ink-soft" },
        cell: ({ getValue }) => triggerLabel(getValue()),
      }),
      col.accessor("status", {
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row: { original: w } }) => (
          <div className="flex flex-wrap gap-1">
            <Badge tone={WORKFLOW_STATUS[w.status].tone}>{WORKFLOW_STATUS[w.status].label}</Badge>
            {w.hasUnpublishedChanges && w.publishedVersion ? <Badge tone="yellow">unpublished edits</Badge> : null}
          </div>
        ),
      }),
      col.accessor("runs7d", {
        header: "Runs (7d)",
        sortFn: "basic",
        meta: { label: "Runs (7 days)", align: "right", className: "tabular-nums" },
        cell: ({ row: { original: w } }) => (
          <>
            {num(w.runs7d)}
            {w.failed7d ? <span className="block text-xs font-medium text-tag-red-deep">{w.failed7d} failed</span> : null}
          </>
        ),
      }),
      col.accessor("lastRunAt", {
        header: "Last run",
        sortFn: "datetime",
        sortUndefined: "last",
        meta: { label: "Last run", className: "whitespace-nowrap text-ink-soft" },
        cell: ({ getValue }) => {
          const v = getValue();
          return v ? timeAgo(v) : "Never";
        },
      }),
      col.accessor("updatedAt", {
        header: "Edited",
        sortFn: "datetime",
        meta: { label: "Last edited", className: "whitespace-nowrap text-ink-soft" },
        cell: ({ row: { original: w } }) => (
          <>
            {timeAgo(w.updatedAt)}
            {w.updatedBy ? <span className="block text-xs text-ink-faint">@{w.updatedBy}</span> : null}
          </>
        ),
      }),
    ],
    [triggerLabel],
  );

  return (
    <>
      <PageHeader
        title="Workflows"
        description="When something happens (a joke goes unopened, someone hits a streak), do something: wait, check, message, tag. Every message passes the send policy first, so nobody gets spammed."
        actions={
          <Button size="sm" onClick={() => setCreating(true)} disabled={!catalog}>
            <Icon name="plus" size={16} />
            New workflow
          </Button>
        }
      />
      {stats ? (
        <Tiles>
          <StatTile label="Runs (24h)" value={num(stats.runs24h)} hint={stats.failed24h ? `${stats.failed24h} failed` : "None failed"} tone={stats.failed24h ? "bad" : "plain"} to="/admin/runs" />
          <StatTile label="Waiting" value={num(stats.waitingRuns)} hint="Runs paused on a wait step" />
          <StatTile label="Messages sent (24h)" value={num(stats.messages24h)} hint={`${num(stats.skippedByPolicy24h)} skipped by the send policy`} />
          <StatTile label="Events queued" value={num(stats.pendingEvents)} hint="Processed every few seconds" tone={stats.pendingEvents > 500 ? "warn" : "plain"} />
        </Tiles>
      ) : null}
      {creating && catalog ? <NewWorkflow catalog={catalog} onCancel={() => setCreating(false)} /> : null}
      <DataTable
        caption="Workflows"
        data={workflows.data?.data}
        columns={columns}
        getRowId={(w) => w.id}
        state={state}
        facets={facets}
        loading={workflows.isLoading}
        fetching={workflows.isFetching}
        error={workflows.error && !workflows.data ? problemMessage(workflows.error) : null}
        onRetry={() => void workflows.refetch()}
        searchPlaceholder="Search workflows"
        noun={["workflow", "workflows"]}
        onRowClick={(w) => void navigate(`/admin/workflows/${w.id}`)}
        emptyMessage="No workflows yet. Start from a template: they're drafts until you publish them."
      />
    </>
  );
}

const newWorkflowSchema = z.object({
  templateKey: z.string(),
  name: z.string().trim().min(3, "Give it a name people will recognise.").max(80, "Keep it under 80 characters."),
});

function NewWorkflow({ catalog, onCancel }: { catalog: AutomationCatalog; onCancel: () => void }) {
  const navigate = useNavigate();
  const [create] = useCreateWorkflowMutation();
  const first = catalog.templates[0];
  const form = useZodForm(newWorkflowSchema, { defaultValues: { templateKey: first?.key ?? "", name: first?.name ?? "" } });
  const picked = useWatch({ control: form.control, name: "templateKey" });
  const options = [{ key: "", name: "Blank", description: "Pick a trigger and add steps yourself.", triggerType: "manual", stepCount: 0 }, ...catalog.templates];

  return (
    <Card className="p-4">
      <Form
        form={form}
        onSubmit={async ({ name, templateKey }) => {
          const w = await create({ createWorkflowRequest: { name, templateKey: templateKey || undefined } }).unwrap();
          toast.success(`“${w.name}” created.`);
          void navigate(`/admin/workflows/${w.id}`);
        }}
      >
        <h2 className="text-lg">New workflow</h2>
        <fieldset className="m-0 grid gap-2 border-0 p-0 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="sr-only">Start from</legend>
          {options.map((t) => (
            <label key={t.key || "blank"} className={choice(picked === t.key, { className: "grid gap-1 rounded-lg p-3" })}>
              <input
                type="radio"
                className="sr-only"
                value={t.key}
                {...form.register("templateKey", {
                  // Picking a template fills in its name, unless the person typed their own.
                  onChange: () => {
                    if (!form.getFieldState("name").isDirty) form.setValue("name", t.key ? t.name : "");
                  },
                })}
              />
              <span className="flex items-center gap-2 font-medium">
                <Icon name={t.key ? "flow" : "plus"} size={18} /> {t.name}
              </span>
              <span className="text-sm text-ink-soft">{t.description}</span>
              {t.key ? <span className="text-xs text-ink-faint">{t.stepCount} steps</span> : null}
            </label>
          ))}
        </fieldset>
        <TextField name="name" label="Name" className="max-w-md" placeholder="e.g. Nudge sleepy readers" autoComplete="off" />
        <FormError />
        <div className="flex gap-2">
          <SubmitButton size="sm" pendingLabel="Creating…">
            Create draft
          </SubmitButton>
          <Button variant="quiet" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Form>
    </Card>
  );
}
