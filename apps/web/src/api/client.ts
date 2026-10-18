import { ApiError, createApiClient, unwrap } from "@daddy-jokes/contracts";

export { ApiError, unwrap };
export type {
  Activity,
  AdminEngagement,
  AdminFinance,
  AdminOverview,
  AdminUserDetail,
  AdminUserRow,
  Appeal,
  AuditEntry,
  AutomationCatalog,
  AutomationStats,
  Balance,
  DecisionPoint,
  Landing,
  ReportReceipt,
  Rule,
  RuleCondition,
  RuleDefinition,
  RuleEvaluation,
  RuleGroup,
  RuleOutcome,
  RuleSetDetail,
  RuleSetSummary,
  RuleTestCase,
  RuleTestReport,
  WorkflowDetail,
  WorkflowGraph,
  WorkflowRun,
  WorkflowRunDetail,
  WorkflowStep,
  WorkflowSummary,
  Comment,
  CompleteOnboardingRequest,
  CreateJokeRequest,
  Creator,
  CuratedJoke,
  CurationCalendar,
  DeliveryCard,
  Joke,
  JokeStats,
  Me,
  PayoutTransfer,
  PossibleCopy,
  QueueItem,
  ReportedItem,
  StudioDaily,
  Session,
  StudioSummary,
  Submission,
  Tip,
  Today,
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

export function getAccessToken() {
  return accessToken;
}

export const apiUrl = (path: string) => `${BASE_URL}${path}`;

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

/*
 * Screens use RTK Query (./rtk) for data. This fetch client remains for the session
 * itself (refresh, logout) and for streaming and file downloads; show errors with
 * `problemMessage` from ./rtk.
 */
