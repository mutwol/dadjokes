import { Link } from "react-router";
import { problemMessage, useGetAdminOverviewQuery } from "../../api/rtk/index.ts";
import { button } from "@/components/ui/button.tsx";
import { BarChart, LoadError, Loading, PageHeader, StatTile, Tiles } from "./ui.tsx";
import { kes, num, pct } from "./lib.ts";

/** Today at a glance, with the things that need someone's attention first. */
export function AdminOverview() {
  // Refreshes every minute while the tab is visible, and on focus: it's the "is anything on fire" page.
  const { data, error, refetch } = useGetAdminOverviewQuery(undefined, { pollingInterval: 60_000, skipPollingIfUnfocused: true, refetchOnFocus: true });

  if (error && !data) return <LoadError error={problemMessage(error)} onRetry={() => void refetch()} />;
  if (!data) {
    return (
      <>
        <PageHeader title="Overview" />
        <Loading height="h-80" />
      </>
    );
  }
  const attention = [
    data.moderation.hidden ? { text: `${data.moderation.hidden} hidden after reports, waiting for a decision`, to: "/admin/moderation" } : null,
    data.moderation.openReports ? { text: `${data.moderation.openReports} open reports`, to: "/admin/moderation" } : null,
    data.moderation.openAppeals ? { text: `${data.moderation.openAppeals} appeals from writers`, to: "/admin/moderation?tab=appeals" } : null,
    data.queue.daysWithoutPick ? { text: `${data.queue.daysWithoutPick} of the next 7 days have no joke picked`, to: "/curate" } : null,
    data.queue.inReview ? { text: `${data.queue.inReview} jokes waiting for curators`, to: "/curate" } : null,
  ].filter((x): x is { text: string; to: string } => x !== null);

  return (
    <>
      <PageHeader title="Overview" description="How Daddy Jokes is doing today, and what needs attention." />

      {attention.length ? (
        <section className="grid gap-2 rounded-2xl border border-cream-edge bg-cream p-4" aria-labelledby="attention-title">
          <h2 id="attention-title" className="text-lg">
            Needs attention
          </h2>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {attention.map((a) => (
              <li key={a.text} className="flex flex-wrap items-center justify-between gap-2">
                <span>{a.text}</span>
                <Link to={a.to} className={button({ variant: "quiet", size: "sm" })}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Tiles>
        <StatTile label="People" value={num(data.people.total)} hint={`${num(data.people.new7d)} new this week`} />
        <StatTile label="Opened (24h)" value={num(data.today.opened)} hint={`of ${num(data.today.delivered)} delivered`} />
        <StatTile
          label="Open rate (7 days)"
          value={pct(data.today.openRate7d)}
          tone={data.today.openRate7d >= 0.6 ? "good" : data.today.openRate7d < 0.35 ? "bad" : "plain"}
          hint="Delivered jokes that were opened"
        />
        <StatTile label="Streaks of 3+ days" value={num(data.streaks.active3plus)} hint={`Longest: ${data.streaks.longest} days`} />
        <StatTile label="Tips (30 days)" value={kes(data.money.tips30dKes)} hint={`${kes(data.money.tips24hKes)} in the last 24h`} />
        <StatTile label="Platform fees (30 days)" value={kes(data.money.fees30dKes)} />
        <StatTile label="Owed to writers" value={kes(data.money.owedToWritersKes)} hint="Balances not yet withdrawn" />
        <StatTile
          label="Readers · writers"
          value={`${num(data.people.readers)} · ${num(data.people.writers)}`}
          hint={data.people.suspended ? `${data.people.suspended} suspended` : undefined}
        />
      </Tiles>

      <div className="grid gap-4 lg:grid-cols-3">
        <BarChart title="Jokes opened" points={data.series.map((d) => ({ date: d.date, value: d.opens }))} total={`${num(data.series.reduce((n, d) => n + d.opens, 0))} in 30 days`} />
        <BarChart title="Sign-ups" points={data.series.map((d) => ({ date: d.date, value: d.signups }))} total={`${num(data.series.reduce((n, d) => n + d.signups, 0))} in 30 days`} />
        <BarChart title="Tips" points={data.series.map((d) => ({ date: d.date, value: d.tipsKes }))} format={kes} total={kes(data.series.reduce((n, d) => n + d.tipsKes, 0))} />
      </div>
    </>
  );
}
