import { sql } from "drizzle-orm";
import { streaksQuery } from "../common/streaks";
import type { Db } from "../db/db.module";

/** What workflows know about a person (user.* in conditions and templates). */
export interface UserFacts {
  id: string;
  name: string;
  firstName: string;
  handle: string;
  email: string;
  country: string | null;
  timezone: string;
  localHour: number;
  roles: string[];
  tags: string[];
  isWriter: boolean;
  streak: number;
  daysSinceSignup: number;
  daysSinceLastOpen: number | null;
  opens: number;
  missedLast7d: number;
  subscriptions: number;
  tipsSent: number;
  pushEnabled: boolean;
}

export async function loadUserFacts(db: Db, userId: string): Promise<UserFacts | null> {
  const { rows } = await db.execute<{
    id: string;
    name: string | null;
    handle: string | null;
    email: string;
    country: string | null;
    timezone: string;
    local_hour: number;
    roles: string[] | null;
    tags: string[] | null;
    subscriptions: number;
    tips_sent: number;
    opens: number;
    last_open: string | null;
    missed7: number;
    push: boolean;
    created_at: string;
  }>(sql`
    select u.id, u.name, u.handle, u.email, u.country, u.timezone, u.created_at,
      extract(hour from now() at time zone u.timezone)::int as local_hour,
      (select array_agg(role::text) from user_roles where user_id = u.id) as roles,
      (select array_agg(tag) from user_tags where user_id = u.id) as tags,
      (select count(*)::int from subscriptions where subscriber_id = u.id) as subscriptions,
      (select count(*)::int from tips where tipper_id = u.id and status = 'paid') as tips_sent,
      (select count(*)::int from deliveries where user_id = u.id and opened_at is not null) as opens,
      (select max(opened_at) from deliveries where user_id = u.id) as last_open,
      (select count(*)::int from deliveries where user_id = u.id and opened_at is null and expires_at < now()
         and local_date > (now() at time zone u.timezone)::date - 7) as missed7,
      exists (select 1 from push_subscriptions where user_id = u.id) as push
    from users u where u.id = ${userId}
  `);
  const u = rows[0];
  if (!u) return null;
  const streakRows = await db.execute<{ streak: number }>(streaksQuery(sql`d.user_id = ${userId}`));
  const name = u.name ?? u.handle ?? "";
  const roles = u.roles ?? [];
  const day = 86_400_000;
  return {
    id: u.id,
    name,
    firstName: name.split(" ")[0] || "there",
    handle: u.handle ?? "",
    email: u.email,
    country: u.country,
    timezone: u.timezone,
    localHour: u.local_hour,
    roles,
    tags: u.tags ?? [],
    isWriter: roles.includes("writer"),
    streak: streakRows.rows[0]?.streak ?? 0,
    daysSinceSignup: Math.floor((Date.now() - new Date(u.created_at).getTime()) / day),
    daysSinceLastOpen: u.last_open ? Math.floor((Date.now() - new Date(u.last_open).getTime()) / day) : null,
    opens: u.opens,
    missedLast7d: u.missed7,
    subscriptions: u.subscriptions,
    tipsSent: u.tips_sent,
    pushEnabled: u.push,
  };
}

/** The next moment it is `hour` o'clock in a time zone: now if it already is, else later today or tomorrow. */
export function nextLocalHour(timezone: string, hour: number, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  if (h === hour) return now;
  let minutesAhead = (hour - h) * 60 - m;
  if (minutesAhead <= 0) minutesAhead += 24 * 60;
  return new Date(now.getTime() + minutesAhead * 60_000 - now.getSeconds() * 1000);
}
