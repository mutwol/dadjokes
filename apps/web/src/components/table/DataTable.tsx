import { useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { FlexRender, functionalUpdate, useTable } from "@tanstack/react-table";
import type { ColumnFiltersState, PaginationState, RowData, RowSelectionState, ColumnVisibilityState } from "@tanstack/react-table";
import { button } from "@/components/ui/button.tsx";
import { card } from "@/components/ui/card.tsx";
import { CheckMark } from "@/components/ui/check-mark.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { MenuItem, PopoverMenu } from "@/components/ui/popover-menu.tsx";
import { cn } from "@/lib/utils.ts";
import { FacetFilter } from "./FacetFilter.tsx";
import type { FacetFilterDef, FacetOption } from "./FacetFilter.tsx";
import { Pagination } from "./Pagination.tsx";
import { dataTableFeatures } from "./features.ts";
import { useScrollBody } from "./useScrollBody.ts";
import type { TableHeight } from "./useScrollBody.ts";
import type { DataTableColumn, DataTableFeatures } from "./features.ts";
import type { DataTableState } from "./useDataTableState.ts";

type Row<T extends RowData> = ReturnType<ReturnType<typeof useTable<DataTableFeatures, T>>["getRowModel"]>["rows"][number];

export interface DataTableProps<T extends RowData> {
  data: readonly T[] | undefined;
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  state: DataTableState;
  /**
   * client: TanStack searches, filters, sorts and pages `data` in the browser.
   * server: `data` is one page the API already filtered; pass `rowCount`. Feed
   * `state.params` to the query hook.
   */
  mode?: "client" | "server";
  rowCount?: number;
  /**
   * Cursor-paged server tables ("load older" instead of page numbers): rows accumulate
   * and the footer shows a load-more button instead of pagination.
   */
  loadMore?: { hasMore: boolean; onLoadMore: () => void; loading?: boolean };
  /** Server tables: the API sorts by `state.params.sort`. Otherwise sorting is off. */
  serverSort?: boolean;
  /** First load (no rows yet): skeleton rows. */
  loading?: boolean;
  /** Refetching with rows on screen: a progress line, rows dimmed. */
  fetching?: boolean;
  error?: string | null;
  onRetry?: () => void;
  facets?: FacetFilterDef[];
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Singular and plural, for counts: ["person", "people"]. */
  noun?: [string, string];
  /** Adds a checkbox column; `bulkActions` renders when rows are selected. */
  selectable?: boolean;
  bulkActions?: (rows: T[], clear: () => void) => ReactNode;
  onRowClick?: (row: T) => void;
  /** Highlights the row whose details are open next to the table. */
  activeRowId?: string | null;
  emptyMessage?: ReactNode;
  toolbarEnd?: ReactNode;
  /** Accessible table name. */
  caption: string;
  /**
   * The body scrolls under a fixed header and footer. "viewport" (default) fills the
   * window below the table; a CSS length caps it ("24rem"); "auto" turns scrolling off.
   */
  height?: TableHeight;
  /** Smallest scroll area in "viewport" mode, in px (default 320). */
  minHeight?: number;
}

const DENSITY = {
  comfortable: { cell: "px-4 py-3", head: "px-4 py-2.5" },
  compact: { cell: "px-3 py-1.5", head: "px-3 py-2" },
} as const;

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

/** Ignore row clicks that land on a link, button or input inside the row. */
const fromControl = (e: MouseEvent) => (e.target as HTMLElement).closest("a, button, input, select, textarea, label");

/**
 * The one table. Columns come from `columnsFor<T>()`; state from `useDataTableState`,
 * so search, facets, sort and page live in the URL. See People.tsx (server) and
 * Workflows.tsx (client).
 */
export function DataTable<T extends RowData>({
  data,
  columns,
  getRowId,
  state,
  mode = "client",
  rowCount,
  loadMore,
  serverSort = false,
  loading,
  fetching,
  error,
  onRetry,
  facets = [],
  searchable = true,
  searchPlaceholder = "Search…",
  noun = ["row", "rows"],
  selectable,
  bulkActions,
  onRowClick,
  activeRowId,
  emptyMessage = "Nothing here yet.",
  toolbarEnd,
  caption,
  height = "viewport",
  minHeight = 320,
}: DataTableProps<T>) {
  const server = mode === "server";
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const rows = useMemo(() => (data ?? []) as T[], [data]);

  const allColumns = useMemo<DataTableColumn<T>[]>(
    () =>
      selectable
        ? [
            {
              id: "_select",
              enableSorting: false,
              enableHiding: false,
              meta: { label: "Select", className: "w-10" },
              header: ({ table }) => (
                <button
                  type="button"
                  className="grid size-6 place-items-center border-0 bg-transparent p-0"
                  aria-label={table.getIsAllPageRowsSelected() ? "Deselect all on this page" : "Select all on this page"}
                  onClick={() => table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected())}
                >
                  <CheckMark on={table.getIsAllPageRowsSelected()} indeterminate={table.getIsSomePageRowsSelected()} />
                </button>
              ),
              cell: ({ row }) => (
                <button
                  type="button"
                  className="grid size-6 place-items-center border-0 bg-transparent p-0"
                  aria-label={row.getIsSelected() ? "Deselect row" : "Select row"}
                  aria-pressed={row.getIsSelected()}
                  onClick={() => row.toggleSelected()}
                >
                  <CheckMark on={row.getIsSelected()} />
                </button>
              ),
            } satisfies DataTableColumn<T>,
            ...columns,
          ]
        : columns,
    [columns, selectable],
  );

  const columnFilters = useMemo<ColumnFiltersState>(
    () => (server ? [] : Object.entries(state.filters).map(([id, value]) => ({ id, value }))),
    [server, state.filters],
  );
  const columnVisibility = useMemo<ColumnVisibilityState>(() => Object.fromEntries(state.hidden.map((id) => [id, false])), [state.hidden]);
  const pagination: PaginationState = { pageIndex: state.page - 1, pageSize: state.pageSize };

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns: allColumns,
    getRowId: (row) => getRowId(row),
    defaultColumn: { filterFn: "oneOf" },
    globalFilterFn: "includesString",
    enableSorting: !server || serverSort,
    // Server sorting takes one column; in the browser, shift-click adds more.
    enableMultiSort: !server,
    manualSorting: server,
    manualFiltering: server,
    manualPagination: server,
    rowCount: server ? (loadMore ? rows.length : (rowCount ?? 0)) : undefined,
    autoResetPageIndex: false,
    state: {
      sorting: server && !serverSort ? [] : state.sorting,
      columnFilters,
      globalFilter: server ? "" : state.search,
      pagination: loadMore ? { pageIndex: 0, pageSize: Math.max(rows.length, 1) } : pagination,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: (u) => state.setSorting(functionalUpdate(u, state.sorting)),
    onPaginationChange: (u) => {
      const next = functionalUpdate(u, pagination);
      if (next.pageSize !== pagination.pageSize) state.setPageSize(next.pageSize);
      else state.setPage(next.pageIndex + 1);
    },
    onColumnVisibilityChange: (u) => {
      const next = functionalUpdate(u, columnVisibility);
      state.setHidden(Object.entries(next).filter(([, v]) => !v).map(([k]) => k));
    },
    onRowSelectionChange: (u) => setRowSelection((cur) => functionalUpdate(u, cur)),
  });

  // Client facets: fill in counts (and options, when none were given) from the data.
  const facetDefs = useMemo<FacetFilterDef[]>(() => {
    if (server) return facets;
    return facets.map((f) => {
      const counts = new Map<string, number>();
      for (const row of table.getCoreRowModel().rows) {
        const v = row.getValue(f.id);
        for (const x of Array.isArray(v) ? v : [v]) if (x !== null && x !== undefined && x !== "") counts.set(String(x), (counts.get(String(x)) ?? 0) + 1);
      }
      const options: FacetOption[] = (f.options.length ? f.options : [...counts.keys()].sort().map((value) => ({ value, label: value }))).map((o) => ({
        ...o,
        count: counts.get(o.value) ?? 0,
      }));
      return { ...f, options };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recount when the data changes
  }, [facets, server, rows]);

  const total = loadMore ? rows.length : server ? (rowCount ?? 0) : table.getFilteredRowModel().rows.length;
  const pageRows = table.getRowModel().rows;
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const clearSelection = () => setRowSelection({});
  const d = DENSITY[state.density];
  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide() && !c.columnDef.meta?.alwaysVisible && c.id !== "_select");
  const visibleCount = table.getVisibleLeafColumns().length;
  const filtered = state.activeFilterCount > 0;

  // Scrolling body: back to the top when the page, sort, filters or search change.
  const scroll = useScrollBody(height, minHeight, `${state.page}|${state.pageSize}|${JSON.stringify(state.sorting)}|${JSON.stringify(state.filters)}|${state.appliedSearch}`);
  // Column footers (totals) render as a fixed row under the scrolling body.
  const hasFooter = table.getVisibleLeafColumns().some((c) => c.columnDef.footer !== undefined);

  const cellClass = (meta: DataTableColumn<T>["meta"], head = false) =>
    cn(
      head ? d.head : d.cell,
      ALIGN[meta?.align ?? "left"],
      meta?.sticky && !head && "sticky left-0 z-1 bg-inherit",
      // Cell styling (fonts, colours) stays out of the header row.
      !head && meta?.className,
    );

  return (
    <div className="grid min-w-0 gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {searchable ? (
          <label className="relative flex min-w-0 flex-[1_1_220px] items-center sm:max-w-80">
            <span className="sr-only">Search {noun[1]}</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 text-ink-faint" />
            <input
              type="search"
              value={state.search}
              onChange={(e) => state.setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="min-h-8 w-full rounded-md border border-line-strong bg-paper pr-2.5 pl-8 text-sm text-ink transition-[border-color,box-shadow] duration-120 outline-none placeholder:text-ink-faint hover:border-ink-faint focus:border-focus focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-focus)_22%,transparent)]"
            />
          </label>
        ) : null}
        {facetDefs.map((f) => (
          <FacetFilter key={f.id} def={f} value={state.filters[f.id] ?? []} onChange={(v) => state.setFilter(f.id, v)} />
        ))}
        {filtered ? (
          <button type="button" className={button({ variant: "ghost", size: "sm" })} onClick={state.reset}>
            Reset
            <Icon name="close" size={14} />
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {toolbarEnd}
          <PopoverMenu
            label="Table view"
            align="end"
            trigger={(p) => (
              <button type="button" {...p} className={button({ variant: "quiet", size: "sm" })}>
                <Icon name="columns" size={16} />
                <span className="max-sm:sr-only">View</span>
              </button>
            )}
          >
            <div className="grid w-56 gap-1">
              <p className="px-2 pt-1.5 pb-1 text-xs font-medium text-ink-faint">Row spacing</p>
              <div role="radiogroup" aria-label="Row spacing" className="mx-1 grid grid-cols-2 gap-0.5 rounded-md bg-fridge p-0.5">
                {(["comfortable", "compact"] as const).map((x) => (
                  <button
                    key={x}
                    type="button"
                    role="radio"
                    aria-checked={state.density === x}
                    onClick={() => state.setDensity(x)}
                    className={cn(
                      "min-h-7 rounded-[5px] border-0 text-xs font-medium capitalize",
                      state.density === x ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "bg-transparent text-ink-soft",
                    )}
                  >
                    {x}
                  </button>
                ))}
              </div>
              {hideable.length ? (
                <>
                  <p className="px-2 pt-2 pb-1 text-xs font-medium text-ink-faint">Columns</p>
                  <div role="menu" aria-label="Columns" className="grid">
                    {hideable.map((c) => (
                      <MenuItem key={c.id} selected={c.getIsVisible()} onSelect={() => c.toggleVisibility(!c.getIsVisible())}>
                        <CheckMark on={c.getIsVisible()} />
                        {c.columnDef.meta?.label ?? c.id}
                      </MenuItem>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </PopoverMenu>
        </div>
      </div>

      {/* Bulk actions */}
      {selectable && selected.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm shadow-pop" role="region" aria-label="Selected rows">
          <span className="font-medium">
            {selected.length} {selected.length === 1 ? noun[0] : noun[1]} selected
          </span>
          <span className="h-4 w-px bg-line" aria-hidden="true" />
          {bulkActions?.(selected, clearSelection)}
          <button type="button" className={cn(button({ variant: "ghost", size: "sm" }), "ml-auto")} onClick={clearSelection}>
            Clear selection
          </button>
        </div>
      ) : null}

      {/* Table */}
      <div className={cn(card, "relative min-w-0 overflow-hidden")}>
        {fetching && !loading ? (
          <div className="absolute inset-x-0 top-0 z-2 h-0.5 overflow-hidden bg-line" role="progressbar" aria-label="Loading">
            <div className="h-full w-1/3 animate-[table-progress_1s_ease-in-out_infinite] bg-focus motion-reduce:animate-none" />
          </div>
        ) : null}
        <div
          ref={scroll.ref}
          onScroll={scroll.onScroll}
          style={{ maxHeight: scroll.maxHeight }}
          className="overflow-auto overscroll-contain"
          // Scrollable regions must be reachable by keyboard (arrow keys scroll it).
          tabIndex={scroll.scrollable ? 0 : undefined}
          role={scroll.scrollable ? "region" : undefined}
          aria-label={scroll.scrollable ? `${caption} (scrollable)` : undefined}
          data-scrolled={!scroll.edges.top || undefined}
          data-more-below={!scroll.edges.bottom || undefined}
        >
          {/* border-separate: collapsed borders don't travel with sticky cells. */}
          <table className="w-full border-separate border-spacing-0 text-sm" aria-busy={loading || fetching || undefined}>
            <caption className="sr-only">{caption}</caption>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const meta = h.column.columnDef.meta;
                    const sorted = h.column.getIsSorted();
                    const canSort = h.column.getCanSort();
                    return (
                      <th
                        key={h.id}
                        scope="col"
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : canSort ? "none" : undefined}
                        className={cn(
                          cellClass(meta, true),
                          "sticky top-0 z-2 border-b border-line bg-fridge text-xs font-medium whitespace-nowrap text-ink-soft",
                          // A soft shadow under the header once rows scroll beneath it.
                          !scroll.edges.top && "shadow-[0_2px_6px_0_rgb(0_0_0/0.12)]",
                          // The pinned column's header sits above both scroll directions.
                          meta?.sticky && "left-0 z-3",
                        )}
                      >
                        {h.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={h.column.getToggleSortingHandler()}
                            title={server ? "Sort" : "Sort (shift-click to add)"}
                            className={cn(
                              "-mx-1.5 inline-flex items-center gap-1 rounded-md border-0 bg-transparent px-1.5 py-0.5 font-medium text-inherit hover:bg-ink/6 hover:text-ink",
                              sorted && "text-ink",
                              meta?.align === "right" && "flex-row-reverse",
                            )}
                          >
                            <FlexRender header={h} />
                            <Icon name={sorted === "asc" ? "up" : sorted === "desc" ? "down" : "sort"} size={13} className={sorted ? "" : "opacity-40"} />
                          </button>
                        ) : (
                          <FlexRender header={h} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className={cn("transition-opacity duration-160", fetching && !loading && "opacity-60")}>
              {error ? (
                <tr>
                  <td colSpan={visibleCount} className="px-4 py-10 text-center">
                    <p className="text-ink">{error}</p>
                    {onRetry ? (
                      <button type="button" className={cn(button({ variant: "quiet", size: "sm" }), "mt-3")} onClick={onRetry}>
                        Try again
                      </button>
                    ) : null}
                  </td>
                </tr>
              ) : loading && !pageRows.length ? (
                Array.from({ length: Math.min(state.pageSize, 8) }, (_, i) => (
                  <tr key={i} className="[&:last-child>td]:border-b-0">
                    {table.getVisibleLeafColumns().map((c) => (
                      <td key={c.id} className={cn(d.cell, "border-b border-line")}>
                        <span className="block h-3.5 animate-pulse rounded-sm bg-line motion-reduce:animate-none" style={{ width: `${45 + ((i * 7 + c.id.length * 13) % 45)}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !pageRows.length ? (
                <tr>
                  <td colSpan={visibleCount} className="px-4 py-12 text-center text-ink-soft">
                    {filtered ? (
                      <>
                        <p className="font-medium text-ink">No {noun[1]} match these filters.</p>
                        <button type="button" className={cn(button({ variant: "quiet", size: "sm" }), "mt-3")} onClick={state.reset}>
                          Clear filters
                        </button>
                      </>
                    ) : (
                      emptyMessage
                    )}
                  </td>
                </tr>
              ) : (
                pageRows.map((row: Row<T>) => (
                  <tr
                    key={row.id}
                    data-selected={row.getIsSelected() || undefined}
                    aria-current={activeRowId === row.id || undefined}
                    onClick={onRowClick ? (e) => !fromControl(e) && onRowClick(row.original) : undefined}
                    className={cn(
                      "bg-paper transition-colors duration-120 [&:last-child>td]:border-b-0 hover:bg-fridge/70 data-selected:bg-cream/60 aria-[current=true]:bg-cream/60 aria-[current=true]:shadow-[inset_2px_0_0_var(--color-ink)]",
                      onRowClick && "cursor-pointer",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cn(cellClass(cell.column.columnDef.meta), "border-b border-line align-middle")}>
                        <FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {hasFooter && pageRows.length ? (
              <tfoot>
                {table.getFooterGroups().map((fg) => (
                  <tr key={fg.id}>
                    {fg.headers.map((h) => {
                      const meta = h.column.columnDef.meta;
                      return (
                        <td
                          key={h.id}
                          className={cn(
                            cellClass(meta, true),
                            "sticky bottom-0 z-2 border-t border-line bg-fridge font-medium whitespace-nowrap text-ink tabular-nums",
                            meta?.sticky && "left-0 z-3",
                          )}
                        >
                          {h.isPlaceholder ? null : <FlexRender footer={h} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tfoot>
            ) : null}
          </table>
        </div>
        {loadMore ? (
          <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-sm text-ink-soft">
            <span className="tabular-nums" aria-live="polite">
              {rows.length} {rows.length === 1 ? noun[0] : noun[1]}
              {loadMore.hasMore ? " so far" : ""}
            </span>
            {loadMore.hasMore ? (
              <button type="button" className={button({ variant: "quiet", size: "sm" })} onClick={loadMore.onLoadMore} disabled={loadMore.loading} aria-busy={loadMore.loading || undefined}>
                {loadMore.loading ? "Loading…" : `Load older ${noun[1]}`}
              </button>
            ) : rows.length ? (
              <span>That's everything.</span>
            ) : null}
          </div>
        ) : (
        <Pagination
          page={state.page}
          pageSize={state.pageSize}
          total={total}
          noun={noun}
          fetching={fetching}
          selected={selectable ? selected.length : 0}
          onPageChange={state.setPage}
          onPageSizeChange={state.setPageSize}
        />
        )}
      </div>
    </div>
  );
}
