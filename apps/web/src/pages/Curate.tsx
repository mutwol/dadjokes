import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, api, errorMessage, unwrap } from "../api/client.ts";
import type { CurationCalendar, QueueItem, ReportedItem } from "../api/client.ts";
import { Avatar } from "../components/Avatar.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { faceOf } from "../data/face.ts";
import { longDate, shortDate, weekdayShort } from "../data/dates.ts";
import { useStore } from "../state/useStore.ts";
import "./Curate.css";

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
    <div className="curate">
      <header className="curate-head">
        <h1>Curation</h1>
        <div className="segmented curate-tabs" role="tablist" aria-label="Curation">
          {(["queue", "reports"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`segmented-opt${tab === t ? " is-on" : ""}`}
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
      <div className="curate-empty">
        <p>No open reports. Everyone's behaving, or at least groaning politely.</p>
      </div>
    );
  }
  return (
    <ul className="curate-list" aria-busy={items === null}>
      {(items ?? []).map((item) => (
        <li key={`${item.jokeId}-${item.commentId ?? ""}`} className="qcard">
          <p className="qcard-muted">
            {item.target === "joke" ? "Joke" : "Comment"} by @{item.authorHandle} · {item.reports}{" "}
            {item.reports === 1 ? "report" : "reports"} since {shortDate(item.firstReportedAt.slice(0, 10))}
          </p>
          <p className="qcard-setup">“{item.preview}”</p>
          <div className="report-reasons">
            {Object.entries(item.reasons).map(([reason, n]) => (
              <span key={reason} className="report-reason">
                {REASON_LABEL[reason] ?? reason} × {n}
              </span>
            ))}
          </div>
          {item.notes.length ? (
            <ul className="report-notes">
              {item.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          <div className="qcard-buttons">
            <button type="button" className="btn btn-primary btn-small" onClick={() => void resolve(item, "remove")}>
              Take it down
            </button>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => void resolve(item, "dismiss")}>
              Leave it up
            </button>
          </div>
        </li>
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
      <p className="curate-count">
        {items === null ? "Loading the queue…" : `${waiting} ${waiting === 1 ? "joke" : "jokes"} waiting for review`}
      </p>

      {calendar ? <CalendarStrip calendar={calendar} /> : null}

      {items !== null && !items.length ? (
        <div className="curate-empty">
          <p>The queue is empty. Nothing to groan at for now.</p>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setVersion((v) => v + 1)}>
            Check again
          </button>
        </div>
      ) : (
        <ul className="curate-list" aria-busy={items === null}>
          {(items ?? []).map((item) => (
            <QueueCard key={item.joke.id} item={item} calendar={calendar} onDone={done} />
          ))}
        </ul>
      )}
      {nextCursor ? (
        <button type="button" className="btn btn-quiet" onClick={() => void loadMore()}>
          Show more
        </button>
      ) : null}
    </>
  );
}

function CalendarStrip({ calendar }: { calendar: CurationCalendar }) {
  const empty = calendar.days.filter((d) => !d.picks.some((p) => p.region === null)).length;
  return (
    <section className="cal" aria-labelledby="cal-title">
      <div className="cal-head">
        <h2 id="cal-title">Coming up</h2>
        <p>{empty ? `${empty} of the next ${calendar.days.length} days have no joke yet` : "Every day is covered"}</p>
      </div>
      <ol className="cal-days">
        {calendar.days.map((d) => {
          const everywhere = d.picks.find((p) => p.region === null);
          const regional = d.picks.filter((p) => p.region !== null);
          return (
            <li
              key={d.date}
              className={`cal-day${everywhere ? " is-filled" : ""}`}
              title={d.picks.map((p) => `${p.region ?? "Everywhere"}: ${p.setup ?? ""} (${p.creatorName})`).join("\n")}
            >
              <span className="cal-dow">{weekdayShort(d.date)}</span>
              <span className="cal-num">{Number(d.date.slice(8))}</span>
              <span className="visually-hidden">
                {everywhere ? "has a joke" : "no joke yet"}
                {regional.length ? `, plus ${regional.map((r) => r.region).join(", ")}` : ""}
              </span>
              {regional.length ? <span className="cal-regional" aria-hidden="true">+{regional.length}</span> : null}
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
    <li className="qcard" aria-label={title}>
      <div className="qcard-joke">
        <div className="qcard-thumb">
          <StoryCard
            face={faceOf(joke)}
            revealed
            animate={false}
          />
        </div>
        <div className="qcard-text">
          <p className="qcard-setup">{joke.setup ?? joke.caption}</p>
          {joke.punchline ? <p className="qcard-punch">{joke.punchline}</p> : null}
          <div className="qcard-by">
            <Avatar name={joke.creator.name} tone={joke.creator.tone} size={28} />
            <span>
              {joke.creator.name} <span className="qcard-muted">@{joke.creator.handle}</span>
            </span>
          </div>
          <p className="qcard-muted">
            For {joke.region ?? "everywhere"}
            {joke.topics.length ? ` · ${joke.topics.join(", ")}` : ""} · sent {shortDate(joke.submittedAt.slice(0, 10))}
          </p>
        </div>
      </div>

      {possibleCopies.length ? (
        <div className="qcard-copies" role="note">
          <p className="qcard-copies-title">Possible copies</p>
          <ul>
            {possibleCopies.map((c) => (
              <li key={c.id}>
                <strong>{Math.round(c.similarity * 100)}% alike:</strong> “{c.setup}” {c.punchline ? `“${c.punchline}”` : ""}{" "}
                <span className="qcard-muted">
                  {c.sameWriter ? "by the same writer" : `by @${c.creatorHandle}`}, {c.status.replace("_", " ")}
                  {c.deliverOn ? ` ${shortDate(c.deliverOn)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {declining ? (
        <form className="qcard-actions" onSubmit={(e) => void decline(e)}>
          <label className="qcard-field">
            <span>Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {DECLINE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="qcard-field qcard-grow">
            <span>Note for the writer (optional)</span>
            <input value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
          </label>
          <div className="qcard-buttons">
            <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
              Decline
            </button>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setDeclining(false)}>
              Schedule instead
            </button>
          </div>
        </form>
      ) : (
        <form className="qcard-actions" onSubmit={(e) => void schedule(e)}>
          <label className="qcard-field">
            <span>Goes out on</span>
            <input
              type="date"
              value={chosenDay}
              min={calendar?.firstOpenDay}
              onChange={(e) => setDay(e.target.value)}
              required
            />
          </label>
          <div className="qcard-buttons">
            <button type="submit" className="btn btn-primary btn-small" disabled={busy || !chosenDay}>
              Schedule
            </button>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setDeclining(true)}>
              Decline…
            </button>
          </div>
        </form>
      )}
      {error ? (
        <p className="qcard-error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
