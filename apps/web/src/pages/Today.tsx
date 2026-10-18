import { useEffect } from "react";
import type React from "react";
import { Link, useNavigate } from "react-router";
import { problemMessage, useGetJokeQuery, useGetTodayQuery, useListCreatorsQuery, useSubscribeMutation, useUnsubscribeMutation } from "../api/rtk/index.ts";
import type { Creator, DeliveryCard, Today as TodayData } from "../api/rtk/index.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { DotBadge } from "@/components/ui/badge.tsx";
import { button, iconButton } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { field } from "@/components/ui/input.tsx";
import { skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { TONE } from "@/lib/tones.ts";
import { cn } from "@/lib/utils.ts";
import { NameTag } from "../components/NameTag.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { formatHour, useTimeLeft } from "../components/useCountdown.ts";
import { longDate, weekdayShort } from "../data/dates.ts";
import { faceOf } from "../data/face.ts";
import { REACTIONS, compact, groanScore } from "../data/reactions.ts";
import { useStore } from "../state/useStore.ts";

const nameLine = "leading-[1.25] font-semibold";
const subLine = "text-sm text-ink-soft";

/** A dashed box for "no joke right now" states. */
function TodayEmpty({ title, children, role }: { title: string; children: React.ReactNode; role?: "alert" }) {
  return (
    <div className="grid gap-1.5 rounded-2xl border border-dashed border-line-strong px-6 py-8" role={role}>
      <p className="text-xl font-semibold">{title}</p>
      {children}
    </div>
  );
}

export function Today() {
  const { account, hasRole, setRole, unread } = useStore();
  // Changing the delivery time invalidates "Today" (endpoints.ts), so a joke that's now due shows up.
  // Coming back to the tab also refetches: the joke may have landed while it was in the background.
  const { data, isError, refetch } = useGetTodayQuery(undefined, { refetchOnFocus: true });
  const today = data ?? null;
  const failed = isError && !data;

  // Come back to the joke when its hour arrives, without a reload.
  useEffect(() => {
    if (!today) return;
    const wait = Date.parse(today.nextDeliveryAt) - Date.now();
    if (wait <= 0 || wait > 24 * 3_600_000) return;
    const t = window.setTimeout(() => void refetch(), wait + 2_000);
    return () => window.clearTimeout(t);
  }, [today, refetch]);

  const reload = () => void refetch();
  const reader = hasRole("reader");

  return (
    <div className="mx-auto max-w-wide px-4 lg:px-8">
      <header className="flex items-center justify-between pt-3.5 pb-1.5 lg:hidden">
        <NameTag name="Daddy Jokes" size="s" />
        <Link
          to="/activity"
          className={iconButton("ink", "relative")}
          aria-label={unread ? `Activity, ${unread} new` : "Activity"}
        >
          <Icon name="bell" />
          {unread ? <DotBadge /> : null}
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10 lg:pt-9">
        <section className="grid min-w-0 gap-4.5" aria-labelledby="today-title" aria-busy={!today && !failed}>
          <p className="mt-2 origin-left -rotate-[1.5deg] font-marker text-xl text-tag-red">Hi {account?.name?.split(" ")[0] ?? "there"}, I'm Dad.</p>
          <h1 id="today-title" className="-mt-2.5 text-3xl">
            {today ? longDate(today.date) : "\u00a0"}
          </h1>

          {reader ? null : (
            <div className="flex items-center gap-3 rounded-2xl border border-cream-edge bg-cream px-4 py-3.5">
              <p className="flex-1 text-sm">
                <strong>You're not getting the daily joke.</strong> Turn it on to get one at your chosen
                time.
              </p>
              <button
                type="button"
                className={button({ size: "sm" })}
                onClick={() => {
                  void setRole("reader", true)
                    .then(() => {
                      toast.success("Daily jokes are on.");
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
            <TodayEmpty role="alert" title="Couldn't load today's joke.">
              <button
                type="button"
                className={button({ variant: "quiet", size: "sm" })}
                onClick={reload}
              >
                Try again
              </button>
            </TodayEmpty>
          ) : today ? (
            <>
              <WeekRail today={today} />
              {today.current?.state === "sealed" ? (
                <SealedJoke card={today.current} />
              ) : today.current?.state === "opened" && today.current.jokeId ? (
                <OpenedJoke jokeId={today.current.jokeId} />
              ) : today.current?.state === "missed" ? (
                <TodayEmpty title="Today's joke disappeared before you opened it.">
                  <p>Tomorrow's arrives at {formatHour(today.deliveryHour)}. Open it within a day to keep it.</p>
                </TodayEmpty>
              ) : reader ? (
                today.week.find((d) => d.date === today.date)?.state === "upcoming" ? (
                  <TodayEmpty title="Today's joke is still in the oven.">
                    <p>It lands at {formatHour(today.deliveryHour)}.</p>
                  </TodayEmpty>
                ) : (
                  <TodayEmpty title="No joke for you today.">
                    <p>The curators didn't pick one for today. Back tomorrow at {formatHour(today.deliveryHour)}.</p>
                  </TodayEmpty>
                )
              ) : null}
              {reader ? <NextDelivery today={today} /> : null}
            </>
          ) : (
            <div className={cn(skeleton, "min-h-80")} />
          )}
        </section>

        <aside className="grid content-start gap-4 lg:sticky lg:top-9" aria-label="More">
          {today && reader ? <StreakCard today={today} /> : null}
          <CreatorsCard />
        </aside>
      </div>
    </div>
  );
}

function WeekRail({ today }: { today: TodayData }) {
  const navigate = useNavigate();

  return (
    <ol className="m-0 grid list-none grid-cols-[repeat(7,minmax(44px,1fr))] gap-1 p-0 pt-0.5 pb-1" aria-label="This week">
      {today.week.map((day) => {
        const isToday = day.date === today.date;
        // Rings: red and glowing when new, solid grey once seen, dashed when missed, dotted ahead.
        const ring = {
          sealed: "border-tag-red shadow-[0_0_0_3px_rgb(226_59_59/0.18)] max-xs:border-3",
          opened: "",
          missed: "border-dashed",
          none: "border-dashed",
          upcoming: "border-dotted bg-transparent",
        }[day.state];
        const label = weekdayShort(day.date);
        const fullDay = new Date(`${day.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long" });

        const onClick = () => {
          if (day.state === "sealed") void navigate(`/view/${day.date}`);
          else if (day.state === "opened" && day.jokeId) void navigate(`/joke/${day.jokeId}`);
          else if (day.state === "missed") toast.info(`${fullDay}'s joke disappeared before you opened it.`);
          else if (day.state === "none") toast.info(`No joke for you on ${fullDay}.`);
          else toast.info(`${fullDay}'s joke arrives at ${formatHour(today.deliveryHour)}.`);
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
              className="flex w-full flex-col items-center gap-1.5 rounded-2xl border-0 bg-transparent py-1"
              onClick={onClick}
              aria-label={`${label}, ${description}`}
            >
              <span
                className={cn(
                  "grid size-13.5 place-items-center rounded-full border-3 border-line-strong bg-paper p-0.5 text-ink-faint",
                  "max-xs:size-11 max-xs:border-2 max-xs:p-px max-xs:[--avatar-size:36px]",
                  ring,
                )}
              >
                {day.state === "missed" ? (
                  <Icon name="lock" size={18} />
                ) : day.creator ? (
                  <Avatar name={day.creator.name} tone={day.creator.tone} size={44} />
                ) : (
                  <span className="text-base font-semibold">{Number(day.date.slice(8))}</span>
                )}
              </span>
              <span className={cn("text-xs font-medium", isToday ? "text-ink" : "text-ink-faint")}>{isToday ? "Today" : label}</span>
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
  const bg = card.kind === "text" ? card.background : "navy";

  return (
    <div className={cn("grid min-h-[340px] content-between justify-items-start gap-5.5 rounded-3xl px-6 pt-7 pb-6", TONE[bg])}>
      <NameTag name={first} size="l" tilt={-5} />
      <div className="grid max-w-[28ch] gap-2">
        <h2 className="text-2xl">{first} picked today's joke for you.</h2>
        <p className="opacity-90">You can open it once. It disappears in {left}.</p>
      </div>
      <Link
        to={`/view/${card.date}`}
        className={button({
          variant: bg === "yellow" ? "dark" : "light",
          className: "min-h-13 justify-self-stretch px-6 text-xl sm:justify-self-start",
        })}
      >
        Open today's joke
      </Link>
    </div>
  );
}

function OpenedJoke({ jokeId }: { jokeId: string }) {
  const { data: joke } = useGetJokeQuery({ id: jokeId });

  if (!joke) return <div className={cn(skeleton, "min-h-80")} aria-busy="true" />;
  const counts = joke.stats.reactions;
  const mineMeta = REACTIONS.find((r) => r.kind === joke.myReaction);

  return (
    <article className="grid gap-4.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
      <Link to={`/joke/${joke.id}`} className="block rounded-3xl no-underline" aria-label="See reactions and comments">
        <StoryCard face={faceOf(joke)} revealed variant="inline" animate={false} />
      </Link>
      <div className="grid gap-3.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={joke.creator.name} tone={joke.creator.tone} size={36} />
          <div>
            <p className={nameLine}>{joke.creator.name}</p>
            <p className={subLine}>@{joke.creator.handle}</p>
          </div>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-x-4.5 gap-y-1.5 p-0 text-ink-soft">
          <li>
            <strong className="text-ink">{groanScore(counts)}</strong> groan score
          </li>
          <li>
            <strong className="text-ink">{compact(joke.stats.views)}</strong> views
          </li>
          <li>
            <strong className="text-ink">{joke.stats.comments}</strong> comments
          </li>
        </ul>
        <p className="font-medium">
          {mineMeta ? `You reacted ${mineMeta.emoji} ${mineMeta.label}` : "You haven't reacted yet."}
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Link to={`/joke/${joke.id}`} className={button()}>
            <Icon name="comment" size={20} />
            Reactions and comments
          </Link>
          <Link to={`/view/${joke.id}`} className={button({ variant: "quiet" })}>
            <Icon name="replay" size={20} />
            Replay
          </Link>
        </div>
      </div>
    </article>
  );
}

function NextDelivery({ today }: { today: TodayData }) {
  const { setDeliveryHour } = useStore();
  const left = useTimeLeft(today.nextDeliveryAt);
  return (
    <Card className="flex items-center gap-3 px-4 py-3.5 text-ink-soft">
      <Icon name="clock" />
      <p className="flex-1">
        Your next joke arrives at <strong className="text-ink">{formatHour(today.deliveryHour)}</strong>, in {left}.
      </p>
      <label>
        <span className="sr-only">Delivery time</span>
        <select
          className={field("pill")}
          value={today.deliveryHour}
          onChange={(e) => {
            const h = Number(e.target.value);
            setDeliveryHour(h);
            toast.success(`Delivery time set to ${formatHour(h)}`);
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
    </Card>
  );
}

function StreakCard({ today }: { today: TodayData }) {
  const opened = today.current?.state === "opened";
  const sealed = today.current?.state === "sealed";
  return (
    <Card as="section" className="flex items-center gap-3.5 p-4.5">
      <p className="font-marker text-4xl leading-none text-tag-red">{today.streak}</p>
      <div>
        <h2 className="text-base">day streak</h2>
        <p className={subLine}>
          {opened
            ? "Back tomorrow to keep it going."
            : sealed
              ? `Open today's joke to make it ${today.streak + 1}.`
              : "Open each day's joke to build a streak."}
        </p>
      </div>
    </Card>
  );
}

function CreatorsCard() {
  const { data } = useListCreatorsQuery({ limit: 4 });
  const writers = data?.data ?? null;
  const [subscribe] = useSubscribeMutation();
  const [unsubscribe] = useUnsubscribeMutation();

  // Optimistic: the button flips at once and rolls back if the call fails (endpoints.ts).
  const toggle = async (c: Creator) => {
    const first = c.name.split(" ")[0];
    const on = c.isSubscribed;
    try {
      await (on ? unsubscribe({ creatorId: c.id }) : subscribe({ creatorId: c.id })).unwrap();
      toast.success(on ? `Unsubscribed from ${first}` : `Subscribed to ${first}`);
    } catch (e) {
      toast.error(problemMessage(e, "Couldn't update your subscription. Try again."));
    }
  };

  if (writers !== null && !writers.length) return null;
  return (
    <Card as="section" className="p-4.5">
      <h2 className="text-base">Most groaned at this month</h2>
      <ul className="m-0 mt-3 grid list-none gap-3 p-0" aria-busy={writers === null}>
        {(writers ?? []).map((c) => (
          <li key={c.id} className="flex items-center gap-2.5">
            <Avatar name={c.name} tone={c.tone} size={36} />
            <div className="min-w-0 flex-1">
              <p className={cn(nameLine, "truncate")}>{c.name}</p>
              <p className={subLine}>
                {compact(c.subscriberCount)} {c.subscriberCount === 1 ? "subscriber" : "subscribers"}
              </p>
            </div>
            <button
              type="button"
              className={button({ variant: "quiet", size: "sm" })}
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
    </Card>
  );
}
