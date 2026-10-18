import type { SerializedError } from "@reduxjs/toolkit";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { ApiError } from "@daddy-jokes/contracts";
import type { Problem } from "@daddy-jokes/contracts";

/**
 * Every RTK Query error in the app has this one shape, whatever went wrong: an API
 * problem response (RFC 9457, as the API sends), no network, a timeout, or a body that
 * wasn't JSON. Screens and forms only ever deal with this.
 */
export interface ApiProblem {
  /** HTTP status, or what happened before one arrived. */
  status: number | "NETWORK" | "TIMEOUT" | "PARSE" | "UNKNOWN";
  /** The API's machine-readable code ("handle_taken", "validation_failed"), or the status kind. */
  code: string;
  /** One sentence, written for people: safe to show as is. */
  title: string;
  detail?: string;
  /** Field messages from a 422, keyed by field path ("handle", "body.title"). */
  fieldErrors: Record<string, string>;
}

const OFFLINE = "Can't reach Daddy Jokes. Check your connection and try again.";
const GENERIC = "Something went wrong. Try again.";

function fromBody(status: number, body: unknown): ApiProblem {
  const p = (body && typeof body === "object" ? body : {}) as Partial<Problem>;
  return {
    status,
    code: p.code ?? (status >= 500 ? "server_error" : "unknown"),
    title: p.title ?? (status >= 500 ? "Daddy Jokes is having a moment. Try again shortly." : GENERIC),
    detail: p.detail,
    fieldErrors: Object.fromEntries((p.errors ?? []).map((e) => [e.path, e.message])),
  };
}

/** Turns a fetchBaseQuery error into an ApiProblem. Used once, in the base query. */
export function toProblem(error: FetchBaseQueryError): ApiProblem {
  if (typeof error.status === "number") return fromBody(error.status, error.data);
  switch (error.status) {
    case "FETCH_ERROR":
      return { status: "NETWORK", code: "network", title: OFFLINE, fieldErrors: {} };
    case "TIMEOUT_ERROR":
      return { status: "TIMEOUT", code: "timeout", title: "That took too long. Try again.", fieldErrors: {} };
    case "PARSING_ERROR":
      return error.originalStatus >= 400
        ? fromBody(error.originalStatus, undefined)
        : { status: "PARSE", code: "parse", title: GENERIC, fieldErrors: {} };
    default:
      return { status: "UNKNOWN", code: "unknown", title: GENERIC, fieldErrors: {} };
  }
}

export function isApiProblem(e: unknown): e is ApiProblem {
  return !!e && typeof e === "object" && "title" in e && "fieldErrors" in e && "code" in e;
}

/**
 * The message to show for any failure: an RTK Query error, an `.unwrap()` rejection,
 * a legacy `ApiError` from the fetch client, or anything else.
 */
export function problemMessage(e: unknown, fallback = GENERIC): string {
  if (isApiProblem(e)) return e.title;
  if (e instanceof ApiError) return e.problem.title;
  if (e instanceof TypeError) return OFFLINE;
  const s = e as SerializedError | undefined;
  if (s && typeof s === "object" && "name" in s && s.name === "AbortError") return fallback;
  return fallback;
}

/** True for a given status or API code: `is(error, 404)`, `is(error, "handle_taken")`. */
export function is(e: unknown, match: number | string): boolean {
  if (!isApiProblem(e)) return false;
  return typeof match === "number" ? e.status === match : e.code === match;
}
