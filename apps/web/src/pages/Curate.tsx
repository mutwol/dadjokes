import { useState } from "react";
import { z } from "zod";
import { problemMessage, useDeclineJokeMutation, useGetCurationCalendarQuery, useGetReviewQueueQuery, useScheduleJokeMutation } from "../api/rtk/index.ts";
import type { CurationCalendar, QueueItem } from "../api/rtk/index.ts";
import { Avatar } from "@/components/ui/avatar.tsx";
import { button } from "@/components/ui/button.tsx";
import { Card, EmptyState } from "@/components/ui/card.tsx";
import { Form, FormError, SelectField, SubmitButton, TextField } from "@/components/ui/form.tsx";
import { segment, segmented } from "@/components/ui/segmented.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { useZodForm } from "@/hooks/useZodForm.ts";
import { cn } from "@/lib/utils.ts";
import { StoryCard } from "../components/StoryCard.tsx";
import { faceOf } from "../data/face.ts";
import { longDate, shortDate, weekdayShort } from "../data/dates.ts";
import { useSearchParams } from "react-router";
import { AppealsPanel } from "../components/moderation/AppealsPanel.tsx";
import { ReportsPanel } from "../components/moderation/ReportsPanel.tsx";

const muted = "text-sm text-ink-soft";
const list = "m-0 grid list-none gap-3.5 p-0";
const smallQuiet = button({ variant: "quiet", size: "sm" });

/** The row of form controls and buttons at the bottom of a queue card. */
const actionRow = "items-start gap-2.5 border-t border-line pt-3";

const DECLINE_REASONS: { value: QueueItem["joke"]["declineReason"] & string; label: string }[] = [
  { value: "possible_copy", label: "Looks copied" },
  { value: "not_a_dad_joke", label: "Not a dad joke" },
  { value: "offensive", label: "Offensive" },
  { value: "unclear", label: "Hard to follow" },
  { value: "other", label: "Something else" },
];

type Calendar = CurationCalendar["days"];
type DeclineReason = NonNullable<QueueItem["joke"]["declineReason"]>;

const declineSchema = z.object({
  reason: z.enum(DECLINE_REASONS.map((r) => r.value) as [DeclineReason, ...DeclineReason[]]),
  note: z.string().trim().max(280, "Keep it under 280 characters."),
});

/** The first open day with no pick for this joke's region (or everywhere). */
function firstFreeDay(days: Calendar, region: string | null): string | undefined {
  return days.find((d) => !d.picks.some((p) => p.region === region))?.date;
}

export function Curate() {
  const [params, setParams] = useSearchParams();
  const tab = (["queue", "reports", "appeals"] as const).find((t) => t === params.get("tab")) ?? "queue";
  const setTab = (t: "queue" | "reports" | "appeals") => setParams(t === "queue" ? {} : { tab: t }, { replace: true });
  return (
    <div className="mx-auto grid max-w-content gap-5 px-4 pb-8">
      <header className="grid gap-1 pt-4.5">
        <h1 className="text-3xl">Curation</h1>
        <div className={cn(segmented, "mt-1.5 grid-cols-3 justify-self-start")} role="tablist" aria-label="Curation">
          {(["queue", "reports", "appeals"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={segment(tab === t, "px-4.5")}
              onClick={() => setTab(t)}
            >
              {t === "queue" ? "Review queue" : t === "reports" ? "Reports" : "Appeals"}
            </button>
          ))}
        </div>
      </header>
      {tab === "queue" ? <Queue /> : tab === "reports" ? <ReportsPanel /> : <AppealsPanel />}
    </div>
  );
}

function Queue() {
  // Pages accumulate in one cache entry; "Show more" passes the cursor (see endpoints.ts).
  const [more, setMore] = useState<string | undefined>(undefined);
  const queue = useGetReviewQueueQuery({ limit: 20, cursor: more }, { refetchOnFocus: true });
  const { data: calendar = null } = useGetCurationCalendarQuery({ days: 28 });
  const items = queue.data?.data ?? (queue.isError ? [] : null);
  const waiting = queue.data?.waiting ?? 0;
  const nextCursor = queue.data?.nextCursor ?? null;

  /** Scheduling or declining already removed the card from the cache (endpoints.ts). */
  const done = (_id: string, message: string) => toast.success(message);
  const loadMore = () => nextCursor && setMore(nextCursor);

  return (
    <>
      <p className={muted}>
        {items === null ? "Loading the queue…" : `${waiting} ${waiting === 1 ? "joke" : "jokes"} waiting for review`}
      </p>

      {calendar ? <CalendarStrip calendar={calendar} /> : null}

      {queue.isError && !queue.data ? (
        <EmptyState role="alert">
          <p>{problemMessage(queue.error, "Couldn't load the queue. Try again.")}</p>
          <button type="button" className={smallQuiet} onClick={() => void queue.refetch()}>
            Try again
          </button>
        </EmptyState>
      ) : items !== null && !items.length ? (
        <EmptyState>
          <p>The queue is empty. Nothing to groan at for now.</p>
          <button type="button" className={smallQuiet} onClick={() => void queue.refetch()}>
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
        <button type="button" className={button({ variant: "quiet" })} onClick={loadMore} disabled={queue.isFetching} aria-busy={queue.isFetching || undefined}>
          {queue.isFetching && more ? "Loading…" : "Show more"}
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
              <span className="text-2xs font-medium text-ink-soft">{weekdayShort(d.date)}</span>
              <span className="font-semibold">{Number(d.date.slice(8))}</span>
              <span className="sr-only">
                {everywhere ? "has a joke" : "no joke yet"}
                {regional.length ? `, plus ${regional.map((r) => r.region).join(", ")}` : ""}
              </span>
              {regional.length ? <span className="absolute -top-1.75 -right-1.25 rounded-full bg-tag-red px-1.25 py-px text-[0.65rem] font-semibold text-white" aria-hidden="true">+{regional.length}</span> : null}
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
  const [declining, setDeclining] = useState(possibleCopies.some((c) => c.similarity >= 0.8));
  const [scheduleJoke] = useScheduleJokeMutation();
  const [declineJoke] = useDeclineJokeMutation();
  const firstOpen = calendar?.firstOpenDay ?? "";

  const scheduleSchema = z.object({
    deliverOn: z
      .string()
      .min(1, "Pick a day.")
      .refine((d) => !firstOpen || d >= firstOpen, `The first open day is ${firstOpen ? longDate(firstOpen) : "later"}.`),
  });
  const scheduleForm = useZodForm(scheduleSchema, { defaultValues: { deliverOn: suggested ?? "" }, values: suggested ? { deliverOn: suggested } : undefined, resetOptions: { keepDirtyValues: true } });
  const declineForm = useZodForm(declineSchema, { defaultValues: { reason: possibleCopies.length ? "possible_copy" : "not_a_dad_joke", note: "" } });

  const title = joke.setup ?? joke.caption ?? "Image joke";
  return (
    <Card as="li" className="grid gap-3 p-3.5" aria-label={title}>
      <div className="flex gap-3.5">
        <div className="w-21 shrink-0">
          <StoryCard face={faceOf(joke)} revealed animate={false} variant="thumb" />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <p className="font-semibold">{joke.setup ?? joke.caption}</p>
          {joke.punchline ? <p className="font-semibold">{joke.punchline}</p> : null}
          <div className="flex items-center gap-2 text-sm font-medium">
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
        <div className="grid gap-1.5 rounded-lg border border-cream-edge bg-butter px-3 py-2.5 text-sm text-butter-ink-deep" role="note">
          <p className="font-semibold">Possible copies</p>
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
        <Form
          form={declineForm}
          className={cn(actionRow, "grid-cols-1 sm:grid-cols-[12rem_1fr_auto] sm:items-start")}
          onSubmit={async ({ reason, note }) => {
            await declineJoke({ id: joke.id, declineJokeRequest: { reason, note: note || undefined } }).unwrap();
            onDone(joke.id, "Declined. The writer will see why.");
          }}
        >
          <SelectField name="reason" label="Reason" fieldSize="sm" options={DECLINE_REASONS} />
          <TextField name="note" label="Note for the writer" optional fieldSize="sm" maxLength={280} autoComplete="off" />
          <div className="flex gap-2 sm:pt-6.5">
            <SubmitButton variant="danger" size="sm" pendingLabel="Declining…">
              Decline
            </SubmitButton>
            <button type="button" className={smallQuiet} onClick={() => setDeclining(false)}>
              Schedule instead
            </button>
          </div>
          <FormError className="sm:col-span-3" />
        </Form>
      ) : (
        <Form
          form={scheduleForm}
          className={cn(actionRow, "grid-cols-1 sm:grid-cols-[12rem_auto] sm:items-start")}
          onSubmit={async ({ deliverOn }) => {
            await scheduleJoke({ id: joke.id, scheduleJokeRequest: { deliverOn } }).unwrap();
            onDone(joke.id, `Scheduled for ${longDate(deliverOn)}`);
          }}
        >
          <TextField name="deliverOn" label="Goes out on" fieldSize="sm" type="date" min={firstOpen || undefined} help={suggested ? "First free day for this region." : undefined} />
          <div className="flex gap-2 sm:pt-6.5">
            <SubmitButton size="sm" pendingLabel="Scheduling…">
              Schedule
            </SubmitButton>
            <button type="button" className={smallQuiet} onClick={() => setDeclining(true)}>
              Decline…
            </button>
          </div>
          <FormError className="sm:col-span-2" />
        </Form>
      )}
    </Card>
  );
}
