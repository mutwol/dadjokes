import { useMemo, useState } from "react";
import { Link } from "react-router";
import { downloadFile } from "../../api/download.ts";
import { problemMessage, useGetAdminFinanceQuery } from "../../api/rtk/index.ts";
import type { AdminFinance as Finance } from "../../api/rtk/index.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { button } from "@/components/ui/button.tsx";
import { Icon } from "@/components/ui/icon.tsx";
import { toast } from "@/components/ui/toast.tsx";
import { DataTable, columnsFor, useDataTableState } from "../../components/table/index.ts";
import { timeAgo } from "../../data/dates.ts";
import { MoneyControls } from "./FinanceControls.tsx";
import { BarChart, LoadError, Loading, PageHeader, RangePicker, StatTile, Tiles } from "./ui.tsx";
import { kes, num } from "./lib.ts";

type Writer = Finance["topWriters"][number];
type Payout = Finance["payouts"][number];

const PAYOUT_TONE: Record<Payout["status"], "green" | "blue" | "red"> = {
  requested: "blue",
  processing: "blue",
  paid: "green",
  failed: "red",
};

/** Tips in, fees kept, payouts out and what's still owed, straight from the ledger. */
export function AdminFinance() {
  const [days, setDays] = useState(30);
  const [exporting, setExporting] = useState(false);
  const { data, error, refetch, isFetching } = useGetAdminFinanceQuery({ days });

  const exportCsv = async () => {
    setExporting(true);
    const ok = await downloadFile(`/v1/admin/finance/ledger.csv?days=${days}`, `daddy-jokes-ledger-${days}d.csv`);
    setExporting(false);
    if (!ok) toast.error("Couldn't export the ledger.");
  };

  return (
    <>
      <PageHeader
        title="Money"
        description="Every number here comes from the double-entry ledger, so it always adds up."
        actions={
          <>
            <RangePicker days={days} onChange={setDays} />
            <button type="button" className={button({ variant: "quiet", size: "sm" })} onClick={() => void exportCsv()} disabled={exporting} aria-busy={exporting || undefined}>
              <Icon name="download" size={16} /> {exporting ? "Exporting…" : "Ledger CSV"}
            </button>
          </>
        }
      />
      {error && !data ? (
        <LoadError error={problemMessage(error)} onRetry={() => void refetch()} />
      ) : !data ? (
        <Loading height="h-96" />
      ) : (
        <div className="grid gap-6 transition-opacity duration-160" style={{ opacity: isFetching ? 0.6 : 1 }}>
          <FinanceBody data={data} />
        </div>
      )}
      <MoneyControls />
    </>
  );
}

const writerCol = columnsFor<Writer>();
const payoutCol = columnsFor<Payout>();

function FinanceBody({ data }: { data: Finance }) {
  const t = data.totals;
  const writers = useDataTableState({ id: "finance-writers", prefix: "w.", defaultSort: [{ id: "tipsKes", desc: true }], defaultPageSize: 10 });
  const payouts = useDataTableState({ id: "finance-payouts", prefix: "p.", filterKeys: ["status"], defaultSort: [{ id: "createdAt", desc: true }], defaultPageSize: 10 });
  const writerColumns = useMemo(
    () => [
      writerCol.accessor("name", {
        header: "Writer",
        sortFn: "alphanumeric",
        meta: { label: "Writer", alwaysVisible: true },
        footer: "Total",
        cell: ({ row: { original: w } }) => (
          <div className="grid">
            <Link to={`/admin/people/${w.id}`} className="font-medium text-ink no-underline hover:underline">
              {w.name}
            </Link>
            <span className="text-xs text-ink-soft">@{w.handle}</span>
          </div>
        ),
      }),
      writerCol.accessor("tipsKes", {
        header: "Tips",
        // Totals for whatever the search currently shows; stays pinned under the rows.
        footer: ({ table }) => kes(table.getFilteredRowModel().rows.reduce((n, r) => n + r.original.tipsKes, 0)),
        sortFn: "basic",
        meta: { label: "Tips", align: "right", className: "tabular-nums" },
        cell: ({ row: { original: w } }) => (
          <>
            {kes(w.tipsKes)}
            <span className="block text-xs text-ink-soft">{w.tips} tips</span>
          </>
        ),
      }),
      writerCol.accessor("balanceKes", {
        header: "Balance",
        sortFn: "basic",
        meta: { label: "Balance", align: "right", className: "tabular-nums" },
        cell: ({ getValue }) => kes(getValue()),
        footer: ({ table }) => kes(table.getFilteredRowModel().rows.reduce((n, r) => n + r.original.balanceKes, 0)),
      }),
    ],
    [],
  );
  const payoutColumns = useMemo(
    () => [
      payoutCol.accessor("handle", { header: "Writer", sortFn: "alphanumeric", meta: { label: "Writer", alwaysVisible: true }, cell: ({ getValue }) => `@${getValue()}`, footer: "Total" }),
      payoutCol.accessor("amountKes", {
        header: "Amount",
        sortFn: "basic",
        meta: { label: "Amount", align: "right", className: "tabular-nums" },
        cell: ({ getValue }) => kes(getValue()),
        footer: ({ table }) => kes(table.getFilteredRowModel().rows.reduce((n, r) => n + r.original.amountKes, 0)),
      }),
      payoutCol.accessor("status", {
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row: { original: p } }) => (
          <>
            <Badge tone={PAYOUT_TONE[p.status]}>{p.status}</Badge>
            {p.status === "failed" && p.resultDesc ? <span className="block pt-1 text-xs text-ink-soft">{p.resultDesc}</span> : null}
          </>
        ),
      }),
      payoutCol.accessor("createdAt", { header: "Requested", sortFn: "datetime", meta: { label: "Requested", className: "whitespace-nowrap text-ink-soft" }, cell: ({ getValue }) => timeAgo(getValue()) }),
    ],
    [],
  );
  return (
    <>
      <Tiles>
        <StatTile label="Tips received" value={kes(t.tipsKes)} hint={`${num(t.tipCount)} tips, ${num(t.tipsFailed)} failed or cancelled`} />
        <StatTile label="Platform fees" value={kes(t.feesKes)} tone="good" hint="Our share of tips" />
        <StatTile label="Earned by writers" value={kes(t.writerEarningsKes)} />
        <StatTile label="Paid out" value={kes(t.payoutsPaidKes)} hint={t.payoutsFailed ? `${t.payoutsFailed} failed (refunded to balances)` : "To writers' M-Pesa"} tone={t.payoutsFailed ? "warn" : "plain"} />
        <StatTile label="Owed to writers now" value={kes(t.owedToWritersKes)} hint="Available and on hold, all writers" />
        <StatTile label="Payouts in flight" value={kes(t.payoutsPendingKes)} tone={t.payoutsPendingKes ? "warn" : "plain"} />
        <StatTile label="M-Pesa net (all time)" value={kes(t.clearingKes)} hint="Tips in minus payouts out" />
        <StatTile label="Average tip" value={t.tipCount ? kes(Math.round(t.tipsKes / t.tipCount)) : "—"} />
      </Tiles>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart
          title="Tips and fees"
          points={data.series.map((d) => ({ date: d.date, value: d.tipsKes, inner: d.feesKes }))}
          legend={["Tips", "Platform fee"]}
          format={kes}
          total={kes(t.tipsKes)}
        />
        <BarChart title="Payouts sent" points={data.series.map((d) => ({ date: d.date, value: d.payoutsKes }))} format={kes} total={kes(t.payoutsPaidKes)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <section className="grid min-w-0 content-start gap-2.5" aria-labelledby="top-writers">
          <h2 id="top-writers" className="text-xl">
            Top earning writers
          </h2>
          <DataTable
            caption="Top earning writers"
            height="24rem"
            data={data.topWriters}
            columns={writerColumns}
            getRowId={(w) => w.id}
            state={writers}
            searchPlaceholder="Search writers"
            noun={["writer", "writers"]}
            emptyMessage="No tips in this period."
          />
        </section>
        <section className="grid min-w-0 content-start gap-2.5" aria-labelledby="payouts">
          <h2 id="payouts" className="text-xl">
            Recent payouts
          </h2>
          <DataTable
            caption="Recent payouts"
            height="24rem"
            data={data.payouts}
            columns={payoutColumns}
            getRowId={(p) => p.id}
            state={payouts}
            facets={[{ id: "status", label: "Status", options: (["requested", "processing", "paid", "failed"] as const).map((v) => ({ value: v, label: v })) }]}
            searchPlaceholder="Search @handle"
            noun={["payout", "payouts"]}
            emptyMessage="No payouts yet."
          />
        </section>
      </div>
    </>
  );
}
