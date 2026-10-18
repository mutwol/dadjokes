import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import type { SortingState } from "@tanstack/react-table";

/**
 * Everything a person can change about a table, kept in the URL so a filtered view
 * survives a refresh and can be shared: `?q=ann&role=admin,writer&sort=-streak&page=2`.
 * Column visibility and row density are per-viewer preferences, kept in localStorage.
 *
 * Works the same for client tables (TanStack filters the rows) and server tables (pass
 * `state.params` straight to the RTK Query hook).
 */
export interface DataTableStateOptions {
  /** Unique per table; namespaces the stored preferences. */
  id: string;
  /** Prefix for URL keys when a page has more than one table. */
  prefix?: string;
  /** Facet filter ids that live in the URL (e.g. ["role", "tag", "status"]). */
  filterKeys?: readonly string[];
  defaultSort?: SortingState;
  defaultPageSize?: number;
  /** Delay before the search box writes to the URL (and so triggers a server request). */
  searchDebounceMs?: number;
}

export type Density = "compact" | "comfortable";

function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: preference lasts for this page only */
  }
}

export const sortToParam = (s: SortingState) => s.map((x) => (x.desc ? `-${x.id}` : x.id)).join(",");
export const paramToSort = (p: string | null): SortingState | null =>
  p === null ? null : p.split(",").filter(Boolean).map((t) => (t.startsWith("-") ? { id: t.slice(1), desc: true } : { id: t, desc: false }));

export function useDataTableState({
  id,
  prefix = "",
  filterKeys = [],
  defaultSort = [],
  defaultPageSize = 25,
  searchDebounceMs = 300,
}: DataTableStateOptions) {
  const [params, setParams] = useSearchParams();
  const k = useCallback((name: string) => `${prefix}${name}`, [prefix]);

  /** Writes URL keys; any change except paging goes back to page 1. */
  const patch = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [name, value] of Object.entries(changes)) {
            if (value === null || value === "") next.delete(k(name));
            else next.set(k(name), value);
          }
          if (!("page" in changes)) next.delete(k("page"));
          return next;
        },
        { replace: true },
      );
    },
    [setParams, k],
  );

  // ---- search: local while typing, URL after a pause
  const urlSearch = params.get(k("q")) ?? "";
  const [search, setSearchLocal] = useState(urlSearch);
  const lastUrlSearch = useRef(urlSearch);
  useEffect(() => {
    // Back/forward or reset changed the URL: follow it.
    if (urlSearch !== lastUrlSearch.current) {
      lastUrlSearch.current = urlSearch;
      setSearchLocal(urlSearch);
    }
  }, [urlSearch]);
  useEffect(() => {
    if (search === lastUrlSearch.current) return;
    const t = window.setTimeout(() => {
      lastUrlSearch.current = search.trim();
      patch({ q: search.trim() || null });
    }, searchDebounceMs);
    return () => window.clearTimeout(t);
  }, [search, patch, searchDebounceMs]);

  // ---- facets
  const filterKeyList = filterKeys.join("|");
  const filters = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of filterKeyList ? filterKeyList.split("|") : []) {
      const v = params.get(k(f));
      if (v) out[f] = v.split(",");
    }
    return out;
  }, [params, filterKeyList, k]);
  const setFilter = useCallback((key: string, values: string[]) => patch({ [key]: values.length ? values.join(",") : null }), [patch]);

  // ---- sort, paging
  const defaultSortParam = sortToParam(defaultSort);
  const sortParam = params.get(k("sort"));
  const sorting = useMemo(() => paramToSort(sortParam ?? defaultSortParam) ?? [], [sortParam, defaultSortParam]);
  const setSorting = useCallback(
    (s: SortingState) => patch({ sort: sortToParam(s) === defaultSortParam ? null : sortToParam(s) }),
    [patch, defaultSortParam],
  );
  const page = Math.max(1, Number(params.get(k("page"))) || 1);
  const pageSize = Number(params.get(k("size"))) || defaultPageSize;
  const setPage = useCallback((p: number) => patch({ page: p > 1 ? String(p) : null }), [patch]);
  const setPageSize = useCallback((n: number) => patch({ size: n === defaultPageSize ? null : String(n) }), [patch, defaultPageSize]);

  // ---- per-viewer preferences
  const prefKey = `daddyjokes.table.${id}`;
  const [hidden, setHiddenState] = useState<string[]>(() => readPref(`${prefKey}.hidden`, []));
  const [density, setDensityState] = useState<Density>(() => readPref(`${prefKey}.density`, "comfortable"));
  const setHidden = useCallback((h: string[]) => {
    setHiddenState(h);
    writePref(`${prefKey}.hidden`, h);
  }, [prefKey]);
  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    writePref(`${prefKey}.density`, d);
  }, [prefKey]);

  const activeFilterCount = Object.values(filters).reduce((n, v) => n + v.length, 0) + (urlSearch ? 1 : 0);
  const reset = useCallback(() => {
    setSearchLocal("");
    lastUrlSearch.current = "";
    patch(Object.fromEntries(["q", "sort", "page", ...(filterKeyList ? filterKeyList.split("|") : [])].map((x) => [x, null])));
  }, [patch, filterKeyList]);

  /** Query args for a server table: search, facets (first value each), page, size, sort. */
  const params_ = useMemo(
    () => ({
      q: urlSearch || undefined,
      ...Object.fromEntries(Object.entries(filters).map(([key, v]) => [key, v[0]])),
      page,
      size: pageSize,
      sort: sorting.length ? sortToParam(sorting) : undefined,
    }),
    [urlSearch, filters, page, pageSize, sorting],
  );

  return {
    search,
    setSearch: setSearchLocal,
    /** The search as applied (debounced). */
    appliedSearch: urlSearch,
    filters,
    setFilter,
    sorting,
    setSorting,
    page,
    setPage,
    pageSize,
    setPageSize,
    hidden,
    setHidden,
    density,
    setDensity,
    activeFilterCount,
    reset,
    params: params_,
  };
}

export type DataTableState = ReturnType<typeof useDataTableState>;
