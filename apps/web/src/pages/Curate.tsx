import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type React from "react";
import { ApiError, api, errorMessage, unwrap } from "../api/client.ts";
import type { CurationCalendar, QueueItem, ReportedItem } from "../api/client.ts";
import { Avatar } from "../components/Avatar.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { faceOf } from "../data/face.ts";
import { longDate, shortDate, weekdayShort } from "../data/dates.ts";
import { useStore } from "../state/useStore.ts";
import { Card, EmptyState, Pill, button, cn, errorText, field, segment, segmented } from "../components/ui/index.ts";

const muted = "text-sm text-ink-soft";
const list = "m-0 grid list-none gap-3.5 p-0";
const small = button({ size: "sm" });
const smallQuiet = button({ variant: "quiet", size: "sm" });

/** A compact labelled control in a card's action row. */
function CardField({ label, grow, children }: { label: string; grow?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("grid gap-1 text-sm font-bold", grow && "flex-[1_1_200px]")}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** The row of form controls and buttons at the bottom of a queue card. */
const actionRow = "flex flex-wrap items-end gap-2.5 border-t border-line pt-3";

const DECLINE_REASONS: { value: QueueItem["joke"]["declineReason"] & string; label: string }[] = [
  { value: "possible_copy", label: "Looks copied" },
  { value: "not_a_dad_joke", label: "Not a dad joke" },
  { value: "offensive", label: "Offensive" },
  { value: "unclear", label: "Hard to follow" },
  { value: "other", label: "Something else" },
];

type Calendar = CurationCalendar["days"];

/** The first open day with no pick for this joke's region (or everywhere). */
function firstFreeDay(days: Calendar, region: string | null): string | undefined {
  return days.find((d) => !d.picks.some((p) => p.region === region))?.date;
}

export function Curate() {
  const [tab, setTab] = useState<"queue" | "reports">("queue");
  return (
    <div className="mx-auto grid max-w-content gap-5 px-4 pb-8">
      <header className="grid gap-1 pt-4.5">
        <h1 className="text-3xl">Curation</h1>
        <div className={cn(segmented, "mt-1.5 justify-self-start")} role="tablist" aria-label="Curation">
          {(["queue", "reports"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={segment(tab === t, "px-4.5")}
              onClick={() => setTab(t)}
            >
              {t === "queue" ? "Review queue" : "Reports"}
            </button>
          ))}
        </div>
      </header>
      {tab === "queue" ? <Queue /> : <Reports />}
    </div>
  );
}

const REASON_LABEL: Record<string, string> = {
  copied: "copied",
  offensive: "offensive",
  spam: "spam",
  other: "other",
};

function Reports() {
  const { showToast } = useStore();
  const [items, setItems] = useState<ReportedItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .GET("/v1/curation/reports")
      .then(unwrap)
      .then((r) => {
        if (!cancelled) setItems(r.data);
      }, () => showToast("Couldn't load reports."));
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const resolve = async (item: ReportedItem, action: "dismiss" | "remove") => {
    const target = item.commentId ? { commentId: item.commentId } : { jokeId: item.jokeId };
    const { response } = await api.POST("/v1/curation/reports/resolve", { body: { ...target, action } });
    if (!response.ok) return showToast("Couldn't resolve that. Try again.");
    setItems((prev) => prev?.filter((i) => i !== item) ?? null);
    showToast(action === "remove" ? `${item.target === "joke" ? "Joke" : "Comment"} taken down.` : "Left up. Reports closed.");
  };

  if (items !== null && !items.length) {
    return (
      <EmptyState>
        <p>No open reports. Everyone's behaving, or at least groaning politely.</p>
      </EmptyState>
    );
  }
  return (
    <ul className={list} aria-busy={items === null}>
      {(items ?? []).map((item) => (
        <Card as="li" key={`${item.jokeId}-${item.commentId ?? ""}`} className="grid gap-3 p-3.5">
          <p className={muted}>
            {item.target === "joke" ? "Joke" : "Comment"} by @{item.authorHandle} · {item.reports}{" "}
            {item.reports === 1 ? "report" : "reports"} since {shortDate(item.firstReportedAt.slice(0, 10))}
          </p>
          <p className="font-extrabold">“{item.preview}”</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(item.reasons).map(([reason, n]) => (
              <Pill key={reason} tone="muted" className="py-0.75">
                {REASON_LABEL[reason] ?? reason} × {n}
              </Pill>
            ))}
          </div>
          {item.notes.length ? (
            <ul className="m-0 pl-4.5 text-sm text-ink-soft">
              {item.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <button type="button" className={small} onClick={() => void resolve(item, "remove")}>
              Take it down
            </button>
            <button type="button" className={smallQuiet} onClick={() => void resolve(item, "dismiss")}>
              Leave it up
            </button>
          </div>
        </Card>
      ))}
    </ul>
  );
}

function Queue() {
  const { showToast } = useStore();
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<CurationCalendar | null>(null);
  const [version, setVersion] = useState(0);

  const refreshCalendar = useCallback(
    () => api.GET("/v1/curation/calendar", { params: { query: { days: 28 } } }).then(unwrap),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.GET("/v1/curation/queue", { params: { query: { limit: 20 } } }).then(unwrap),
      refreshCalendar(),
    ]).then(
      ([queue, cal]) => {
        if (cancelled) return;
        setItems(queue.data);
        setWaiting(queue.waiting);
        setNextCursor(queue.nextCursor);
        setCalendar(cal);
      },
      () => {
        if (!cancelled) showToast("Couldn't load the queue. Try again.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [refreshCalendar, showToast, version]);

  const done = (id: string, message: string) => {
    setItems((prev) => prev?.filter((i) => i.joke.id !== id) ?? null);
    setWaiting((w) => Math.max(0, w - 1));
    showToast(message);
    void refreshCalendar().then(setCalendar, () => undefined);
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    try {
      const page = unwrap(await api.GET("/v1/curation/queue", { params: { query: { limit: 20, cursor: nextCursor } } }));
      setItems((prev) => [...(prev ?? []), ...page.data]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  return (
    <>
      <p className={muted}>
        {items === null ? "Loading the queue…" : `${waiting} ${waiting === 1 ? "joke" : "jokes"} waiting for review`}
      </p>

      {calendar ? <CalendarStrip calendar={calendar} /> : null}

      {items !== null && !items.length ? (
        <EmptyState>
          <p>The queue is empty. Nothing to groan at for now.</p>
          <button type="button" className={smallQuiet} onClick={() => setVersion((v) => v + 1)}>
            Check again
          </button>
        </EmptyState>
      ) : (
        <ul className={list} aria-busy={items === null}>
          {(items ?? []).map((item) => (
            <QueueCard key={item.joke.id} item={item} calendar={calendar} onDone={done} />
          ))}
        </ul>
      )}
      {nextCursor ? (
        <button type="button" className={button({ variant: "quiet" })} onClick={() => void loadMore()}>
          Show more
        </button>
      ) : null}
    </>
  );
}

function CalendarStrip({ calendar }: { calendar: CurationCalendar }) {
  const empty = calendar.days.filter((d) => !d.picks.some((p) => p.region === null)).length;
  return (
    <section className="grid gap-2.5" aria-labelledby="cal-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="cal-title" className="text-xl">
          Coming up
        </h2>
        <p className={muted}>{empty ? `${empty} of the next ${calendar.days.length} days have no joke yet` : "Every day is covered"}</p>
      </div>
      <ol className="m-0 flex list-none gap-1.5 overflow-x-auto p-0 pb-1.5">
        {calendar.days.map((d) => {
          const everywhere = d.picks.find((p) => p.region === null);
          const regional = d.picks.filter((p) => p.region !== null);
          return (
            <li
              key={d.date}
              className={cn(
                "relative grid flex-[0_0_46px] justify-items-center gap-0.5 rounded-xl border-[1.5px] py-2",
                everywhere ? "border-solid border-denim bg-sky" : "border-dashed border-line bg-paper",
              )}
              title={d.picks.map((p) => `${p.region ?? "Everywhere"}: ${p.setup ?? ""} (${p.creatorName})`).join("\n")}
            >
              <span className="text-2xs font-bold text-ink-soft">{weekdayShort(d.date)}</span>
              <span className="font-extrabold">{Number(d.date.slice(8))}</span>
              <span className="sr-only">
                {everywhere ? "has a joke" : "no joke yet"}
                {regional.length ? `, plus ${regional.map((r) => r.region).join(", ")}` : ""}
              </span>
              {regional.length ? <span className="absolute -top-1.75 -right-1.25 rounded-full bg-tag-red px-1.25 py-px text-[0.65rem] font-extrabold text-white" aria-hidden="true">+{regional.length}</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function QueueCard({
  item,
  calendar,
  onDone,
}: {
  item: QueueItem;
  calendar: CurationCalendar | null;
  onDone: (id: string, message: string) => void;
}) {
  const { joke, possibleCopies } = item;
  const suggested = calendar ? firstFreeDay(calendar.days, joke.region) : undefined;
  const [day, setDay] = useState<string | undefined>(undefined);
  const [declining, setDeclining] = useState(possibleCopies.some((c) => c.similarity >= 0.8));
  const [reason, setReason] = useState(possibleCopies.length ? "possible_copy" : "not_a_dad_joke");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosenDay = day ?? suggested ?? "";

  const schedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!chosenDay) return;
    setBusy(true);
    setError("");
    try {
      unwrap(
        await api.POST("/v1/curation/jokes/{id}/schedule", {
          params: { path: { id: joke.id } },
          body: { deliverOn: chosenDay },
        }),
      );
      onDone(joke.id, `Scheduled for ${longDate(chosenDay)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.problem.title : errorMessage(err));
      setBusy(false);
    }
  };

  const decline = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      unwrap(
        await api.POST("/v1/curation/jokes/{id}/decline", {
          params: { path: { id: joke.id } },
          body: { reason: reason as (typeof DECLINE_REASONS)[number]["value"], note: note.trim() || undefined },
        }),
      );
      onDone(joke.id, "Declined. The writer will see why.");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const title = joke.setup ?? joke.caption ?? "Image joke";
  return (
    <Card as="li" className="grid gap-3 p-3.5" aria-label={title}>
      <div className="flex gap-3.5">
        <div className="w-21 shrink-0">
          <StoryCard face={faceOf(joke)} revealed animate={false} variant="thumb" />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <p className="font-extrabold">{joke.setup ?? joke.caption}</p>
          {joke.punchline ? <p className="font-semibold">{joke.punchline}</p> : null}
          <div className="flex items-center gap-2 text-sm font-bold">
            <Avatar name={joke.creator.name} tone={joke.creator.tone} size={28} />
            <span>
              {joke.creator.name} <span className={muted}>@{joke.creator.handle}</span>
            </span>
          </div>
          <p className={muted}>
            For {joke.region ?? "everywhere"}
            {joke.topics.length ? ` · ${joke.topics.join(", ")}` : ""} · sent {shortDate(joke.submittedAt.slice(0, 10))}
          </p>
        </div>
      </div>

      {possibleCopies.length ? (
        <div className="grid gap-1.5 rounded-xl bg-butter px-3 py-2.5 text-sm text-butter-ink-deep" role="note">
          <p className="font-extrabold">Possible copies</p>
          <ul className="m-0 grid gap-1 pl-4.5">
            {possibleCopies.map((c) => (
              <li key={c.id}>
                <strong>{Math.round(c.similarity * 100)}% alike:</strong> “{c.setup}” {c.punchline ? `“${c.punchline}”` : ""}{" "}
                <span className="text-butter-ink">
                  {c.sameWriter ? "by the same writer" : `by @${c.creatorHandle}`}, {c.status.replace("_", " ")}
                  {c.deliverOn ? ` ${shortDate(c.deliverOn)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {declining ? (
        <form className={actionRow} onSubmit={(e) => void decline(e)}>
          <CardField label="Reason">
            <select className={field("sm")} value={reason} onChange={(e) => setReason(e.target.value)}>
              {DECLINE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </CardField>
          <CardField label="Note for the writer (optional)" grow>
            <input
              className={field("sm")}
              value={note}
              maxLength={280}
              onChange={(e) => setNote(e.target.value)}
              autoComplete="off"
            />
          </CardField>
          <div className="flex gap-2">
            <button type="submit" className={small} disabled={busy}>
              Decline
            </button>
            <button type="button" className={smallQuiet} onClick={() => setDeclining(false)}>
              Schedule instead
            </button>
          </div>
        </form>
      ) : (
        <form className={actionRow} onSubmit={(e) => void schedule(e)}>
          <CardField label="Goes out on">
            <input
              className={field("sm")}
              type="date"
              value={chosenDay}
              min={calendar?.firstOpenDay}
              onChange={(e) => setDay(e.target.value)}
              required
            />
          </CardField>
          <div className="flex gap-2">
            <button type="submit" className={small} disabled={busy || !chosenDay}>
              Schedule
            </button>
            <button type="button" className={smallQuiet} onClick={() => setDeclining(true)}>
              Decline…
            </button>
          </div>
        </form>
      )}
      {error ? (
        <p className={errorText} role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
