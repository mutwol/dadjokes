/**
 * Everything a workflow can be triggered by. Each entry documents the payload,
 * which the workflow editor shows as fields and templates can read as {{event.<field>}}.
 */
export const EVENT_TYPES = {
  "user.signed_up": {
    label: "Someone finished signing up",
    fields: { roles: "list", country: "text" },
  },
  "delivery.opened": {
    label: "A reader opened their daily joke",
    fields: { jokeId: "text", date: "date", streak: "number" },
  },
  "delivery.unopened": {
    label: "Today's joke is still sealed (10 hours after it arrived)",
    fields: { jokeId: "text", date: "date", hoursLeft: "number" },
  },
  "delivery.missed": {
    label: "A reader missed a joke (it expired unopened)",
    fields: { jokeId: "text", date: "date", missedInARow: "number" },
  },
  "streak.milestone": {
    label: "A reader reached a streak milestone (3, 7, 14, 30, 50, 100… days)",
    fields: { streak: "number" },
  },
  "subscription.created": {
    label: "A reader subscribed to a writer",
    fields: { creatorId: "text", creatorHandle: "text" },
  },
  "tip.paid": {
    label: "A tip was paid",
    fields: { tipId: "text", jokeId: "text", creatorId: "text", amountKes: "number" },
  },
  "report.created": {
    label: "Someone reported a joke or comment",
    fields: { target: "text", jokeId: "text", commentId: "text", reason: "text", reports: "number", hidden: "boolean" },
  },
  "manual": {
    label: "Started by hand from the admin console",
    fields: {},
  },
} as const satisfies Record<string, { label: string; fields: Record<string, "text" | "number" | "boolean" | "date" | "list"> }>;

export type EventType = keyof typeof EVENT_TYPES;
export const EVENT_TYPE_KEYS = Object.keys(EVENT_TYPES) as [EventType, ...EventType[]];
