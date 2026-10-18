/*
 * Decision points: the places in the app that ask a rule set for a decision.
 * Each lists the facts its rules can test, so the admin builder offers only
 * real fields with operators that suit their type.
 */

export type FactType = "number" | "text" | "boolean" | "list" | "date";

export interface FactField {
  path: string;
  type: FactType;
  label: string;
  example?: unknown;
}

export interface DecisionPoint {
  key: string;
  label: string;
  description: string;
  facts: FactField[];
  /** Outputs callers look for. Rules may return others too. */
  outputs: { key: string; type: FactType; label: string }[];
}

/** The facts every workflow knows about the person a run is for. */
export const USER_FACTS: FactField[] = [
  { path: "user.streak", type: "number", label: "Current streak (days)", example: 4 },
  { path: "user.daysSinceSignup", type: "number", label: "Days since signing up", example: 12 },
  { path: "user.daysSinceLastOpen", type: "number", label: "Days since last opened a joke", example: 1 },
  { path: "user.opens", type: "number", label: "Jokes opened, ever", example: 9 },
  { path: "user.missedLast7d", type: "number", label: "Jokes missed in the last 7 days", example: 2 },
  { path: "user.country", type: "text", label: "Country", example: "Kenya" },
  { path: "user.localHour", type: "number", label: "Their local hour now (0-23)", example: 18 },
  { path: "user.roles", type: "list", label: "Roles", example: ["reader"] },
  { path: "user.tags", type: "list", label: "Tags", example: ["vip"] },
  { path: "user.isWriter", type: "boolean", label: "Writes jokes", example: false },
  { path: "user.subscriptions", type: "number", label: "Writers they subscribe to", example: 3 },
  { path: "user.tipsSent", type: "number", label: "Tips they've paid", example: 0 },
  { path: "user.pushEnabled", type: "boolean", label: "Has push notifications on", example: true },
];

export const DECISION_POINTS: DecisionPoint[] = [
  {
    key: "moderation.report",
    label: "A joke or comment was reported",
    description: "Asked after every report. Return hide = true to hide it from readers until a curator reviews it.",
    facts: [
      { path: "target", type: "text", label: "What was reported (joke or comment)", example: "joke" },
      { path: "reports", type: "number", label: "Open reports on it", example: 2 },
      { path: "distinctReporters", type: "number", label: "Different people who reported it", example: 2 },
      { path: "reasons.copied", type: "number", label: "Reports saying copied", example: 0 },
      { path: "reasons.offensive", type: "number", label: "Reports saying offensive", example: 2 },
      { path: "reasons.spam", type: "number", label: "Reports saying spam", example: 0 },
      { path: "reasons.other", type: "number", label: "Reports saying other", example: 0 },
      { path: "authorRemovedLast90d", type: "number", label: "The author's jokes and comments taken down in 90 days", example: 0 },
      { path: "ageHours", type: "number", label: "Hours since it was posted or went out", example: 5 },
    ],
    outputs: [
      { key: "hide", type: "boolean", label: "Hide until reviewed" },
      { key: "notifyStaff", type: "boolean", label: "Alert curators" },
    ],
  },
  {
    key: "automation.send_policy",
    label: "A workflow is about to message someone",
    description:
      "Asked before every push, email or activity message a workflow sends. Return allow = false to skip it. This is how quiet hours and frequency caps work, for every workflow at once.",
    facts: [
      { path: "channel", type: "text", label: "Channel (push, email, activity)", example: "push" },
      { path: "sentLast24h", type: "number", label: "Automated messages they got in the last 24 hours", example: 1 },
      { path: "sentLast7d", type: "number", label: "Automated messages in the last 7 days", example: 3 },
      { path: "sameWorkflowLast7d", type: "number", label: "From this same workflow in 7 days", example: 0 },
      { path: "localHour", type: "number", label: "Their local hour now (0-23)", example: 19 },
      ...USER_FACTS.filter((f) => ["user.tags", "user.roles"].includes(f.path)),
    ],
    outputs: [
      { key: "allow", type: "boolean", label: "Send it" },
      { key: "reason", type: "text", label: "Why not (shown in the run log)" },
    ],
  },
  {
    key: "workflow",
    label: "Inside a workflow",
    description:
      "For Decision steps in workflows. Rules can test the person (user.*) and the event that started the run (event.*). Later steps can test the outputs as decision.<output>.",
    facts: [...USER_FACTS, { path: "event", type: "text", label: "Event fields (event.<field>)" }],
    outputs: [],
  },
];

export const decisionPoint = (key: string) => DECISION_POINTS.find((d) => d.key === key);
