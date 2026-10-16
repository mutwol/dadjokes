import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { api, errorMessage, unwrap } from "../api/client.ts";
import type { Submission } from "../api/client.ts";
import { Icon } from "../components/Icon.tsx";
import { StoryCard } from "../components/StoryCard.tsx";

import { longDate } from "../data/dates.ts";
import { useStore } from "../state/useStore.ts";
import "./Studio.css";

const STATUS: Record<Submission["status"], string> = {
  in_review: "In review",
  scheduled: "Scheduled",
  delivered: "Delivered",
  declined: "Not picked",
  withdrawn: "Withdrawn",
};

const DECLINE_COPY: Record<NonNullable<Submission["declineReason"]>, string> = {
  possible_copy: "it looks like a joke that's already out there.",
  not_a_dad_joke: "it isn't quite a dad joke.",
  offensive: "it could hurt someone.",
  unclear: "it was hard to follow.",
  other: "the curators passed on it this time.",
};

export function Studio() {
  const { showToast } = useStore();
  const [jokes, setJokes] = useState<Submission[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const [attempt, setAttempt] = useState(0);

  const fetchPage = useCallback(
    (cursor?: string) => api.GET("/v1/me/jokes", { params: { query: { limit: 20, cursor } } }).then(unwrap),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage().then(
      (page) => {
        if (cancelled) return;
        setJokes(page.data);
        setNextCursor(page.nextCursor);
        setFailed(false);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetchPage, attempt]);

  const loadMore = async (cursor: string) => {
    try {
      const page = await fetchPage(cursor);
      setJokes((prev) => [...(prev ?? []), ...page.data]);
      setNextCursor(page.nextCursor);
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  const withdraw = async (s: Submission) => {
    try {
      const updated = unwrap(
        await api.POST("/v1/me/jokes/{id}/withdraw", { params: { path: { id: s.id } } }),
      );
      setJokes((prev) => prev?.map((j) => (j.id === s.id ? updated : j)) ?? null);
      showToast("Joke withdrawn");
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  const list = jokes ?? [];
  const count = (...statuses: Submission["status"][]) => list.filter((j) => statuses.includes(j.status)).length;

  return (
    <div className="studio">
      <header className="studio-head">
        <h1>Studio</h1>
        <Link to="/create" className="btn btn-primary">
          <Icon name="plus" size={20} />
          Write a joke
        </Link>
      </header>

      <dl className="studio-stats" aria-busy={jokes === null}>
        <div>
          <dt>Jokes sent</dt>
          <dd>{jokes ? list.length : "–"}</dd>
        </div>
        <div>
          <dt>Jokes picked</dt>
          <dd>{jokes ? count("scheduled", "delivered") : "–"}</dd>
        </div>
        <div>
          <dt>Waiting for review</dt>
          <dd>{jokes ? count("in_review") : "–"}</dd>
        </div>
        <div>
          <dt>Tips received</dt>
          <dd>KES 0</dd>
        </div>
      </dl>

      <section aria-labelledby="subs-title" className="studio-list">
        <h2 id="subs-title">Your jokes</h2>
        {failed ? (
          <div className="studio-empty" role="alert">
            <p>Couldn't load your jokes.</p>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
          </div>
        ) : jokes !== null && !list.length ? (
          <div className="studio-empty">
            <p>You haven't sent a joke yet. Curators pick one a day, so make it groan-worthy.</p>
          </div>
        ) : (
          <ul aria-busy={jokes === null}>
            {list.map((s) => (
              <li key={s.id} className="sub">
                <div className="sub-thumb">
                  <StoryCard
                    face={
                      s.kind === "text"
                        ? { kind: "text", setup: s.setup ?? "", punchline: s.punchline ?? "", background: s.background }
                        : { kind: "image", imageUrl: s.imageUrl ?? undefined, imageAlt: s.imageAlt ?? "", caption: s.caption ?? "" }
                    }
                    revealed
                    animate={false}
                  />
                </div>
                <div className="sub-body">
                  <span className={`status status-${s.status.replace("_", "-")}`}>{STATUS[s.status]}</span>
                  <p className="sub-setup">{s.setup ?? s.caption ?? "Image joke"}</p>
                  <p className="sub-meta">{describe(s)}</p>
                </div>
                {s.canWithdraw ? (
                  <button
                    type="button"
                    className="btn btn-quiet btn-small sub-action"
                    onClick={() => void withdraw(s)}
                    aria-label={`Withdraw "${s.setup ?? s.caption ?? "image joke"}"`}
                  >
                    Withdraw
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {nextCursor ? (
          <button type="button" className="btn btn-quiet" onClick={() => void loadMore(nextCursor)}>
            Show more
          </button>
        ) : null}
      </section>
    </div>
  );
}

function describe(s: Submission): string {
  const sent = longDate(s.submittedAt.slice(0, 10));
  switch (s.status) {
    case "scheduled":
      return `Goes out ${longDate(s.deliverOn!)}`;
    case "delivered":
      return `Went out ${longDate(s.deliverOn!)}`;
    case "declined":
      return `Not picked: ${DECLINE_COPY[s.declineReason ?? "other"]}${s.declineNote ? ` “${s.declineNote}”` : ""}`;
    case "withdrawn":
      return `Sent ${sent}. You withdrew it.`;
    default:
      return `Sent ${sent}`;
  }
}
