import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { api, errorMessage, unwrap } from "../api/client.ts";
import type { Balance, PayoutTransfer, StudioDaily, StudioSummary, Submission } from "../api/client.ts";
import { DailyChart } from "../components/DailyChart.tsx";
import { Icon } from "../components/Icon.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { faceOf } from "../data/face.ts";
import { compact } from "../data/reactions.ts";

import { longDate, shortDate } from "../data/dates.ts";
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
  const [summary, setSummary] = useState<StudioSummary | null>(null);
  const [daily, setDaily] = useState<StudioDaily["data"] | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transfers, setTransfers] = useState<PayoutTransfer[]>([]);

  const fetchPage = useCallback(
    (cursor?: string) => api.GET("/v1/me/jokes", { params: { query: { limit: 20, cursor } } }).then(unwrap),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.GET("/v1/me/balance").then(unwrap), api.GET("/v1/me/payouts").then(unwrap)]).then(
      ([b, p]) => {
        if (cancelled) return;
        setBalance(b);
        setTransfers(p.data);
      },
      () => undefined,
    );
    void api
      .GET("/v1/me/studio/daily")
      .then(unwrap)
      .then((d) => {
        if (!cancelled) setDaily(d.data);
      }, () => undefined);
    void api
      .GET("/v1/me/studio")
      .then(unwrap)
      .then((sum) => {
        if (!cancelled) setSummary(sum);
      }, () => undefined);
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
      setSummary((sum) =>
        sum ? { ...sum, inReview: sum.inReview - (s.status === "in_review" ? 1 : 0), picked: sum.picked - (s.status === "scheduled" ? 1 : 0) } : sum,
      );
      showToast("Joke withdrawn");
    } catch (e) {
      showToast(errorMessage(e));
    }
  };

  const list = jokes ?? [];

  return (
    <div className="studio">
      <header className="studio-head">
        <h1>Studio</h1>
        <Link to="/create" className="btn btn-primary">
          <Icon name="plus" size={20} />
          Write a joke
        </Link>
      </header>

      <dl className="studio-stats" aria-busy={summary === null}>
        <div>
          <dt>People reached</dt>
          <dd>{summary ? compact(summary.reached) : "–"}</dd>
        </div>
        <div>
          <dt>Jokes picked</dt>
          <dd>{summary ? summary.picked : "–"}</dd>
        </div>
        <div>
          <dt>Waiting for review</dt>
          <dd>{summary ? summary.inReview : "–"}</dd>
        </div>
        <div>
          <dt>Tips received</dt>
          <dd>{balance ? `KES ${compact(balance.lifetimeTipsKes)}` : "–"}</dd>
        </div>
      </dl>

      {balance ? (
        <TipsPanel
          balance={balance}
          transfers={transfers}
          onWithdrawn={(p, b) => {
            setTransfers((prev) => [p, ...prev]);
            setBalance(b);
          }}
        />
      ) : null}

      {daily && daily.some((d) => d.opens) ? (
        <DailyChart title="Opens, last 14 days" unit="opens" days={daily.map((d) => ({ date: d.date, value: d.opens }))} />
      ) : null}

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
                    face={faceOf(s)}
                    revealed
                    animate={false}
                  />
                </div>
                <div className="sub-body">
                  <span className={`status status-${s.status.replace("_", "-")}`}>{STATUS[s.status]}</span>
                  <p className="sub-setup">
                    {s.status === "delivered" && !s.removed ? (
                      <Link to={`/joke/${s.id}`}>{s.setup ?? s.caption ?? "Image joke"}</Link>
                    ) : (
                      (s.setup ?? s.caption ?? "Image joke")
                    )}
                  </p>
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

const TRANSFER_STATUS: Record<PayoutTransfer["status"], string> = {
  requested: "Sending",
  processing: "Sending",
  paid: "Sent",
  failed: "Failed, returned to balance",
};

function TipsPanel({
  balance,
  transfers,
  onWithdrawn,
}: {
  balance: Balance;
  transfers: PayoutTransfer[];
  onWithdrawn: (p: PayoutTransfer, b: Balance) => void;
}) {
  const { showToast } = useStore();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const available = Math.floor(balance.availableKes);
  const canWithdraw = balance.payoutPhoneLast3 !== null && available >= balance.minimumPayoutKes;

  const withdraw = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = unwrap(await api.POST("/v1/me/payouts", { body: { amountKes: Number(amount) } }));
      const b = unwrap(await api.GET("/v1/me/balance"));
      onWithdrawn(p, b);
      setAmount("");
      showToast(`KES ${p.amountKes} is on its way to your M-Pesa.`);
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tips-panel" aria-labelledby="tips-title">
      <div className="tips-head">
        <div>
          <h2 id="tips-title">Your tips</h2>
          <p className="tips-balance">
            <strong>KES {balance.availableKes.toLocaleString("en-KE")}</strong> ready to withdraw
          </p>
        </div>
        {balance.pendingPayoutKes ? <p className="sub-meta">KES {balance.pendingPayoutKes} on its way</p> : null}
      </div>
      {balance.payoutPhoneLast3 === null ? (
        <p className="sub-meta">
          Add your M-Pesa number in your <Link to="/me">profile</Link> to withdraw tips.
        </p>
      ) : canWithdraw ? (
        <form className="tips-form" onSubmit={(e) => void withdraw(e)}>
          <label>
            <span className="visually-hidden">Amount in KES</span>
            <input
              type="number"
              inputMode="numeric"
              min={balance.minimumPayoutKes}
              max={available}
              step={1}
              placeholder={`${balance.minimumPayoutKes}–${available}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary btn-small" disabled={busy || !amount}>
            Withdraw to M-Pesa ending {balance.payoutPhoneLast3}
          </button>
        </form>
      ) : (
        <p className="sub-meta">You can withdraw once you have KES {balance.minimumPayoutKes}.</p>
      )}
      {transfers.length ? (
        <ul className="tips-transfers">
          {transfers.slice(0, 5).map((t) => (
            <li key={t.id}>
              <span>KES {t.amountKes}</span>
              <span className="sub-meta">
                {TRANSFER_STATUS[t.status]} · {shortDate(t.createdAt.slice(0, 10))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function describe(s: Submission): string {
  const sent = longDate(s.submittedAt.slice(0, 10));
  switch (s.status) {
    case "scheduled":
      return `Goes out ${longDate(s.deliverOn!)}`;
    case "delivered":
      if (s.removed) return `Went out ${longDate(s.deliverOn!)}. Taken down by the curators.`;
      return s.stats?.reached
        ? `Went out ${longDate(s.deliverOn!)} · ${compact(s.stats.opened)} of ${compact(s.stats.reached)} opened · ${compact(s.stats.reactions)} reactions · ${compact(s.stats.comments)} comments`
        : `Went out ${longDate(s.deliverOn!)}`;
    case "declined":
      return `Not picked: ${DECLINE_COPY[s.declineReason ?? "other"]}${s.declineNote ? ` “${s.declineNote}”` : ""}`;
    case "withdrawn":
      return `Sent ${sent}. You withdrew it.`;
    default:
      return `Sent ${sent}`;
  }
}
