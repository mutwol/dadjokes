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
import { Card, EmptyState, Pill, button, card, cn, field } from "../components/ui/index.ts";

const STATUS_TONE = {
  in_review: "review",
  scheduled: "scheduled",
  delivered: "delivered",
  declined: "muted",
  withdrawn: "muted",
} as const satisfies Record<Submission["status"], string>;

const meta = "text-sm text-ink-soft";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-paper p-4">
      <dt className="text-sm font-bold text-ink-soft">{label}</dt>
      <dd className="mt-1 text-2xl font-extrabold">{value}</dd>
    </div>
  );
}

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
    <div className="mx-auto grid max-w-content gap-6 px-4 lg:px-8 lg:pt-7">
      <header className="flex items-center justify-between gap-3 pt-4.5 lg:pt-0">
        <h1 className="text-3xl">Studio</h1>
        <Link to="/create" className={button()}>
          <Icon name="plus" size={20} />
          Write a joke
        </Link>
      </header>

      {/* A grid of cells separated by 1px gaps that show the line colour behind them. */}
      <dl
        className={cn(card, "m-0 grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-4")}
        aria-busy={summary === null}
      >
        <Stat label="People reached" value={summary ? compact(summary.reached) : "–"} />
        <Stat label="Jokes picked" value={summary ? summary.picked : "–"} />
        <Stat label="Waiting for review" value={summary ? summary.inReview : "–"} />
        <Stat label="Tips received" value={balance ? `KES ${compact(balance.lifetimeTipsKes)}` : "–"} />
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

      <section aria-labelledby="subs-title" className="grid gap-3">
        <h2 id="subs-title" className="text-xl">Your jokes</h2>
        {failed ? (
          <EmptyState role="alert">
            <p>Couldn't load your jokes.</p>
            <button
              type="button"
              className={button({ variant: "quiet", size: "sm" })}
              onClick={() => setAttempt((a) => a + 1)}
            >
              Try again
            </button>
          </EmptyState>
        ) : jokes !== null && !list.length ? (
          <EmptyState>
            <p>You haven't sent a joke yet. Curators pick one a day, so make it groan-worthy.</p>
          </EmptyState>
        ) : (
          <ul className="m-0 grid list-none gap-2.5 p-0" aria-busy={jokes === null}>
            {list.map((s) => (
              <Card as="li" key={s.id} className="flex items-center gap-3.5 p-3">
                <div className="w-16 shrink-0">
                  <StoryCard face={faceOf(s)} revealed animate={false} variant="thumb" />
                </div>
                <div className="grid min-w-0 flex-1 justify-items-start gap-1">
                  <Pill tone={STATUS_TONE[s.status]}>{STATUS[s.status]}</Pill>
                  <p className="font-bold">
                    {s.status === "delivered" && !s.removed ? (
                      <Link to={`/joke/${s.id}`}>{s.setup ?? s.caption ?? "Image joke"}</Link>
                    ) : (
                      (s.setup ?? s.caption ?? "Image joke")
                    )}
                  </p>
                  <p className={meta}>{describe(s)}</p>
                </div>
                {s.canWithdraw ? (
                  <button
                    type="button"
                    className={button({ variant: "quiet", size: "sm", className: "shrink-0" })}
                    onClick={() => void withdraw(s)}
                    aria-label={`Withdraw "${s.setup ?? s.caption ?? "image joke"}"`}
                  >
                    Withdraw
                  </button>
                ) : null}
              </Card>
            ))}
          </ul>
        )}
        {nextCursor ? (
          <button
            type="button"
            className={button({ variant: "quiet" })}
            onClick={() => void loadMore(nextCursor)}
          >
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
    <Card as="section" className="grid gap-3 p-4" aria-labelledby="tips-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tips-title" className="text-xl">
            Your tips
          </h2>
          <p>
            <strong className="text-2xl">KES {balance.availableKes.toLocaleString("en-KE")}</strong> ready to withdraw
          </p>
        </div>
        {balance.pendingPayoutKes ? <p className={meta}>KES {balance.pendingPayoutKes} on its way</p> : null}
      </div>
      {balance.payoutPhoneLast3 === null ? (
        <p className={meta}>
          Add your M-Pesa number in your <Link to="/me">profile</Link> to withdraw tips.
        </p>
      ) : canWithdraw ? (
        <form className="flex flex-wrap items-center gap-2.5" onSubmit={(e) => void withdraw(e)}>
          <label>
            <span className="sr-only">Amount in KES</span>
            <input
              className={field("sm", "w-[130px] font-bold")}
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
          <button type="submit" className={button({ size: "sm" })} disabled={busy || !amount}>
            Withdraw to M-Pesa ending {balance.payoutPhoneLast3}
          </button>
        </form>
      ) : (
        <p className={meta}>You can withdraw once you have KES {balance.minimumPayoutKes}.</p>
      )}
      {transfers.length ? (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {transfers.slice(0, 5).map((t) => (
            <li key={t.id} className="flex justify-between gap-3 font-bold">
              <span>KES {t.amountKes}</span>
              <span className={meta}>
                {TRANSFER_STATUS[t.status]} · {shortDate(t.createdAt.slice(0, 10))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
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
