import { fetchBaseQuery, retry } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError, FetchBaseQueryMeta } from "@reduxjs/toolkit/query/react";
import { getAccessToken, refreshAccessToken } from "../client.ts";
import { toProblem } from "./problem.ts";
import type { ApiProblem } from "./problem.ts";

/** Empty in development: Vite proxies /v1 to the API. */
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "";

/**
 * Query strings the way the API (and openapi-fetch) expect them: arrays repeat the key
 * (`?topic=a&topic=b`), and undefined, null and empty-string values are left out, so
 * optional filters can be passed straight through.
 */
export function serializeParams(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((item) => q.append(k, String(item)));
    else q.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return q.toString();
}

const raw = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  credentials: "include", // the refresh cookie
  timeout: 20_000,
  paramsSerializer: serializeParams,
  prepareHeaders: (headers) => {
    const token = getAccessToken();
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json, application/problem+json");
    return headers;
  },
});

type Args = string | FetchArgs;
type Raw = BaseQueryFn<Args, unknown, FetchBaseQueryError, object, FetchBaseQueryMeta>;

let sessionExpired: (() => void) | null = null;

/** Called once when a refresh fails mid-session; the auth store signs the person out. */
export function onSessionExpired(handler: (() => void) | null) {
  sessionExpired = handler;
}

const urlOf = (args: Args) => (typeof args === "string" ? args : args.url);
const methodOf = (args: Args) => (typeof args === "string" ? "GET" : (args.method ?? "GET").toUpperCase());

/**
 * 401 → refresh the access token from the cookie (one shared request for every call
 * that hit 401 at the same time, see refreshAccessToken) → replay the call once.
 */
const withReauth: Raw = async (args, api, extra) => {
  let result = await raw(args, api, extra);
  if (result.error?.status === 401 && !urlOf(args).startsWith("/v1/auth/")) {
    const token = await refreshAccessToken();
    if (token) result = await raw(args, api, extra);
    else sessionExpired?.();
  }
  return result;
};

const TRANSIENT = new Set<unknown>(["FETCH_ERROR", "TIMEOUT_ERROR", 429, 502, 503, 504]);

/**
 * Reads retry twice on a dropped connection, a timeout or a gateway error, with
 * exponential backoff. Writes never retry automatically: they aren't idempotent.
 */
const withRetry = retry(
  async (args: Args, api, extra) => {
    const result = await withReauth(args, api, extra as object);
    if (result.error) {
      const safe = methodOf(args) === "GET" || methodOf(args) === "HEAD";
      if (!safe || !TRANSIENT.has(result.error.status)) retry.fail(result.error, result.meta);
    }
    return result;
  },
  { maxRetries: 2 },
);

/** The base query every endpoint uses. Errors always come out as an ApiProblem. */
export const baseQuery: BaseQueryFn<Args, unknown, ApiProblem, { maxRetries?: number }, FetchBaseQueryMeta> = async (
  args,
  api,
  extra,
) => {
  const result = await withRetry(args, api, extra);
  if (result.error) return { error: toProblem(result.error as FetchBaseQueryError), meta: result.meta };
  return { data: result.data, meta: result.meta };
};
