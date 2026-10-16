import { ApiError, createApiClient, unwrap } from "@daddy-jokes/contracts";

export { ApiError, unwrap };
export type {
  CompleteOnboardingRequest,
  CreateJokeRequest,
  Creator,
  CuratedJoke,
  CurationCalendar,
  Me,
  PossibleCopy,
  QueueItem,
  Session,
  Submission,
  Topic,
} from "@daddy-jokes/contracts";

/** Empty in development: Vite proxies /v1 to the API. */
const BASE_URL = import.meta.env.VITE_API_URL ?? "";

/**
 * The access token lives in memory only. The long-lived refresh token is an
 * httpOnly cookie the browser sends to /v1/auth, so page scripts can't read it.
 */
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** Gets a new access token from the refresh cookie. Concurrent callers share one request. */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/v1/auth/refresh`, { method: "POST", credentials: "include" });
      accessToken = res.ok ? ((await res.json()) as { accessToken: string }).accessToken : null;
    } catch {
      accessToken = null;
    }
    return accessToken;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export const api = createApiClient({
  baseUrl: BASE_URL,
  getAccessToken: () => accessToken,
  onUnauthorized: refreshAccessToken,
});

/** The message to show for a failed call: the API's own title when there is one. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (err instanceof ApiError) return err.problem.title;
  if (err instanceof TypeError) return "Can't reach Daddy Jokes. Check your connection and try again.";
  return fallback;
}
