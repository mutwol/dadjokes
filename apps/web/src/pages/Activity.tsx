import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, errorMessage, unwrap } from "../api/client.ts";
import type { Activity as ActivityItem } from "../api/client.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import type { IconName } from "../components/Icon.tsx";
import { timeAgo } from "../data/dates.ts";
import { useStore } from "../state/useStore.ts";
import "./Activity.css";

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
    <div className="activity">
      <header className="activity-head">
        <h1>Activity</h1>
      </header>
      {items !== null && !items.length ? (
        <div className="activity-empty">
          <Icon name="bell" size={28} />
          <p>Nothing yet. Comments on your jokes, new subscribers and tips will show up here.</p>
        </div>
      ) : (
        <ul className="activity-list" aria-busy={items === null}>
          {(items ?? []).map((a) => (
            <li key={a.id} className={a.read ? "act" : "act is-new"}>
              <Link to={a.url} className="act-link">
                {a.actor ? (
                  <Avatar name={a.actor.name} tone={a.actor.tone} size={40} />
                ) : (
                  <span className={`act-icon act-${a.type}`}>
                    <Icon name={ICONS[a.type]} size={20} />
                  </span>
                )}
                <span className="act-text">
                  <span className="act-title">{a.title}</span>
                  {a.body ? <span className="act-body">{a.body}</span> : null}
                  <span className="act-time">{timeAgo(a.createdAt)}</span>
                </span>
                {a.read ? null : <span className="visually-hidden">New</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {cursor ? (
        <button type="button" className="btn btn-quiet" onClick={() => void more()}>
          Show older
        </button>
      ) : null}
    </div>
  );
}
