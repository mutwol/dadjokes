import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, unwrap } from "../api/client.ts";
import type { Creator, DeliveryCard, Joke, Today as TodayData } from "../api/client.ts";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { NameTag } from "../components/NameTag.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { formatHour, useTimeLeft } from "../components/useCountdown.ts";
import { longDate, weekdayShort } from "../data/dates.ts";
import { faceOf } from "../data/face.ts";
import { REACTIONS, compact, groanScore } from "../data/reactions.ts";
import { useStore } from "../state/useStore.ts";
import "./Today.css";

export function Today() {
  const { account, hasRole, setRole, showToast } = useStore();
  const [today, setToday] = useState<TodayData | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const deliveryHour = account?.preferences.deliveryHour;

  useEffect(() => {
    let cancelled = false;
    api.GET("/v1/me/today").then(unwrap).then(
      (t) => {
        if (cancelled) return;
        setToday(t);
        setFailed(false);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
    // A new delivery time can mean today's joke is due now.
  }, [version, deliveryHour]);

  // Come back to the joke when its hour arrives, without a reload.
  useEffect(() => {
    if (!today) return;
    const wait = Date.parse(today.nextDeliveryAt) - Date.now();
    if (wait <= 0 || wait > 24 * 3_600_000) return;
    const t = window.setTimeout(() => setVersion((v) => v + 1), wait + 2_000);
    return () => window.clearTimeout(t);
  }, [today]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const reader = hasRole("reader");

  return (
    <div className="today">
      <header className="today-top">
        <NameTag name="Daddy Jokes" size="s" />
        <Link to="/activity" className="icon-btn" aria-label="Activity">
          <Icon name="bell" />
        </Link>
      </header>

      <div className="today-grid">
        <section className="today-main" aria-labelledby="today-title" aria-busy={!today && !failed}>
          <p className="today-hi">Hi {account?.name?.split(" ")[0] ?? "there"}, I'm Dad.</p>
          <h1 id="today-title" className="today-title">
            {today ? longDate(today.date) : "\u00a0"}
          </h1>

          {reader ? null : (
            <div className="today-banner">
              <p>
                <strong>You're not getting the daily joke.</strong> Turn it on to get one at your chosen
                time.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => {
                  void setRole("reader", true)
                    .then(() => {
                      showToast("Daily jokes are on.");
                      reload();
                    })
                    .catch(() => undefined);
                }}
              >
                Turn on
              </button>
            </div>
          )}

          {failed ? (
            <div className="today-empty" role="alert">
              <p>Couldn't load today's joke.</p>
              <button type="button" className="btn btn-quiet btn-small" onClick={reload}>
                Try again
              </button>
            </div>
          ) : today ? (
            <>
              <WeekRail today={today} />
              {today.current?.state === "sealed" ? (
                <SealedJoke card={today.current} />
              ) : today.current?.state === "opened" && today.current.jokeId ? (
                <OpenedJoke jokeId={today.current.jokeId} />
              ) : today.current?.state === "missed" ? (
                <div className="today-empty">
                  <p>Today's joke disappeared before you opened it.</p>
                  <p>Tomorrow's arrives at {formatHour(today.deliveryHour)}. Open it within a day to keep it.</p>
                </div>
              ) : reader ? (
                <div className="today-empty">
                  {today.week.find((d) => d.date === today.date)?.state === "upcoming" ? (
                    <>
                      <p>Today's joke is still in the oven.</p>
                      <p>It lands at {formatHour(today.deliveryHour)}.</p>
                    </>
                  ) : (
                    <>
                      <p>No joke for you today.</p>
                      <p>The curators didn't pick one for today. Back tomorrow at {formatHour(today.deliveryHour)}.</p>
                    </>
                  )}
                </div>
              ) : null}
              {reader ? <NextDelivery today={today} /> : null}
            </>
          ) : (
            <div className="today-skeleton" />
          )}
        </section>

        <aside className="today-aside" aria-label="More">
          {today && reader ? <StreakCard today={today} /> : null}
          <CreatorsCard />
        </aside>
      </div>
    </div>
  );
}

function WeekRail({ today }: { today: TodayData }) {
  const { showToast } = useStore();
  const navigate = useNavigate();

  return (
    <ol className="week" aria-label="This week">
      {today.week.map((day) => {
        const isToday = day.date === today.date;
        // The styles know new (sealed), seen (opened), missed and future.
        const look = { sealed: "new", opened: "seen", missed: "missed", upcoming: "future", none: "missed" }[day.state];
        const label = weekdayShort(day.date);
        const fullDay = new Date(`${day.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long" });

        const onClick = () => {
          if (day.state === "sealed") void navigate(`/view/${day.date}`);
          else if (day.state === "opened" && day.jokeId) void navigate(`/joke/${day.jokeId}`);
          else if (day.state === "missed") showToast(`${fullDay}'s joke disappeared before you opened it.`);
          else if (day.state === "none") showToast(`No joke for you on ${fullDay}.`);
          else showToast(`${fullDay}'s joke arrives at ${formatHour(today.deliveryHour)}.`);
        };

        const description = {
          sealed: "new joke, tap to open",
          opened: "opened",
          missed: "missed",
          none: "no joke",
          upcoming: "not delivered yet",
        }[day.state];

        return (
          <li key={day.date}>
            <button
              type="button"
              className={`week-day is-${look}${isToday ? " is-today" : ""}`}
              onClick={onClick}
              aria-label={`${label}, ${description}`}
            >
              <span className="week-ring">
                {day.state === "missed" ? (
                  <Icon name="lock" size={18} />
                ) : day.creator ? (
                  <Avatar name={day.creator.name} tone={day.creator.tone} size={44} />
                ) : (
                  <span className="week-num">{Number(day.date.slice(8))}</span>
                )}
              </span>
              <span className="week-label">{isToday ? "Today" : label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function SealedJoke({ card }: { card: DeliveryCard }) {
  const left = useTimeLeft(card.expiresAt);
  const first = card.creator.name.split(" ")[0];

  return (
    <div className={`sealed story-bg-${card.kind === "text" ? card.background : "navy"}`}>
      <NameTag name={first} size="l" tilt={-5} />
      <div className="sealed-copy">
        <h2>{first} picked today's joke for you.</h2>
        <p>You can open it once. It disappears in {left}.</p>
      </div>
      <Link to={`/view/${card.date}`} className="btn sealed-open">
        Open today's joke
      </Link>
    </div>
  );
}

function OpenedJoke({ jokeId }: { jokeId: string }) {
  const [joke, setJoke] = useState<Joke | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .GET("/v1/jokes/{id}", { params: { path: { id: jokeId } } })
      .then(unwrap)
      .then((j) => {
        if (!cancelled) setJoke(j);
      }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [jokeId]);

  if (!joke) return <div className="today-skeleton" aria-busy="true" />;
  const counts = joke.stats.reactions;
  const mineMeta = REACTIONS.find((r) => r.kind === joke.myReaction);

  return (
    <article className="opened">
      <Link to={`/joke/${joke.id}`} className="opened-card" aria-label="See reactions and comments">
        <StoryCard face={faceOf(joke)} revealed variant="inline" animate={false} />
      </Link>
      <div className="opened-meta">
        <div className="byline">
          <Avatar name={joke.creator.name} tone={joke.creator.tone} size={36} />
          <div>
            <p className="byline-name">{joke.creator.name}</p>
            <p className="byline-sub">@{joke.creator.handle}</p>
          </div>
        </div>
        <ul className="opened-stats">
          <li>
            <strong>{groanScore(counts)}</strong> groan score
          </li>
          <li>
            <strong>{compact(joke.stats.views)}</strong> views
          </li>
          <li>
            <strong>{joke.stats.comments}</strong> comments
          </li>
        </ul>
        <p className="opened-mine">
          {mineMeta ? `You reacted ${mineMeta.emoji} ${mineMeta.label}` : "You haven't reacted yet."}
        </p>
        <div className="opened-actions">
          <Link to={`/joke/${joke.id}`} className="btn btn-primary">
            <Icon name="comment" size={20} />
            Reactions and comments
          </Link>
          <Link to={`/view/${joke.id}`} className="btn btn-quiet">
            <Icon name="replay" size={20} />
            Replay
          </Link>
        </div>
      </div>
    </article>
  );
}

function NextDelivery({ today }: { today: TodayData }) {
  const { setDeliveryHour, showToast } = useStore();
  const left = useTimeLeft(today.nextDeliveryAt);
  return (
    <div className="next">
      <Icon name="clock" />
      <p>
        Your next joke arrives at <strong>{formatHour(today.deliveryHour)}</strong>, in {left}.
      </p>
      <label className="next-select">
        <span className="visually-hidden">Delivery time</span>
        <select
          value={today.deliveryHour}
          onChange={(e) => {
            const h = Number(e.target.value);
            setDeliveryHour(h);
            showToast(`Delivery time set to ${formatHour(h)}`);
          }}
        >
          {[...new Set([6, 7, 8, 9, 12, 17, 20, today.deliveryHour])]
            .sort((a, b) => a - b)
            .map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}

function StreakCard({ today }: { today: TodayData }) {
  const opened = today.current?.state === "opened";
  const sealed = today.current?.state === "sealed";
  return (
    <section className="panel streak">
      <p className="streak-num">{today.streak}</p>
      <div>
        <h2 className="panel-title">day streak</h2>
        <p className="panel-sub">
          {opened
            ? "Back tomorrow to keep it going."
            : sealed
              ? `Open today's joke to make it ${today.streak + 1}.`
              : "Open each day's joke to build a streak."}
        </p>
      </div>
    </section>
  );
}

function CreatorsCard() {
  const { showToast } = useStore();
  const [writers, setWriters] = useState<Creator[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.GET("/v1/creators", { params: { query: { limit: 4 } } }).then(({ data }) => {
      if (!cancelled) setWriters(data?.data ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (c: Creator) => {
    const first = c.name.split(" ")[0];
    const on = c.isSubscribed;
    // Optimistic update, rolled back if the API call fails.
    const flip = (subscribed: boolean) =>
      setWriters((ws) =>
        ws?.map((w) =>
          w.id === c.id
            ? { ...w, isSubscribed: subscribed, subscriberCount: w.subscriberCount + (subscribed ? 1 : -1) }
            : w,
        ) ?? null,
      );
    flip(!on);
    const params = { path: { creatorId: c.id } };
    const { response } = on
      ? await api.DELETE("/v1/me/subscriptions/{creatorId}", { params })
      : await api.PUT("/v1/me/subscriptions/{creatorId}", { params });
    if (response.ok) showToast(on ? `Unsubscribed from ${first}` : `Subscribed to ${first}`);
    else {
      flip(on);
      showToast("Couldn't update your subscription. Try again.");
    }
  };

  if (writers !== null && !writers.length) return null;
  return (
    <section className="panel">
      <h2 className="panel-title">Most groaned at this month</h2>
      <ul className="creator-list" aria-busy={writers === null}>
        {(writers ?? []).map((c) => (
          <li key={c.id}>
            <Avatar name={c.name} tone={c.tone} size={36} />
            <div className="creator-list-text">
              <p className="byline-name">{c.name}</p>
              <p className="byline-sub">
                {compact(c.subscriberCount)} {c.subscriberCount === 1 ? "subscriber" : "subscribers"}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-quiet btn-small"
              aria-pressed={c.isSubscribed}
              aria-label={`${c.isSubscribed ? "Unsubscribe from" : "Subscribe to"} ${c.name}`}
              onClick={() => void toggle(c)}
            >
              {c.isSubscribed ? <Icon name="check" size={16} /> : null}
              {c.isSubscribed ? "Subscribed" : "Subscribe"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
