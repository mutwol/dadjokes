import { useState } from "react";
import { z } from "zod";
import {
  problemMessage,
  useCreateFeePolicyMutation,
  useListCreatorFundRunsQuery,
  useListFeePoliciesQuery,
  useListReconciliationsQuery,
  usePostCreatorFundMutation,
  usePreviewCreatorFundMutation,
  useRunReconciliationMutation,
} from "../../api/rtk/index.ts";
import type { CreatorFundPreview, FeePolicy, ReconciliationRun } from "../../api/rtk/index.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Form, FormError, SubmitButton, TextField } from "@/components/ui/form.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { useZodForm } from "@/hooks/useZodForm.ts";
import { cn } from "@/lib/utils.ts";
import { timeAgo } from "../../data/dates.ts";
import { LoadError, Loading } from "./ui.tsx";
import { kes, num } from "./lib.ts";

/* Money controls: the books check, fee rates and the creator fund. */

const RUN_TONE: Record<ReconciliationRun["status"], "green" | "yellow" | "red"> = { ok: "green", issues: "yellow", failed: "red" };
const RUN_LABEL: Record<ReconciliationRun["status"], string> = { ok: "Books balance", issues: "Needs a look", failed: "Check failed" };

const percent = (bps: number) => `${(bps / 100).toLocaleString("en-KE", { maximumFractionDigits: 2 })}%`;

export function MoneyControls() {
  return (
    <div className="grid gap-6">
      <BooksCheck />
      <div className="grid gap-6 xl:grid-cols-2">
        <FeeRates />
        <CreatorFund />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- books check */

function BooksCheck() {
  const { data, error, refetch } = useListReconciliationsQuery();
  const [run, { isLoading }] = useRunReconciliationMutation();
  const latest = data?.data[0];
  const failing = latest?.checks.filter((c) => !c.ok) ?? [];

  const runNow = async () => {
    try {
      const r = await run().unwrap();
      if (r.status === "ok") toast.success("Books checked: everything adds up.");
      else toast.error("Books checked: some things need a look.");
    } catch (e) {
      toast.error(problemMessage(e, "Couldn't run the check."));
    }
  };

  return (
    <Card as="section" className="grid gap-4 p-4.5" aria-labelledby="books-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="books-title" className="text-xl">
            Books check
          </h2>
          <p className="text-sm text-ink-soft">
            Runs daily after midnight (Nairobi): the ledger against itself, every tip and payout, holds, and M-Pesa clearing.
          </p>
        </div>
        <button type="button" className={button({ variant: "quiet", size: "sm" })} onClick={() => void runNow()} disabled={isLoading} aria-busy={isLoading || undefined}>
          <Icon name="replay" size={16} /> {isLoading ? "Checking…" : "Run now"}
        </button>
      </div>
      {error && !data ? (
        <LoadError error={problemMessage(error)} onRetry={() => void refetch()} />
      ) : !data ? (
        <Loading height="h-24" />
      ) : !latest ? (
        <p className="text-ink-soft">No checks yet. The first runs tonight, or run one now.</p>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={RUN_TONE[latest.status]}>{RUN_LABEL[latest.status]}</Badge>
            <span className="text-ink-soft">
              {timeAgo(latest.finishedAt)} · {latest.triggeredBy ? `run by @${latest.triggeredBy}` : "daily run"} ·{" "}
              {latest.checks.length - failing.length} of {latest.checks.length} checks pass
            </span>
          </p>
          <ul className="m-0 grid list-none gap-px overflow-hidden rounded-lg border border-line bg-line p-0 sm:grid-cols-2">
            {latest.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2.5 bg-paper px-3 py-2.5">
                <span
                  aria-hidden="true"
                  className={cn("mt-0.5 inline-grid size-5 shrink-0 place-items-center rounded-full", c.ok ? "bg-mint text-forest" : "bg-tag-red/12 text-tag-red-deep")}
                >
                  <Icon name={c.ok ? "check" : "close"} size={13} />
                </span>
                <div className="grid min-w-0 gap-0.5">
                  <span className={cn("text-sm", !c.ok && "font-medium")}>
                    <span className="sr-only">{c.ok ? "Pass: " : "Fail: "}</span>
                    {c.label}
                  </span>
                  {!c.ok ? (
                    <span className="text-xs text-ink-soft">
                      {c.detail ?? ""} {c.count > 1 ? `${num(c.count)} found.` : ""}
                      {c.amountKes ? ` ${kes(Math.abs(c.amountKes))} involved.` : ""}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {data.data.length > 1 ? (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
              Earlier:
              {data.data.slice(1, 10).map((r) => (
                <Badge key={r.id} tone={RUN_TONE[r.status]} className="font-normal">
                  {new Date(r.startedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                </Badge>
              ))}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- fee rates */

const feeSchema = z.object({
  percent: z.number({ error: "Enter a percentage." }).min(0, "Can't be negative.").max(50, "At most 50%."),
  creatorHandle: z
    .string()
    .trim()
    .refine((v) => v === "" || /^@?[a-z0-9_]{3,20}$/i.test(v), "Not a valid handle."),
  note: z.string().trim().max(200),
});

function FeeRates() {
  const { data, error, refetch } = useListFeePoliciesQuery();
  const [create] = useCreateFeePolicyMutation();
  const form = useZodForm(feeSchema, { defaultValues: { percent: undefined as unknown as number, creatorHandle: "", note: "" } });
  const current = data?.data.filter((p) => !p.supersededAt) ?? [];
  const history = data?.data.filter((p) => p.supersededAt) ?? [];
  const defaultRate = current.find((p) => !p.creator);

  return (
    <Card as="section" className="grid content-start gap-4 p-4.5" aria-labelledby="fees-title">
      <div className="grid gap-1">
        <h2 id="fees-title" className="text-xl">
          Platform cut
        </h2>
        <p className="text-sm text-ink-soft">
          Each tip records the rate it was charged. A new rate applies to tips paid from now on; earlier tips keep theirs.
        </p>
      </div>
      {error && !data ? (
        <LoadError error={problemMessage(error)} onRetry={() => void refetch()} />
      ) : !data ? (
        <Loading height="h-24" />
      ) : (
        <ul className="m-0 grid list-none p-0">
          {current.map((p) => (
            <FeeRow key={p.id} p={p} strong={p === defaultRate} />
          ))}
          {history.length ? (
            <li className="pt-2">
              <details className="text-sm">
                <summary className="cursor-pointer text-ink-soft">Earlier rates ({history.length})</summary>
                <ul className="m-0 grid list-none p-0 pt-1">
                  {history.map((p) => (
                    <FeeRow key={p.id} p={p} />
                  ))}
                </ul>
              </details>
            </li>
          ) : null}
        </ul>
      )}
      <Form
        form={form}
        resetOnSuccess
        className="grid-cols-[7rem_minmax(0,1fr)] items-start gap-2.5 border-t border-line pt-4"
        onSubmit={async (v) => {
          const p = await create({
            createFeePolicyRequest: { bps: Math.round(v.percent * 100), creatorHandle: v.creatorHandle || undefined, note: v.note },
          }).unwrap();
          toast.success(`${percent(p.bps)} now applies ${p.creator ? `to @${p.creator.handle}` : "to everyone else"}.`);
        }}
      >
        <TextField name="percent" label="New rate (%)" fieldSize="sm" type="number" inputMode="decimal" step={0.01} min={0} max={50} placeholder="10" />
        <TextField name="creatorHandle" label="For one writer" optional fieldSize="sm" placeholder="@handle, or blank for the default" autoComplete="off" />
        <TextField name="note" label="Why" optional fieldSize="sm" className="col-span-2" placeholder="e.g. Launch partner rate" autoComplete="off" />
        <FormError className="col-span-2" />
        <SubmitButton size="sm" className="col-span-2 justify-self-start" pendingLabel="Saving…">
          Add rate
        </SubmitButton>
      </Form>
    </Card>
  );
}

function FeeRow({ p, strong }: { p: FeePolicy; strong?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <div className="grid min-w-0">
        <span className={cn("truncate", strong && "font-medium")}>{p.creator ? `@${p.creator.handle ?? "writer"}` : "Default rate"}</span>
        <span className="truncate text-xs text-ink-soft">
          {p.note || (p.creator ? "Writer's own rate" : "Everyone without their own rate")} · since{" "}
          {new Date(p.effectiveFrom).getTime() < 86_400_000 ? "launch" : new Date(p.effectiveFrom).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
          {p.supersededAt ? ` · replaced ${new Date(p.supersededAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}` : ""}
        </span>
      </div>
      <span className="shrink-0 text-right tabular-nums">
        <strong>{percent(p.bps)}</strong>
        <span className="block text-xs text-ink-soft">{num(p.tips)} tips</span>
      </span>
    </li>
  );
}

/* ------------------------------------------------------------- creator fund */

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const lastMonth = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { periodStart: ymd(start), periodEnd: ymd(end) };
};

const fundSchema = z
  .object({
    periodStart: z.iso.date("Pick a start date."),
    periodEnd: z.iso.date("Pick an end date."),
    poolKes: z.number({ error: "Enter the pool in KES." }).int("Whole shillings only.").min(1, "Enter the pool in KES."),
  })
  .refine((v) => v.periodEnd >= v.periodStart, { message: "Ends before it starts.", path: ["periodEnd"] });

function CreatorFund() {
  const runs = useListCreatorFundRunsQuery();
  const [previewFund] = usePreviewCreatorFundMutation();
  const [postFund] = usePostCreatorFundMutation();
  const [preview, setPreview] = useState<CreatorFundPreview | null>(null);
  const [posting, setPosting] = useState(false);
  const form = useZodForm(fundSchema, { defaultValues: { ...lastMonth(), poolKes: undefined as unknown as number } });

  const pay = async () => {
    if (!preview) return;
    setPosting(true);
    try {
      const r = await postFund({
        creatorFundRequest: { periodStart: preview.periodStart, periodEnd: preview.periodEnd, poolKes: preview.poolKes },
      }).unwrap();
      toast.success(`${kes(r.allocatedKes)} paid to ${r.creators} writers. It's on hold, then withdrawable.`);
      setPreview(null);
    } catch (e) {
      toast.error(problemMessage(e, "Couldn't pay the fund."));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card as="section" className="grid content-start gap-4 p-4.5" aria-labelledby="fund-title">
      <div className="grid gap-1">
        <h2 id="fund-title" className="text-xl">
          Creator fund
        </h2>
        <p className="text-sm text-ink-soft">
          Split a pool between writers by qualified views: opens by other readers, of jokes still up, from writers in good standing. Each period is paid once.
        </p>
      </div>
      <Form
        form={form}
        className="grid-cols-2 items-start gap-2.5 sm:grid-cols-[1fr_1fr_8rem_auto]"
        onSubmit={async (v) => {
          setPreview(await previewFund({ creatorFundRequest: v }).unwrap());
        }}
      >
        <TextField name="periodStart" label="From" fieldSize="sm" type="date" />
        <TextField name="periodEnd" label="To" fieldSize="sm" type="date" />
        <TextField name="poolKes" label="Pool (KES)" fieldSize="sm" type="number" inputMode="numeric" min={1} step={1} placeholder="10000" />
        <SubmitButton size="sm" variant="quiet" className="self-end" pendingLabel="Working…">
          Preview split
        </SubmitButton>
        <FormError className="col-span-full" />
      </Form>

      {preview ? (
        <div className="grid gap-3 rounded-lg border border-line p-3">
          {preview.allocations.length === 0 ? (
            <p className="text-ink-soft">No qualified views in that period, so there's nothing to split.</p>
          ) : (
            <>
              <p className="text-sm">
                <strong>{num(preview.qualifiedViews)}</strong> qualified views across <strong>{preview.allocations.length}</strong> writers.
              </p>
              <ul className="m-0 grid max-h-64 list-none overflow-auto p-0">
                {preview.allocations.map((a) => (
                  <li key={a.creatorId} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-sm last:border-b-0">
                    <span className="min-w-0 truncate">
                      @{a.handle ?? "writer"} <span className="text-ink-soft">· {num(a.views)} views · {a.sharePct}%</span>
                    </span>
                    <strong className="tabular-nums">{kes(a.amountKes)}</strong>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2.5">
                <button type="button" className={button({ size: "sm" })} onClick={() => void pay()} disabled={posting} aria-busy={posting || undefined}>
                  {posting ? "Paying…" : `Pay ${kes(preview.poolKes)}`}
                </button>
                <button type="button" className={button({ variant: "ghost", size: "sm" })} onClick={() => setPreview(null)}>
                  Cancel
                </button>
                <span className="text-xs text-ink-soft">Writers are notified. Money goes on hold first, like tips.</span>
              </div>
            </>
          )}
        </div>
      ) : null}

      {runs.data?.data.length ? (
        <ul className="m-0 grid list-none border-t border-line p-0 pt-2">
          {runs.data.data.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
              <span>
                {r.periodStart} – {r.periodEnd}
                <span className="block text-xs text-ink-soft">
                  {r.creators} writers · {num(r.qualifiedViews)} views{r.createdBy ? ` · by @${r.createdBy}` : ""}
                </span>
              </span>
              <span className="text-right tabular-nums">
                <strong>{kes(r.allocatedKes)}</strong>
                <span className="block text-xs text-ink-soft">{r.releasedKes >= r.allocatedKes ? "Released" : `${kes(r.allocatedKes - r.releasedKes)} on hold`}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
