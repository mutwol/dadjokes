import { useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { problemMessage, useCreateRuleSetMutation, useListDecisionPointsQuery, useListRuleSetsQuery } from "../../api/rtk/index.ts";
import type { DecisionPoint, RuleSetSummary } from "../../api/rtk/index.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Form, FormError, SelectField, SubmitButton, TextareaField, TextField } from "@/components/ui/form.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { useZodForm } from "@/hooks/useZodForm.ts";
import { DataTable, columnsFor, useDataTableState } from "../../components/table/index.ts";
import type { FacetFilterDef } from "../../components/table/index.ts";
import { timeAgo } from "../../data/dates.ts";
import { PageHeader } from "./ui.tsx";

const col = columnsFor<RuleSetSummary>();
const STATUS = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

/** Rule sets: decisions the app (and workflows) ask for, edited as data. */
export function AdminRules() {
  const navigate = useNavigate();
  const rules = useListRuleSetsQuery();
  const { data: points } = useListDecisionPointsQuery();
  const [creating, setCreating] = useState(false);
  const state = useDataTableState({ id: "admin-rules", filterKeys: ["status", "decisionPoint"], defaultSort: [{ id: "updatedAt", desc: true }] });

  const pointLabel = useMemo(() => {
    const m = new Map(points?.data.map((p) => [p.key, p.label]));
    return (k: string) => m.get(k) ?? k;
  }, [points]);

  const facets = useMemo<FacetFilterDef[]>(
    () => [
      { id: "status", label: "Status", options: STATUS },
      { id: "decisionPoint", label: "Used for", options: (points?.data ?? []).map((p) => ({ value: p.key, label: p.label })) },
    ],
    [points],
  );

  const columns = useMemo(
    () => [
      col.accessor("name", {
        header: "Rule set",
        sortFn: "alphanumeric",
        meta: { label: "Rule set", alwaysVisible: true, sticky: true },
        cell: ({ row: { original: r } }) => (
          <div className="grid min-w-44">
            <Link to={`/admin/rules/${r.id}`} className="font-medium text-ink no-underline hover:underline">
              {r.name}
            </Link>
            <span className="font-mono text-xs text-ink-soft">{r.key}</span>
          </div>
        ),
      }),
      col.accessor("decisionPoint", { header: "Used for", meta: { label: "Used for", className: "text-ink-soft" }, cell: ({ getValue }) => pointLabel(getValue()) }),
      col.accessor("status", {
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row: { original: r } }) => (
          <div className="flex flex-wrap gap-1">
            {r.status === "published" ? <Badge tone="green">live v{r.liveVersion}</Badge> : r.status === "archived" ? <Badge>archived</Badge> : <Badge tone="yellow">draft</Badge>}
            {r.hasUnpublishedChanges && r.status !== "draft" ? <Badge tone="yellow">unpublished edits</Badge> : null}
            {r.system ? <Badge tone="blue">used by the app</Badge> : null}
          </div>
        ),
      }),
      col.accessor("ruleCount", { header: "Rules", sortFn: "basic", meta: { label: "Rules", align: "right", className: "tabular-nums" } }),
      col.accessor("testCount", { header: "Tests", sortFn: "basic", meta: { label: "Tests", align: "right", className: "tabular-nums" } }),
      col.accessor("updatedAt", {
        header: "Last saved",
        sortFn: "datetime",
        meta: { label: "Last saved", className: "whitespace-nowrap text-ink-soft" },
        cell: ({ row: { original: r } }) => (
          <>
            {timeAgo(r.updatedAt)}
            {r.updatedBy ? <span className="block text-xs text-ink-faint">@{r.updatedBy}</span> : null}
          </>
        ),
      }),
    ],
    [pointLabel],
  );

  return (
    <>
      <PageHeader
        title="Rule sets"
        description="Rules decide; workflows act. The app asks some rule sets directly (auto-hiding reported content, the send policy), and workflows ask others with a Decision step."
        actions={
          <Button size="sm" onClick={() => setCreating(true)} disabled={!points}>
            <Icon name="plus" size={16} />
            New rule set
          </Button>
        }
      />
      {creating && points ? <NewRuleSet points={points.data} onCancel={() => setCreating(false)} /> : null}
      <DataTable
        caption="Rule sets"
        data={rules.data?.data}
        columns={columns}
        getRowId={(r) => r.id}
        state={state}
        facets={facets}
        loading={rules.isLoading}
        fetching={rules.isFetching}
        error={rules.error && !rules.data ? problemMessage(rules.error) : null}
        onRetry={() => void rules.refetch()}
        searchPlaceholder="Search name or key"
        noun={["rule set", "rule sets"]}
        onRowClick={(r) => void navigate(`/admin/rules/${r.id}`)}
        emptyMessage="No rule sets yet."
      />
    </>
  );
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const newRuleSetSchema = z.object({
  name: z.string().trim().min(3, "Give it a name.").max(80, "Keep it under 80 characters."),
  key: z
    .string()
    .trim()
    .regex(/^$|^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/, "Use dotted lowercase, like crm.engagement_tier."),
  decisionPoint: z.string().min(1, "Pick what it decides."),
  description: z.string().trim().max(500, "Keep it under 500 characters."),
});

function NewRuleSet({ points, onCancel }: { points: DecisionPoint[]; onCancel: () => void }) {
  const navigate = useNavigate();
  const [create] = useCreateRuleSetMutation();
  const form = useZodForm(newRuleSetSchema, { defaultValues: { name: "", key: "", decisionPoint: "workflow", description: "" } });
  const [name, decisionPoint] = useWatch({ control: form.control, name: ["name", "decisionPoint"] });
  const suggestedKey = name ? `crm.${slug(name)}` : "crm.engagement_tier";
  const dp = points.find((p) => p.key === decisionPoint);

  return (
    <Card className="p-4">
      <Form
        form={form}
        onSubmit={async (v) => {
          const r = await create({ createRuleSetRequest: { ...v, key: v.key || `crm.${slug(v.name)}` } }).unwrap();
          toast.success(`“${r.name}” created as a draft.`);
          void navigate(`/admin/rules/${r.id}`);
        }}
      >
        <h2 className="text-lg">New rule set</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="name" label="Name" placeholder="Engagement tier" autoComplete="off" />
          <TextField name="key" label="Key" optional inputClassName="font-mono" placeholder={suggestedKey} help="What workflows and code call it. Can't change later." autoComplete="off" />
        </div>
        <SelectField name="decisionPoint" label="Decides" options={points.map((p) => ({ value: p.key, label: p.label }))} help={dp?.description} />
        <TextareaField name="description" label="Description" optional rows={2} placeholder="What it decides and why" />
        <FormError />
        <div className="flex gap-2">
          <SubmitButton size="sm" pendingLabel="Creating…">
            Create
          </SubmitButton>
          <Button variant="quiet" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Form>
    </Card>
  );
}
