import { useMemo, useState } from "react";
import { Link } from "react-router";
import { problemMessage, useListAuditQuery } from "../../api/rtk/index.ts";
import type { AuditEntry } from "../../api/rtk/index.ts";
import { DataTable, columnsFor, useDataTableState } from "../../components/table/index.ts";
import type { FacetFilterDef } from "../../components/table/index.ts";
import { timeAgo } from "../../data/dates.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { PageHeader } from "./ui.tsx";

const ACTIONS = [
  { value: "report.", label: "Report decisions" },
  { value: "content.", label: "Auto-hidden content" },
  { value: "comment.", label: "Hidden comments" },
  { value: "appeal.", label: "Appeals" },
  { value: "user.", label: "People" },
  { value: "workflow.", label: "Workflows" },
  { value: "rule_set.", label: "Rule sets" },
];
const FACETS: FacetFilterDef[] = [{ id: "action", label: "Kind", options: ACTIONS, single: true }];

function targetLink(e: AuditEntry) {
  if (e.targetType === "user") return `/admin/people/${e.targetId}`;
  if (e.targetType === "workflow") return `/admin/workflows/${e.targetId}`;
  if (e.targetType === "rule_set") return `/admin/rules/${e.targetId}`;
  if (e.targetType === "joke") return `/joke/${e.targetId}`;
  if (e.targetType === "comment" && typeof e.data.jokeId === "string") return `/joke/${e.data.jokeId}`;
  return null;
}

function summary(e: AuditEntry) {
  const d = e.data;
  const parts: string[] = [];
  for (const key of ["reason", "note", "tag", "name", "key", "version", "reports"]) {
    if (d[key] !== undefined && d[key] !== null && d[key] !== "") parts.push(`${key}: ${String(d[key])}`);
  }
  if (Array.isArray(d.after)) parts.push(`roles: ${(d.after as string[]).join(", ")}`);
  if (Array.isArray(d.matched) && d.matched.length) parts.push(`rule: ${(d.matched as string[]).join(", ")}`);
  return parts.join(" · ");
}

const col = columnsFor<AuditEntry>();

/** Who did what, when: every moderation and admin action, plus what rules did on their own. */
export function AdminAudit() {
  const state = useDataTableState({ id: "admin-audit", filterKeys: ["action"], defaultPageSize: 50 });
  const action = state.filters.action?.[0];
  // The cursor resets whenever the filter changes (the cache key ignores it; see endpoints.ts).
  const [cursor, setCursor] = useState<{ action?: string; before?: string }>({});
  const before = cursor.action === action ? cursor.before : undefined;
  const { data, error, isLoading, isFetching, refetch } = useListAuditQuery({ action, before, limit: 50 });

  const columns = useMemo(
    () => [
      col.accessor("createdAt", {
        header: "When",
        meta: { label: "When", className: "whitespace-nowrap text-ink-soft" },
        cell: ({ getValue }) => <span title={new Date(getValue()).toLocaleString()}>{timeAgo(getValue())}</span>,
      }),
      col.accessor((e) => e.actor?.handle ?? "system", {
        id: "actor",
        header: "Who",
        meta: { label: "Who" },
        cell: ({ row: { original: e } }) => (e.actor ? `@${e.actor.handle}` : <Badge tone="blue">system</Badge>),
      }),
      col.accessor("action", {
        header: "What",
        meta: { label: "What", alwaysVisible: true },
        cell: ({ row: { original: e } }) => {
          const to = targetLink(e);
          return (
            <div className="grid">
              <span className="font-medium">{e.action}</span>
              <span className="text-xs text-ink-soft">
                {to ? (
                  <Link to={to} className="text-ink-soft">
                    {e.targetType}
                  </Link>
                ) : (
                  e.targetType
                )}
              </span>
            </div>
          );
        },
      }),
      col.display({
        id: "details",
        header: "Details",
        meta: { label: "Details", className: "text-ink-soft" },
        cell: ({ row: { original: e } }) => summary(e),
      }),
    ],
    [],
  );

  return (
    <>
      <PageHeader title="Audit log" description="Every staff decision and every automatic action, newest first. Entries can't be edited." />
      <DataTable
        caption="Audit log"
        mode="server"
        searchable={false}
        data={data?.data}
        columns={columns}
        getRowId={(e) => e.id}
        state={state}
        facets={FACETS}
        loading={isLoading}
        fetching={isFetching && !before}
        error={error && !data ? problemMessage(error) : null}
        onRetry={() => void refetch()}
        noun={["entry", "entries"]}
        emptyMessage="Nothing recorded yet."
        loadMore={{
          hasMore: Boolean(data?.nextBefore),
          loading: isFetching && Boolean(before),
          onLoadMore: () => data?.nextBefore && setCursor({ action, before: data.nextBefore }),
        }}
      />
    </>
  );
}
