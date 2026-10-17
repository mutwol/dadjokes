import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, errorMessage, unwrap } from "../api/client.ts";
import type { Activity as ActivityItem } from "../api/client.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import type { IconName } from "../components/Icon.tsx";
import { timeAgo } from "../data/dates.ts";
import { useStore } from "../state/useStore.ts";
import { EmptyState, button, card, cn } from "../components/ui/index.ts";

/** Good news (money in, a joke picked) gets a green icon. */
const GOOD_NEWS = new Set<ActivityItem["type"]>(["joke_scheduled", "tip_received", "payout_paid"]);

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
};

export function Activity() {
  const { clearUnread, showToast } = useStore();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .GET("/v1/me/activity", { params: { query: { limit: 30 } } })
      .then(unwrap)
      .then(
        (page) => {
          if (cancelled) return;
          setItems(page.data);
          setCursor(page.nextCursor);
          // Seen now: everything up to here counts as read (the list still shows what was new).
          if (page.unread) void api.POST("/v1/me/activity/read").then(clearUnread);
        },
        () => {
          if (!cancelled) setItems([]);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [clearUnread]);

  const more = async () => {
    if (!cursor) return;
    try {
      const page = unwrap(await api.GET("/v1/me/activity", { params: { query: { limit: 30, cursor } } }));
      setItems((prev) => [...(prev ?? []), ...page.data]);
      setCursor(page.nextCursor);
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

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
                  <span className="font-extrabold">{a.title}</span>
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
        <button type="button" className={button({ variant: "quiet" })} onClick={() => void more()}>
          Show older
        </button>
      ) : null}
    </div>
  );
}
