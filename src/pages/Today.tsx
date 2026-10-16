import { Link, useNavigate } from "react-router";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { NameTag } from "../components/NameTag.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { formatHour, useCountdown } from "../components/useCountdown.ts";
import {
  ME,
  TODAY,
  creatorById,
  creators,
  jokeForDay,
  longDate,
  weekOf,
  weekdayShort,
} from "../data/mock.ts";
import { REACTIONS, compact, groanScore } from "../data/reactions.ts";
import type { Joke } from "../data/types.ts";
import { useStore } from "../state/useStore.ts";
import "./Today.css";

export function Today() {
  const { seen, profile, hasRole, addRole, showToast } = useStore();
  const joke = jokeForDay(TODAY);
  const opened = seen.has(TODAY);

  return (
    <div className="today">
      <header className="today-top">
        <NameTag name="Daddy Jokes" size="s" />
        <Link to="/activity" className="icon-btn" aria-label="Activity">
          <Icon name="bell" />
        </Link>
      </header>

      <div className="today-grid">
        <section className="today-main" aria-labelledby="today-title">
          <p className="today-hi">Hi {profile?.name.split(" ")[0] ?? "there"}, I'm Dad.</p>
          <h1 id="today-title" className="today-title">
            {longDate(TODAY)}
          </h1>

          {hasRole("reader") ? null : (
            <div className="today-banner">
              <p>
                <strong>You're not getting the daily joke.</strong> Turn it on to get one at your chosen
                time.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => {
                  addRole("reader");
                  showToast("Daily jokes are on.");
                }}
              >
                Turn on
              </button>
            </div>
          )}

          <WeekRail />

          {joke ? (
            opened ? (
              <OpenedJoke joke={joke} />
            ) : (
              <SealedJoke joke={joke} />
            )
          ) : (
            <div className="today-empty">
              <p>Today's joke is still in the oven.</p>
              <p>It lands at your delivery time. We'll send you a notification.</p>
            </div>
          )}

          <NextDelivery />
        </section>

        <aside className="today-aside" aria-label="More">
          <StreakCard />
          <CreatorsCard />
        </aside>
      </div>
    </div>
  );
}

function WeekRail() {
  const { seen, showToast, deliveryHour } = useStore();
  const navigate = useNavigate();
  const days = weekOf(TODAY);

  return (
    <ol className="week" aria-label="This week">
      {days.map((day) => {
        const joke = jokeForDay(day);
        const isToday = day === TODAY;
        const isFuture = day > TODAY;
        const wasSeen = seen.has(day);
        const state = isFuture
          ? "future"
          : isToday
            ? wasSeen
              ? "seen"
              : "new"
            : wasSeen
              ? "seen"
              : "missed";
        const creator = joke ? creatorById(joke.creatorId) : undefined;
        const label = weekdayShort(day);

        const onClick = () => {
          if (state === "new") void navigate(`/view/${joke?.id}`);
          else if (state === "seen" && joke) void navigate(`/joke/${joke.id}`);
          else if (state === "missed")
            showToast("Missed jokes stay in the archive with Daddy Jokes Plus.");
          else
            showToast(
              `${new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long" })}'s joke arrives at ${formatHour(deliveryHour)}.`,
            );
        };

        const description = {
          new: "new joke, tap to open",
          seen: "opened",
          missed: "missed",
          future: "not delivered yet",
        }[state];

        return (
          <li key={day}>
            <button
              type="button"
              className={`week-day is-${state}${isToday ? " is-today" : ""}`}
              onClick={onClick}
              aria-label={`${label}, ${description}`}
            >
              <span className="week-ring">
                {state === "missed" ? (
                  <Icon name="lock" size={18} />
                ) : state === "future" ? (
                  <span className="week-num">{Number(day.slice(8))}</span>
                ) : creator ? (
                  <Avatar name={creator.name} tone={creator.tone} size={44} />
                ) : null}
              </span>
              <span className="week-label">{isToday ? "Today" : label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function SealedJoke({ joke }: { joke: Joke }) {
  const { deliveryHour } = useStore();
  const left = useCountdown(deliveryHour);
  const creator = creatorById(joke.creatorId);
  const bg = joke.kind === "text" ? joke.background : "navy";

  return (
    <div className={`sealed story-bg-${bg}`}>
      <NameTag name={creator.name.split(" ")[0]} size="l" tilt={-5} />
      <div className="sealed-copy">
        <h2>{creator.name.split(" ")[0]} picked today's joke for you.</h2>
        <p>You can open it once. It disappears in {left}.</p>
      </div>
      <Link to={`/view/${joke.id}`} className="btn sealed-open">
        Open today's joke
      </Link>
    </div>
  );
}

function OpenedJoke({ joke }: { joke: Joke }) {
  const { reactionsFor, commentsFor, myReaction } = useStore();
  const creator = creatorById(joke.creatorId);
  const counts = reactionsFor(joke);
  const mine = myReaction(joke.id);
  const mineMeta = REACTIONS.find((r) => r.kind === mine);

  return (
    <article className="opened">
      <Link to={`/joke/${joke.id}`} className="opened-card" aria-label="See reactions and comments">
        <StoryCard face={joke} revealed variant="inline" animate={false} />
      </Link>
      <div className="opened-meta">
        <div className="byline">
          <Avatar name={creator.name} tone={creator.tone} size={36} />
          <div>
            <p className="byline-name">{creator.name}</p>
            <p className="byline-sub">@{creator.handle}</p>
          </div>
        </div>
        <ul className="opened-stats">
          <li>
            <strong>{groanScore(counts)}</strong> groan score
          </li>
          <li>
            <strong>{compact(joke.views)}</strong> views
          </li>
          <li>
            <strong>{commentsFor(joke).length}</strong> comments
          </li>
        </ul>
        <p className="opened-mine">
          {mineMeta
            ? `You reacted ${mineMeta.emoji} ${mineMeta.label}`
            : "You haven't reacted yet."}
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

function NextDelivery() {
  const { deliveryHour, setDeliveryHour, showToast } = useStore();
  const left = useCountdown(deliveryHour);
  return (
    <div className="next">
      <Icon name="clock" />
      <p>
        Your next joke arrives at <strong>{formatHour(deliveryHour)}</strong>, in {left}.
      </p>
      <label className="next-select">
        <span className="visually-hidden">Delivery time</span>
        <select
          value={deliveryHour}
          onChange={(e) => {
            const h = Number(e.target.value);
            setDeliveryHour(h);
            showToast(`Delivery time set to ${formatHour(h)}`);
          }}
        >
          {[6, 7, 8, 9, 12, 17, 20].map((h) => (
            <option key={h} value={h}>
              {formatHour(h)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function StreakCard() {
  const { seen } = useStore();
  const streak = ME.streak + (seen.has(TODAY) ? 1 : 0);
  return (
    <section className="panel streak">
      <p className="streak-num">{streak}</p>
      <div>
        <h2 className="panel-title">day streak</h2>
        <p className="panel-sub">
          {seen.has(TODAY)
            ? "Back tomorrow to keep it going."
            : "Open today's joke to make it " + (streak + 1) + "."}
        </p>
      </div>
    </section>
  );
}

function CreatorsCard() {
  const { showToast, profile, updateProfile } = useStore();
  const following = profile?.following ?? [];
  const toggle = (id: string, name: string) => {
    const on = following.includes(id);
    updateProfile({ following: on ? following.filter((x) => x !== id) : [...following, id] });
    showToast(on ? `Unsubscribed from ${name}` : `Subscribed to ${name}`);
  };
  return (
    <section className="panel">
      <h2 className="panel-title">Most groaned at this month</h2>
      <ul className="creator-list">
        {[...creators]
          .sort((a, b) => b.subscribers - a.subscribers)
          .slice(0, 4)
          .map((c) => {
            const on = following.includes(c.id);
            const first = c.name.split(" ")[0];
            return (
              <li key={c.id}>
                <Avatar name={c.name} tone={c.tone} size={36} />
                <div className="creator-list-text">
                  <p className="byline-name">{c.name}</p>
                  <p className="byline-sub">{compact(c.subscribers)} subscribers</p>
                </div>
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  aria-pressed={on}
                  aria-label={`${on ? "Unsubscribe from" : "Subscribe to"} ${c.name}`}
                  onClick={() => toggle(c.id, first)}
                >
                  {on ? <Icon name="check" size={16} /> : null}
                  {on ? "Subscribed" : "Subscribe"}
                </button>
              </li>
            );
          })}
      </ul>
    </section>
  );
}
