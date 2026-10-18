import type { WorkflowGraph } from "./model";

const cond = (id: string, field: string, op: string, value?: unknown) => ({ kind: "condition" as const, id, field, op: op as never, value });
const all = (id: string, ...items: ReturnType<typeof cond>[]) => ({ kind: "group" as const, id, match: "all" as const, items });

/** Starting points in the "New workflow" dialog. Each creates an ordinary draft to edit. */
export const WORKFLOW_TEMPLATES: { key: string; name: string; description: string; graph: WorkflowGraph }[] = [
  {
    key: "streak_at_risk",
    name: "Streak at risk",
    description: "Nudge readers with a streak of 3+ whose joke is still sealed late in the day.",
    graph: {
      trigger: { type: "delivery.unopened" },
      steps: [
        { id: "s1", type: "filter", name: "Has a streak worth saving", when: all("g1", cond("c1", "user.streak", "gte", 3)) },
        {
          id: "s2",
          type: "send_push",
          title: "Your {{user.streak}}-day streak is waiting",
          body: "Today's joke is still sealed. Open it before it's gone.",
          url: "/",
        },
      ],
    },
  },
  {
    key: "welcome_series",
    name: "Welcome series",
    description: "Say hello, then a day later share how it works, then suggest writers to follow.",
    graph: {
      trigger: { type: "user.signed_up" },
      steps: [
        { id: "s1", type: "notify", title: "Welcome to Daddy Jokes, {{user.firstName}}!", body: "Your first joke arrives at your delivery time. Open it within a day.", url: "/" },
        { id: "s2", type: "delay", minutes: 60 * 24 },
        { id: "s3", type: "wait_until_hour", hour: 18 },
        {
          id: "s4",
          type: "send_email",
          subject: "How Daddy Jokes works",
          body:
            "Hi {{user.firstName}},\n\nEvery day one hand-picked dad joke arrives, sealed like a status. Open it within 24 hours or it's gone. Open one every day and your streak grows.\n\nGot a better one? Write your own: if the curators pick it, everyone gets it that day, and you can be tipped.\n\nGroan responsibly,\nDaddy Jokes",
        },
        { id: "s5", type: "delay", minutes: 60 * 24 * 2 },
        { id: "s6", type: "filter", name: "Follows nobody yet", when: all("g1", cond("c1", "user.subscriptions", "lt", 1)) },
        { id: "s7", type: "send_push", title: "Follow a few writers", body: "Subscribe to the people whose jokes made you groan the loudest.", url: "/explore" },
      ],
    },
  },
  {
    key: "win_back",
    name: "Win back lapsing readers",
    description: "After three missed jokes in a row, email them and tag them as lapsing.",
    graph: {
      trigger: { type: "delivery.missed" },
      steps: [
        { id: "s1", type: "filter", name: "Missed three in a row", when: all("g1", cond("c1", "event.missedInARow", "gte", 3)) },
        { id: "s2", type: "add_tag", tag: "lapsing" },
        { id: "s3", type: "wait_until_hour", hour: 9 },
        {
          id: "s4",
          type: "send_email",
          subject: "We saved you a groan",
          body: "Hi {{user.firstName}},\n\nYour last few dad jokes went unopened. Tomorrow's is already picked. Want it at a better time? Change your delivery hour in your profile.\n\nDaddy Jokes",
        },
      ],
    },
  },
  {
    key: "welcome_back",
    name: "Welcome back",
    description: "When a lapsing reader opens a joke again, remove the tag and say hi.",
    graph: {
      trigger: { type: "delivery.opened", when: all("g0", cond("c0", "user.tags", "contains", "lapsing")) },
      steps: [
        { id: "s1", type: "remove_tag", tag: "lapsing" },
        { id: "s2", type: "notify", title: "Welcome back, {{user.firstName}}!", body: "Your streak starts again today.", url: "/" },
      ],
    },
  },
  {
    key: "streak_celebration",
    name: "Celebrate streaks",
    description: "Congratulate milestone streaks and tag regulars at 7+ days.",
    graph: {
      trigger: { type: "streak.milestone" },
      steps: [
        { id: "s1", type: "notify", title: "{{event.streak}} days in a row!", body: "That's a lot of groaning. Keep it going.", url: "/" },
        { id: "s2", type: "filter", name: "A week or more", when: all("g1", cond("c1", "event.streak", "gte", 7)) },
        { id: "s3", type: "add_tag", tag: "regular" },
        { id: "s4", type: "send_push", title: "You're a regular now", body: "Share today's joke with someone who needs a groan.", url: "/" },
      ],
    },
  },
  {
    key: "hidden_report_alert",
    name: "Alert curators about hidden content",
    description: "When reports hide something, tell the team straight away.",
    graph: {
      trigger: { type: "report.created", when: all("g0", cond("c0", "event.hidden", "is_true")) },
      steps: [
        {
          id: "s1",
          type: "alert_staff",
          title: "A reported {{event.target}} is hidden",
          body: "{{event.reports}} reports so far. It stays hidden until someone decides.",
          url: "/curate",
        },
      ],
    },
  },
];
