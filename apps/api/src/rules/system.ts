import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ruleSets, ruleSetVersions } from "../db/schema";
import type { RuleDefinition } from "./model";

/*
 * Rule sets the app itself relies on. They're created by migrations (in every
 * environment, production included) and can be edited in the admin console,
 * but not deleted. If one is missing or unpublished, callers fall back to the
 * same behaviour in code.
 */

const c = (id: string, field: string, op: string, value?: unknown) => ({ kind: "condition" as const, id, field, op: op as never, value });
const all = (id: string, ...items: ReturnType<typeof c>[]) => ({ kind: "group" as const, id, match: "all" as const, items });
const any = (id: string, ...items: ReturnType<typeof c>[]) => ({ kind: "group" as const, id, match: "any" as const, items });

export const SYSTEM_RULE_SETS: { key: string; name: string; description: string; decisionPoint: string; definition: RuleDefinition }[] = [
  {
    key: "moderation.auto_hide",
    name: "Auto-hide reported content",
    description: "Hides a joke or comment from readers once enough people report it, until a curator decides.",
    decisionPoint: "moderation.report",
    definition: {
      hitPolicy: "first",
      rules: [
        {
          id: "r_offensive",
          name: "Two people say it's offensive",
          enabled: true,
          when: all("g1", c("c1", "reasons.offensive", "gte", 2)),
          then: [
            { key: "hide", value: true },
            { key: "notifyStaff", value: true },
          ],
        },
        {
          id: "r_many",
          name: "Three or more different people reported it",
          enabled: true,
          when: all("g2", c("c2", "distinctReporters", "gte", 3)),
          then: [
            { key: "hide", value: true },
            { key: "notifyStaff", value: true },
          ],
        },
        {
          id: "r_repeat_author",
          name: "Author with recent takedowns, reported as offensive",
          enabled: true,
          when: all("g3", c("c3", "authorRemovedLast90d", "gte", 2), c("c4", "reasons.offensive", "gte", 1)),
          then: [
            { key: "hide", value: true },
            { key: "notifyStaff", value: true },
          ],
        },
      ],
      default: [
        { key: "hide", value: false },
        { key: "notifyStaff", value: false },
      ],
      tests: [
        { id: "t1", name: "One report leaves it up", facts: { target: "joke", reports: 1, distinctReporters: 1, reasons: { copied: 1 } }, expect: { hide: false } },
        { id: "t2", name: "Two offensive reports hide it", facts: { target: "comment", reports: 2, distinctReporters: 2, reasons: { offensive: 2 } }, expect: { hide: true } },
        { id: "t3", name: "Three reporters hide it", facts: { target: "joke", reports: 3, distinctReporters: 3, reasons: { copied: 3 } }, expect: { hide: true } },
      ],
    },
  },
  {
    key: "automation.send_policy",
    name: "Send policy: quiet hours and caps",
    description:
      "Checked before any workflow messages someone. Keeps the one-joke-a-day promise: no messages at night and at most two automated messages a day.",
    decisionPoint: "automation.send_policy",
    definition: {
      hitPolicy: "first",
      rules: [
        {
          id: "r_quiet",
          name: "Quiet hours (9pm to 7am their time)",
          enabled: true,
          when: any("g1", c("c1", "localHour", "lt", 7), c("c2", "localHour", "gte", 21)),
          then: [
            { key: "allow", value: false },
            { key: "reason", value: "Quiet hours ({{localHour}}:00 their time)" },
          ],
        },
        {
          id: "r_daily_cap",
          name: "At most two automated messages a day",
          enabled: true,
          when: all("g2", c("c3", "sentLast24h", "gte", 2)),
          then: [
            { key: "allow", value: false },
            { key: "reason", value: "Daily cap: already sent {{sentLast24h}} today" },
          ],
        },
        {
          id: "r_weekly_same",
          name: "The same workflow at most three times a week",
          enabled: true,
          when: all("g3", c("c4", "sameWorkflowLast7d", "gte", 3)),
          then: [
            { key: "allow", value: false },
            { key: "reason", value: "This workflow already messaged them 3 times this week" },
          ],
        },
      ],
      default: [{ key: "allow", value: true }],
      tests: [
        { id: "t1", name: "Evening push is fine", facts: { channel: "push", localHour: 19, sentLast24h: 0, sameWorkflowLast7d: 0 }, expect: { allow: true } },
        { id: "t2", name: "Nothing at 11pm", facts: { channel: "push", localHour: 23, sentLast24h: 0 }, expect: { allow: false } },
        { id: "t3", name: "Third message today is blocked", facts: { channel: "email", localHour: 12, sentLast24h: 2 }, expect: { allow: false } },
      ],
    },
  },
];

/** Creates any missing system rule set, published as version 1. Never overwrites edits. */
export async function ensureSystemRuleSets<T extends Record<string, unknown>>(db: NodePgDatabase<T>) {
  for (const s of SYSTEM_RULE_SETS) {
    const [created] = await db
      .insert(ruleSets)
      .values({
        key: s.key,
        name: s.name,
        description: s.description,
        decisionPoint: s.decisionPoint,
        system: true,
        status: "published",
        draft: s.definition,
        liveVersion: 1,
      })
      .onConflictDoNothing()
      .returning({ id: ruleSets.id });
    if (!created) continue;
    await db.insert(ruleSetVersions).values({ ruleSetId: created.id, version: 1, definition: s.definition }).onConflictDoNothing();
  }
  return db.select({ key: ruleSets.key }).from(ruleSets).where(eq(ruleSets.system, true));
}
