import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { problemMessage, useListAdminUsersQuery, useListTagsQuery } from "../../api/rtk/index.ts";
import type { AdminUserRow, ListAdminUsersApiArg } from "../../api/rtk/index.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { DataTable, columnsFor, useDataTableState } from "../../components/table/index.ts";
import type { FacetFilterDef } from "../../components/table/index.ts";
import { timeAgo } from "../../data/dates.ts";
import { PageHeader } from "./ui.tsx";

const col = columnsFor<AdminUserRow>();

const ROLE_OPTIONS = [
  { value: "reader", label: "Readers" },
  { value: "writer", label: "Writers" },
  { value: "curator", label: "Curators" },
  { value: "admin", label: "Admins" },
];
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "onboarding", label: "Still signing up" },
  { value: "suspended", label: "Suspended" },
];

/** Everyone, searchable and filterable by role, tag and status: the mini CRM. */
export function AdminPeople() {
  const navigate = useNavigate();
  const state = useDataTableState({ id: "admin-people", filterKeys: ["role", "tag", "status"], defaultPageSize: 25, defaultSort: [{ id: "createdAt", desc: true }] });
  // The API filters, sorts (name, createdAt, lastOpenAt) and pages; it takes one value per filter.
  const { q, role, tag, status, page, size, sort } = state.params as ListAdminUsersApiArg;
  const { data, error, isLoading, isFetching, refetch } = useListAdminUsersQuery({ q, role, tag, status, page, size, sort });
  const { data: tags } = useListTagsQuery();
  const { setFilter } = state;

  const facets = useMemo<FacetFilterDef[]>(
    () => [
      { id: "role", label: "Role", options: ROLE_OPTIONS, single: true },
      { id: "status", label: "Status", options: STATUS_OPTIONS, single: true },
      { id: "tag", label: "Tag", options: (tags?.data ?? []).map((t) => ({ value: t.tag, label: t.tag, count: t.people })), single: true },
    ],
    [tags],
  );

  const columns = useMemo(
    () => [
      col.accessor("name", {
        header: "Person",
        meta: { label: "Person", alwaysVisible: true, sticky: true },
        cell: ({ row: { original: u } }) => (
          <Link to={`/admin/people/${u.id}`} className="flex min-w-56 items-center gap-2.5 text-ink no-underline">
            <Avatar name={u.name} tone={u.tone} size={32} />
            <span className="grid min-w-0">
              <span className="truncate font-medium underline-offset-3 hover:underline">{u.name}</span>
              <span className="truncate text-xs text-ink-soft">
                {u.handle ? `@${u.handle} · ` : ""}
                {u.email}
              </span>
            </span>
          </Link>
        ),
      }),
      col.accessor("roles", {
        header: "Roles",
        enableSorting: false,
        meta: { label: "Roles" },
        cell: ({ row: { original: u } }) => (
          <div className="flex flex-wrap gap-1">
            {u.suspended ? <Badge tone="red">suspended</Badge> : null}
            {!u.onboarded ? <Badge tone="yellow">signing up</Badge> : null}
            {u.roles.map((r) => (
              <Badge key={r} tone={r === "admin" || r === "curator" ? "blue" : "grey"}>
                {r}
              </Badge>
            ))}
          </div>
        ),
      }),
      col.accessor("tags", {
        header: "Tags",
        enableSorting: false,
        meta: { label: "Tags" },
        cell: ({ getValue }) => (
          <div className="flex flex-wrap gap-1">
            {getValue().map((t) => (
              <button key={t} type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={() => setFilter("tag", [t])} title={`Only people tagged ${t}`}>
                <Badge tone="yellow">{t}</Badge>
              </button>
            ))}
          </div>
        ),
      }),
      col.accessor("streak", {
        header: "Streak",
        // Worked out per page after the query, so the API can't sort by it.
        enableSorting: false,
        meta: { label: "Streak", align: "right", className: "font-medium tabular-nums" },
        cell: ({ getValue }) => getValue() || <span className="text-ink-faint">—</span>,
      }),
      col.accessor("lastOpenAt", {
        header: "Last opened",
        meta: { label: "Last opened", className: "whitespace-nowrap text-ink-soft" },
        cell: ({ getValue }) => {
          const v = getValue();
          return v ? timeAgo(v) : "Never";
        },
      }),
      col.accessor("createdAt", {
        header: "Joined",
        meta: { label: "Joined", className: "whitespace-nowrap text-ink-soft" },
        cell: ({ getValue }) => timeAgo(getValue()),
      }),
    ],
    [setFilter],
  );

  return (
    <>
      <PageHeader title="People" description="Readers, writers and staff. Tags come from you and from workflows; use them to target automations." />
      <DataTable
        caption="People"
        mode="server"
        serverSort
        data={data?.data}
        rowCount={data?.total}
        columns={columns}
        getRowId={(u) => u.id}
        state={state}
        facets={facets}
        loading={isLoading}
        fetching={isFetching}
        error={error && !data ? problemMessage(error) : null}
        onRetry={() => void refetch()}
        searchPlaceholder="Search name, @handle or email"
        noun={["person", "people"]}
        onRowClick={(u) => void navigate(`/admin/people/${u.id}`)}
        emptyMessage="No one has signed up yet."
      />
    </>
  );
}
