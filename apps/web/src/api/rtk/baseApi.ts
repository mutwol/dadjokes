import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQuery } from "./baseQuery.ts";

/**
 * Cache tag types. Each names an entity (or a screen-level aggregate); lists provide
 * `{ type, id: "LIST" }` and items `{ type, id }`, so a write can refresh exactly what
 * it changed. The mapping from endpoints to tags is in endpoints.ts.
 */
export const TAG_TYPES = [
  "Me",
  "Activity",
  "Topic",
  "Creator",
  "Subscription",
  "MyJoke",
  "Appeal",
  "ReviewQueue",
  "Calendar",
  "CuratedJoke",
  "Report",
  "Today",
  "Studio",
  "Joke",
  "Comment",
  "Tip",
  "TipWall",
  "Balance",
  "Payout",
  "DecisionPoint",
  "RuleSet",
  "RuleVersion",
  "Automation",
  "Workflow",
  "WorkflowVersion",
  "Run",
  "AdminOverview",
  "AdminFinance",
  "FeePolicy",
  "Reconciliation",
  "CreatorFund",
  "AdminEngagement",
  "AdminUser",
  "AdminTag",
  "Audit",
  "Landing",
  "Push",
] as const;

export type TagType = (typeof TAG_TYPES)[number];

/**
 * The one RTK Query API. Generated endpoints (generated.ts) inject into it; endpoints.ts
 * enhances them with tags and optimistic updates without touching generated code.
 */
export const baseApi = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: TAG_TYPES,
  // Unused data stays a minute, so going back to a screen is instant.
  keepUnusedDataFor: 60,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
