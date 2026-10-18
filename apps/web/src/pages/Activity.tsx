import { useEffect, useState } from "react";
import { Link } from "react-router";
import { problemMessage, useListActivityQuery, useMarkActivityReadMutation } from "../api/rtk/index.ts";
import type { Activity as ActivityItem } from "../api/rtk/index.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { button } from "@/components/ui/button.tsx";
import { card, EmptyState } from "@/components/ui/card.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import type { IconName } from "@/components/ui/icon.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { cn } from "@/lib/utils.ts";
import { timeAgo } from "../data/dates.ts";
import { useStore } from "../state/useStore.ts";

/** Good news (money in, a joke picked) gets a green icon. */
const GOOD_NEWS = new Set<ActivityItem["type"]>(["joke_scheduled", "tip_received", "payout_paid", "appeal_resolved"]);

const ICONS: Record<ActivityItem["type"], IconName> = {
  joke_scheduled: "check",
  joke_declined: "close",
  joke_delivered: "send",
  joke_removed: "close",
  new_subscriber: "user",
  comment: "comment",
  tip_received: "coin",
  payout_paid: "coin",
  payout_failed: "coin",
  report_resolved: "flag",
  appeal_resolved: "shield",
  automation: "bell",
};

export function Activity() {
  const { clearUnread } = useStore();
  // Pages accumulate in one cache entry; "Show older" passes the cursor (see endpoints.ts).
  const [older, setOlder] = useState<string | undefined>(undefined);
  const { data, error, isFetching } = useListActivityQuery({ limit: 30, cursor: older }, { refetchOnMountOrArgChange: true });
  const [markRead] = useMarkActivityReadMutation();
  const items = data ? data.data : error ? [] : null;
  const cursor = data?.nextCursor ?? null;

  // Seen now: everything up to here counts as read (the list still shows what was new).
  const unread = !older ? (data?.unread ?? 0) : 0;
  useEffect(() => {
    if (unread) void markRead().unwrap().then(clearUnread, () => undefined);
  }, [unread, markRead, clearUnread]);
  useEffect(() => {
    if (error && older) toast.error(problemMessage(error));
  }, [error, older]);

  const more = () => cursor && setOlder(cursor);

  return (
    <div className="mx-auto grid max-w-feed gap-4 px-4 pb-8">
      <header className="pt-4.5">
        <h1 className="text-3xl">Activity</h1>
      </header>
      {items !== null && !items.length ? (
        <EmptyState className="justify-items-center px-5 py-10 text-center">
          <Icon name="bell" size={28} />
          <p>Nothing yet. Comments on your jokes, new subscribers and tips will show up here.</p>
        </EmptyState>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0" aria-busy={items === null}>
          {(items ?? []).map((a) => (
            <li key={a.id}>
              <Link
                to={a.url}
                className={cn(
                  card,
                  "flex items-start gap-3 px-3.5 py-3 text-inherit no-underline hover:border-ink-faint",
                  !a.read && "border-tag-red shadow-[inset_4px_0_0_var(--color-tag-red)]",
                )}
              >
                {a.actor ? (
                  <Avatar name={a.actor.name} tone={a.actor.tone} size={40} />
                ) : (
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full",
                      GOOD_NEWS.has(a.type) ? "bg-mint text-forest" : "bg-fridge text-ink-soft",
                    )}
                  >
                    <Icon name={ICONS[a.type]} size={20} />
                  </span>
                )}
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-semibold">{a.title}</span>
                  {a.body ? <span className="wrap-anywhere text-ink-soft">{a.body}</span> : null}
                  <span className="text-sm text-ink-faint">{timeAgo(a.createdAt)}</span>
                </span>
                {a.read ? null : <span className="sr-only">New</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {cursor ? (
        <button type="button" className={button({ variant: "quiet" })} onClick={more} disabled={isFetching} aria-busy={isFetching || undefined}>
          Show older
        </button>
      ) : null}
    </div>
  );
}
