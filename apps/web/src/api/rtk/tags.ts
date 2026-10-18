import type { TagType } from "./baseApi.ts";
import type { ApiProblem } from "./problem.ts";

/*
 * Small helpers for providesTags / invalidatesTags, so endpoints.ts reads like a table.
 *
 * Convention: a list query provides `{ type, id: "LIST" }` plus one tag per row id; a
 * detail query provides `{ type, id }`. Creating something invalidates the LIST;
 * changing one thing invalidates its id (which also refreshes any list showing it).
 */

export type Tag = TagType | { type: TagType; id: string | number };
export const LIST = "LIST";

type Paged = { data?: readonly unknown[] } | undefined;

function idOf(item: unknown): string | undefined {
  if (item && typeof item === "object" && "id" in item) {
    const id = (item as { id: unknown }).id;
    return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
  }
  return undefined;
}

/** A list response (`{ data: [...] }`): the LIST tag and one tag per row. */
export const list =
  (type: TagType) =>
  (result: Paged | unknown): Tag[] => {
    const rows = (result as Paged)?.data ?? [];
    return [{ type, id: LIST }, ...rows.flatMap((r) => (idOf(r) ? [{ type, id: idOf(r)! }] : []))];
  };

/** A single item addressed by an argument field (`id` by default). */
export const item =
  <A extends object>(type: TagType, key: keyof A = "id" as keyof A) =>
  (_result: unknown, _error: ApiProblem | undefined, arg: A): Tag[] => [{ type, id: String(arg[key]) }];

/** Invalidate an item and the list it appears in. */
export const itemAndList =
  <A extends object>(type: TagType, key: keyof A = "id" as keyof A) =>
  (_result: unknown, _error: ApiProblem | undefined, arg: A): Tag[] => [
    { type, id: String(arg[key]) },
    { type, id: LIST },
  ];

/** Fixed tags, ignoring the response: `tags("Studio", "Balance")`. */
export const tags =
  (...t: Tag[]) =>
  (): Tag[] =>
    t;

/**
 * Same as `tags`, but only after success: a failed write leaves the cache alone, so the
 * screen doesn't refetch for nothing.
 */
export const onSuccess =
  (...t: Tag[]) =>
  (_result: unknown, error: ApiProblem | undefined): Tag[] =>
    error ? [] : t;
