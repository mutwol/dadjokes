import { z } from "zod";
import { named } from "../common/zod";
import { EVENT_TYPE_KEYS } from "../platform/event-types";
import { Group } from "../rules/model";

/*
 * A workflow is a trigger and a list of steps, run top to bottom for the person
 * the event is about. Filters stop the run; Decision steps ask a rule set;
 * waits pause it durably; the rest are actions. Rules decide *what*, workflows
 * decide *what next and when*, actions do the side effects.
 */

const StepId = z.string().min(1).max(40);
const Text = (max: number) => z.string().max(max);

export const FilterStep = named(
  "FilterStep",
  z.object({ id: StepId, type: z.literal("filter"), name: z.string().max(80).default(""), when: Group }),
  "Carry on only if the conditions hold; otherwise the run stops here.",
);
export const DecisionStep = named(
  "DecisionStep",
  z.object({
    id: StepId,
    type: z.literal("decision"),
    name: z.string().max(80).default(""),
    ruleSetKey: z.string().min(1).max(120),
    stopUnlessMatched: z.boolean().default(false).describe("Stop the run when no rule matched (only the default applied)."),
  }),
  "Ask a rule set. Its outputs are available to later steps as decision.<output>.",
);
export const DelayStep = named(
  "DelayStep",
  z.object({ id: StepId, type: z.literal("delay"), minutes: z.number().int().min(1).max(60 * 24 * 30) }),
  "Wait a while before the next step.",
);
export const WaitUntilHourStep = named(
  "WaitUntilHourStep",
  z.object({ id: StepId, type: z.literal("wait_until_hour"), hour: z.number().int().min(0).max(23) }),
  "Wait until this hour in the person's own time zone (today, or tomorrow if it has passed).",
);
export const SendPushStep = named(
  "SendPushStep",
  z.object({ id: StepId, type: z.literal("send_push"), title: Text(120).min(1), body: Text(300).default(""), url: Text(300).default("/") }),
  "A push notification. Subject to the send policy.",
);
export const SendEmailStep = named(
  "SendEmailStep",
  z.object({ id: StepId, type: z.literal("send_email"), subject: Text(150).min(1), body: Text(5000).min(1) }),
  "An email. Subject to the send policy.",
);
export const NotifyStep = named(
  "NotifyStep",
  z.object({ id: StepId, type: z.literal("notify"), title: Text(120).min(1), body: Text(300).default(""), url: Text(300).default("/") }),
  "An item in their Activity feed, also pushed to their devices. Subject to the send policy.",
);
export const TagStep = named(
  "TagStep",
  z.object({
    id: StepId,
    type: z.enum(["add_tag", "remove_tag"]),
    tag: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "Tags are lowercase letters, numbers, - and _."),
  }),
  "Label the person, for segments and later conditions.",
);
export const AlertStaffStep = named(
  "AlertStaffStep",
  z.object({ id: StepId, type: z.literal("alert_staff"), title: Text(120).min(1), body: Text(300).default(""), url: Text(300).default("/admin") }),
  "Tell curators and admins (Activity and push). Not subject to the send policy.",
);

export const WorkflowStep = named(
  "WorkflowStep",
  z.union([FilterStep, DecisionStep, DelayStep, WaitUntilHourStep, SendPushStep, SendEmailStep, NotifyStep, TagStep, AlertStaffStep]),
);
export type WorkflowStep = z.infer<typeof WorkflowStep>;

export const WorkflowGraph = named(
  "WorkflowGraph",
  z.object({
    trigger: z.object({
      type: z.enum(EVENT_TYPE_KEYS),
      /** Optional: only start for events (and people) matching these conditions. */
      when: Group.optional(),
    }),
    steps: z.array(WorkflowStep).max(40),
  }),
);
export type WorkflowGraph = z.infer<typeof WorkflowGraph>;

export const emptyGraph = (): WorkflowGraph => ({ trigger: { type: "manual" }, steps: [] });

/** What each step type is, for the editor's step picker. */
export const STEP_TYPES = [
  { type: "filter", category: "Flow", label: "Only continue if…", description: "Stop the run unless conditions hold." },
  { type: "decision", category: "Flow", label: "Ask a rule set", description: "Get a decision; later steps can use decision.<output>." },
  { type: "delay", category: "Wait", label: "Wait", description: "Pause for minutes, hours or days." },
  { type: "wait_until_hour", category: "Wait", label: "Wait until a time of day", description: "Pause until an hour in their time zone." },
  { type: "send_push", category: "Message", label: "Send a push", description: "Push notification to their devices." },
  { type: "send_email", category: "Message", label: "Send an email", description: "A plain email." },
  { type: "notify", category: "Message", label: "Activity item", description: "Shows in Activity and pushes." },
  { type: "add_tag", category: "People", label: "Add a tag", description: "Label them for segments." },
  { type: "remove_tag", category: "People", label: "Remove a tag", description: "Take a label off." },
  { type: "alert_staff", category: "Team", label: "Alert curators", description: "Tell curators and admins." },
] as const;
