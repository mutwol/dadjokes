import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrIncludesSome,
  filterFn_equalsString,
  filterFn_inNumberRange,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";
import type { ColumnDef, RowData } from "@tanstack/react-table";

/** Per-column options the DataTable reads, set with `meta` on a column definition. */
export interface DataTableColumnMeta {
  /** Name in the column menu and for screen readers when the header isn't text. */
  label?: string;
  align?: "left" | "right" | "center";
  /** Extra classes for this column's cells. */
  className?: string;
  /** Keep the column visible: it can't be hidden from the column menu. */
  alwaysVisible?: boolean;
  /** Pin to the left edge when the table scrolls sideways (one per table, usually the name). */
  sticky?: boolean;
}

/**
 * TanStack Table v9 features used by every DataTable. v9 is tree-shaken by feature, so
 * this list is the whole capability set: sorting, column + global filtering with
 * facets (counts per option), pagination, column visibility and pinning, selection.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  columnFacetingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, datetime: sortFn_datetime, text: sortFn_text },
  filterFns: {
    includesString: filterFn_includesString,
    equalsString: filterFn_equalsString,
    arrIncludesSome: filterFn_arrIncludesSome,
    inNumberRange: filterFn_inNumberRange,
    /** Facet filter: the cell value (or any of its values, for arrays) is one of the picked options. */
    oneOf: (row, columnId, picked: string[]) => {
      if (!picked?.length) return true;
      const v = row.getValue(columnId);
      return Array.isArray(v) ? v.some((x) => picked.includes(String(x))) : picked.includes(String(v));
    },
  },
  columnMeta: {} as DataTableColumnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataTableColumn<T extends RowData> = ColumnDef<DataTableFeatures, T, any>;

/** Typed column builder: `const col = columnsFor<AdminUserRow>(); col.accessor("name", {...})`. */
export const columnsFor = <T extends RowData>() => createColumnHelper<DataTableFeatures, T>();
