import createFetchClient from "openapi-fetch";
import type { Middleware } from "openapi-fetch";
import type { components, operations, paths } from "./schema";

export type { components, operations, paths };

type Schemas = components["schemas"];
export type Me = Schemas["Me"];
export type Session = Schemas["Session"];
export type Creator = Schemas["Creator"];
export type CreatorPage = Schemas["CreatorPage"];
export type Topic = Schemas["Topic"];
export type HandleAvailability = Schemas["HandleAvailability"];
export type CompleteOnboardingRequest = Schemas["CompleteOnboardingRequest"];
export type Problem = Schemas["Problem"];
export type Submission = Schemas["Submission"];
export type SubmissionPage = Schemas["SubmissionPage"];
export type CreateJokeRequest = Schemas["CreateJokeRequest"];
export type CuratedJoke = Schemas["CuratedJoke"];
export type QueueItem = Schemas["QueueItem"];
export type PossibleCopy = Schemas["PossibleCopy"];
export type CurationCalendar = Schemas["CurationCalendar"];
export type Joke = Schemas["Joke"];
export type Today = Schemas["Today"];
export type DeliveryCard = Schemas["DeliveryCard"];
export type StudioSummary = Schemas["StudioSummary"];
export type JokeStats = Schemas["JokeStats"];
export type Comment = Schemas["Comment"];
export type ReportedItem = Schemas["ReportedItem"];
export type StudioDaily = Schemas["StudioDaily"];

/** Error thrown by `unwrap` for any non-2xx response. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.title);
    this.name = "ApiError";
    this.status = problem.status;
    this.code = problem.code;
    this.problem = problem;
  }

  /** Field-level messages from a 422 response, keyed by field path. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.problem.errors ?? []).map((e) => [e.path, e.message]));
  }
}

export interface ClientOptions {
  /** Where the API lives, e.g. "/api" behind the Vite proxy or "https://api.example.com". */
  baseUrl: string;
  /** Returns the current access token, if signed in. */
  getAccessToken?: () => string | null;
  /**
   * Called once when a request comes back 401. Should refresh the session and
   * return a new access token, or null if the person must sign in again.
   */
  onUnauthorized?: () => Promise<string | null>;
}

export function createApiClient(opts: ClientOptions) {
  const client = createFetchClient<paths>({ baseUrl: opts.baseUrl, credentials: "include" });

  const auth: Middleware = {
    onRequest({ request }) {
      const token = opts.getAccessToken?.();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    },
    async onResponse({ request, response }) {
      const isAuthRoute = new URL(request.url).pathname.includes("/v1/auth/");
      if (response.status !== 401 || isAuthRoute || !opts.onUnauthorized) return response;
      const token = await opts.onUnauthorized();
      if (!token) return response;
      const retry = request.clone();
      retry.headers.set("Authorization", `Bearer ${token}`);
      return fetch(retry);
    },
  };
  client.use(auth);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Returns `data` from an openapi-fetch result, or throws ApiError. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok) return result.data as T;
  const e = result.error as Partial<Problem> | undefined;
  throw new ApiError({
    type: e?.type ?? "about:blank",
    title: e?.title ?? `Request failed with status ${result.response.status}`,
    status: result.response.status,
    code: e?.code ?? "unknown",
    detail: e?.detail,
    errors: e?.errors,
  });
}
