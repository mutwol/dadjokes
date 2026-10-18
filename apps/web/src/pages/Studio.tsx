import { useState } from "react";
import { Link } from "react-router";
import { z } from "zod";
import {
  problemMessage,
  useAppealJokeMutation,
  useGetBalanceQuery,
  useGetStudioDailyQuery,
  useGetStudioSummaryQuery,
  useListMyAppealsQuery,
  useListMyJokesQuery,
  useListPayoutsQuery,
  useRequestPayoutMutation,
  useWithdrawMyJokeMutation,
} from "../api/rtk/index.ts";
import type { Appeal, Balance, PayoutTransfer, Submission } from "../api/rtk/index.ts";
import { Pill } from "@/components/ui/badge.tsx";
import { button } from "@/components/ui/button.tsx";
import { Card, card, EmptyState } from "@/components/ui/card.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { Form, FormError, SubmitButton, TextareaField, TextField } from "@/components/ui/form.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { useZodForm } from "@/hooks/useZodForm.ts";
import { cn } from "@/lib/utils.ts";
import { DailyChart } from "../components/DailyChart.tsx";
import { StoryCard } from "../components/StoryCard.tsx";
import { faceOf } from "../data/face.ts";
import { compact } from "../data/reactions.ts";

import { longDate, shortDate } from "../data/dates.ts";

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
      <dt className="text-sm font-medium text-ink-soft">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
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
  // Pages accumulate in one cache entry; "Show more" passes the cursor (see endpoints.ts).
  const [more, setMore] = useState<string | undefined>(undefined);
  const jokesQuery = useListMyJokesQuery({ limit: 20, cursor: more });
  const jokes = jokesQuery.data?.data ?? null;
  const nextCursor = jokesQuery.data?.nextCursor ?? null;
  const failed = jokesQuery.isError && !jokesQuery.data;
  const { data: summary } = useGetStudioSummaryQuery();
  const daily = useGetStudioDailyQuery().data?.data ?? null;
  const { data: balance } = useGetBalanceQuery();
  const transfers = useListPayoutsQuery().data?.data ?? [];
  // Appeals against takedowns, so removed jokes show where their appeal stands.
  const appeals = useListMyAppealsQuery().data?.data ?? [];
  const [withdrawJoke] = useWithdrawMyJokeMutation();

  const loadMore = (cursor: string) => setMore(cursor);

  const withdraw = async (s: Submission) => {
    try {
      // Updates the list in place and refreshes the counts (endpoints.ts).
      await withdrawJoke({ id: s.id }).unwrap();
      toast.success("Joke withdrawn");
    } catch (e) {
      toast.error(problemMessage(e));
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
        aria-busy={!summary}
      >
        <Stat label="People reached" value={summary ? compact(summary.reached) : "–"} />
        <Stat label="Jokes picked" value={summary ? summary.picked : "–"} />
        <Stat label="Waiting for review" value={summary ? summary.inReview : "–"} />
        <Stat label="Tips received" value={balance ? `KES ${compact(balance.lifetimeTipsKes)}` : "–"} />
      </dl>

      {balance ? (
        <TipsPanel balance={balance} transfers={transfers} />
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
              onClick={() => void jokesQuery.refetch()}
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
                  <p className="font-medium">
                    {s.status === "delivered" && !s.removed ? (
                      <Link to={`/joke/${s.id}`}>{s.setup ?? s.caption ?? "Image joke"}</Link>
                    ) : (
                      (s.setup ?? s.caption ?? "Image joke")
                    )}
                  </p>
                  <p className={meta}>{describe(s)}</p>
                  {s.removed ? (
                    <AppealControl jokeId={s.id} appeal={appeals.find((a) => a.jokeId === s.id)} />
                  ) : null}
                </div>
                {s.canWithdraw ? (
                  <ConfirmDialog
                    trigger={
                      <button
                        type="button"
                        className={button({ variant: "quiet", size: "sm", className: "shrink-0" })}
                        aria-label={`Withdraw "${s.setup ?? s.caption ?? "image joke"}"`}
                      >
                        Withdraw
                      </button>
                    }
                    title="Withdraw this joke?"
                    description={
                      s.status === "scheduled"
                        ? "It's taken off the schedule and won't go out to anyone. You can't undo this."
                        : "It leaves the curators' queue and won't be considered. You can't undo this."
                    }
                    confirmLabel="Withdraw joke"
                    pendingLabel="Withdrawing…"
                    onConfirm={() => withdraw(s)}
                  />
                ) : null}
              </Card>
            ))}
          </ul>
        )}
        {nextCursor ? (
          <button
            type="button"
            className={button({ variant: "quiet" })}
            onClick={() => loadMore(nextCursor)}
            disabled={jokesQuery.isFetching}
            aria-busy={jokesQuery.isFetching || undefined}
          >
            {jokesQuery.isFetching && more ? "Loading…" : "Show more"}
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

function holdLabel(hours: number) {
  return hours % 24 === 0 ? `${hours / 24} ${hours === 24 ? "day" : "days"}` : `${hours} hours`;
}

function releaseWhen(iso: string) {
  return new Date(iso).toLocaleString("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function TipsPanel({ balance, transfers }: { balance: Balance; transfers: PayoutTransfer[] }) {
  const [requestPayout] = useRequestPayoutMutation();
  const available = Math.floor(balance.availableKes);
  const canWithdraw = balance.payoutPhoneLast3 !== null && available >= balance.minimumPayoutKes;
  const schema = z.object({
    amount: z
      .number({ error: "Enter an amount in KES." })
      .int("Whole shillings only.")
      .min(balance.minimumPayoutKes, `The minimum is KES ${balance.minimumPayoutKes}.`)
      .max(available, `You have KES ${available} to withdraw.`),
  });
  const form = useZodForm(schema, { defaultValues: { amount: undefined as unknown as number } });

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
      {balance.pendingKes > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-fridge px-3 py-2 text-sm">
          <span className="font-medium">KES {balance.pendingKes.toLocaleString("en-KE")} on hold</span>
          <span className="text-ink-soft">
            {balance.nextReleaseAt ? `Next release ${releaseWhen(balance.nextReleaseAt)}. ` : ""}
            New earnings wait {holdLabel(balance.holdHours)} in case a payment is reversed.
          </span>
        </p>
      ) : null}
      {balance.lifetimeTipsKes || balance.creatorFundKes ? (
        <p className={meta}>
          Earned so far: KES {balance.lifetimeTipsKes.toLocaleString("en-KE")} in tips
          {balance.creatorFundKes ? ` and KES ${balance.creatorFundKes.toLocaleString("en-KE")} from the creator fund` : ""}, after fees.
        </p>
      ) : null}
      {balance.payoutPhoneLast3 === null ? (
        <p className={meta}>
          Add your M-Pesa number in your <Link to="/me">profile</Link> to withdraw tips.
        </p>
      ) : canWithdraw ? (
        <Form
          form={form}
          resetOnSuccess
          className="grid-cols-[minmax(0,14rem)_auto] items-start justify-start gap-2.5"
          onSubmit={async ({ amount }) => {
            // Invalidates Balance and Payouts, so both refresh on their own.
            const p = await requestPayout({ createPayoutRequest: { amountKes: amount } }).unwrap();
            toast.success(`KES ${p.amountKes} is on its way to your M-Pesa.`);
          }}
        >
          <TextField
            name="amount"
            label="Amount in KES"
            hideLabel
            fieldSize="sm"
            type="number"
            inputMode="numeric"
            inputClassName="font-medium"
            min={balance.minimumPayoutKes}
            max={available}
            step={1}
            placeholder={`${balance.minimumPayoutKes}–${available}`}
          />
          <SubmitButton size="sm" pendingLabel="Sending…">
            Withdraw to M-Pesa ending {balance.payoutPhoneLast3}
          </SubmitButton>
          <FormError className="col-span-2" />
        </Form>
      ) : (
        <p className={meta}>You can withdraw once you have KES {balance.minimumPayoutKes}.</p>
      )}
      {transfers.length ? (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {transfers.slice(0, 5).map((t) => (
            <li key={t.id} className="flex justify-between gap-3 font-medium">
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

const appealSchema = z.object({
  message: z.string().trim().min(10, "Say a little more, at least 10 characters.").max(1000, "Keep it under 1,000 characters."),
});

/** For a taken-down joke: appeal once, then see how it went. */
function AppealControl({ jokeId, appeal }: { jokeId: string; appeal?: Appeal }) {
  const [open, setOpen] = useState(false);
  const [appealJoke] = useAppealJokeMutation();
  const form = useZodForm(appealSchema, { defaultValues: { message: "" } });

  if (appeal) {
    const text =
      appeal.status === "open"
        ? "You appealed. The curators will get back to you."
        : appeal.status === "overturned"
          ? "Your appeal worked: it's back up."
          : `Appeal looked at: kept down${appeal.resolutionNote ? `. “${appeal.resolutionNote}”` : "."}`;
    return <p className="text-sm font-medium text-ink-soft">{text}</p>;
  }
  if (!open) {
    return (
      <button type="button" className="border-0 bg-transparent p-0 text-sm font-medium text-ink underline underline-offset-3" onClick={() => setOpen(true)}>
        Think this was a mistake? Appeal
      </button>
    );
  }
  return (
    <Form
      form={form}
      className="w-full gap-2"
      onSubmit={async ({ message }) => {
        // Invalidates my appeals, so the status line replaces this form.
        await appealJoke({ id: jokeId, createAppealRequest: { message } }).unwrap();
        toast.success("Appeal sent. You'll hear back in Activity.");
      }}
    >
      <TextareaField
        name="message"
        label="Why should it go back up?"
        hideLabel
        rows={2}
        maxLength={1000}
        placeholder="Why should it go back up? E.g. I wrote it myself, here's where I first posted it."
      />
      <FormError />
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel="Sending…">
          Send appeal
        </SubmitButton>
        <button type="button" className={button({ variant: "quiet", size: "sm" })} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </Form>
  );
}
