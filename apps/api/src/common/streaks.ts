import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

/**
 * Current streaks in SQL, matching DeliveriesService.today(): consecutive
 * opened days counted back from the newest; a joke that can still be opened
 * doesn't break it, and days without a delivery are skipped.
 * Returns rows of (user_id, streak). Pass a filter on `d.user_id` to narrow it.
 */
export function streaksQuery(userFilter: SQL = sql`true`) {
  return sql`
    with d as (
      select d.user_id, d.local_date,
             d.opened_at is not null as opened,
             (d.opened_at is null and d.expires_at > now()) as pending
      from deliveries d
      where d.local_date > current_date - 400 and ${userFilter}
    ), x as (
      select user_id, opened,
             sum(case when not opened and not pending then 1 else 0 end)
               over (partition by user_id order by local_date desc rows unbounded preceding) as breaks
      from d
    )
    select user_id, (count(*) filter (where opened and breaks = 0))::int as streak
    from x group by user_id
  `;
}
