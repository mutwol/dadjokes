import { useMemo, useState } from "react";
import { Link } from "react-router";
import { problemMessage, useGetAdminEngagementQuery } from "../../api/rtk/index.ts";
import type { AdminEngagement as Engagement } from "../../api/rtk/index.ts";
import { DataTable, columnsFor, useDataTableState } from "../../components/table/index.ts";
import { shortDate } from "../../data/dates.ts";
import { BarChart, Breakdown, LoadError, Loading, PageHeader, RangePicker, StatTile, Tiles } from "./ui.tsx";
import { num, pct } from "./lib.ts";

type TopJoke = Engagement["topJokes"][number];
const jokeCol = columnsFor<TopJoke>();
const REACTION_LABEL: Record<string, string> = { laugh: "Laughs", groan: "Groans", facepalm: "Facepalms", drum: "Drum rolls" };

/** Opens, streaks, the jokes that landed best, and how readers reacted. */
export function AdminEngagement() {
  const [days, setDays] = useState(30);
  const { data, error, refetch, isFetching } = useGetAdminEngagementQuery({ days });
  return (
    <>
      <PageHeader title="Engagement" description="Are people opening their joke, and which ones land?" actions={<RangePicker days={days} onChange={setDays} />} />
      {error && !data ? (
        <LoadError error={problemMessage(error)} onRetry={() => void refetch()} />
      ) : !data ? (
        <Loading height="h-96" />
      ) : (
        <div className="grid gap-6 transition-opacity duration-160" style={{ opacity: isFetching ? 0.6 : 1 }}>
          <EngagementBody data={data} />
        </div>
      )}
    </>
  );
}

const count = (key: "opens" | "reactions" | "comments" | "shares", label: string) =>
  jokeCol.accessor(key, { header: label, sortFn: "basic", meta: { label, align: "right", className: "tabular-nums" }, cell: ({ getValue }) => num(getValue()) });

function EngagementBody({ data }: { data: Engagement }) {
  const delivered = data.daily.reduce((n, d) => n + d.delivered, 0);
  const opened = data.daily.reduce((n, d) => n + d.opened, 0);
  const reactions = data.daily.reduce((n, d) => n + d.reactions, 0);
  const comments = data.daily.reduce((n, d) => n + d.comments, 0);
  const jokes = useDataTableState({ id: "engagement-jokes", prefix: "j.", defaultSort: [{ id: "reactions", desc: true }], defaultPageSize: 10 });
  const jokeColumns = useMemo(
    () => [
      jokeCol.accessor((j) => `${j.preview} @${j.handle}`, {
        id: "joke",
        header: "Joke",
        meta: { label: "Joke", alwaysVisible: true },
        cell: ({ row: { original: j } }) => (
          <div className="grid min-w-48">
            <Link to={`/joke/${j.id}`} className="font-medium text-ink no-underline hover:underline">
              {j.preview || "Image joke"}
            </Link>
            <span className="text-xs text-ink-soft">
              @{j.handle}
              {j.deliverOn ? ` · ${shortDate(j.deliverOn)}` : ""}
            </span>
          </div>
        ),
      }),
      count("opens", "Opens"),
      count("reactions", "Reactions"),
      count("comments", "Comments"),
      count("shares", "Shares"),
    ],
    [],
  );
  const streakers = data.streakBuckets.filter((b) => b.label !== "None").reduce((n, b) => n + b.readers, 0);
  return (
    <>
      <Tiles>
        <StatTile label="Delivered" value={num(delivered)} />
        <StatTile label="Opened" value={num(opened)} hint={delivered ? `${pct(opened / delivered)} of delivered` : undefined} />
        <StatTile label="Reactions · comments" value={`${num(reactions)} · ${num(comments)}`} />
        <StatTile label="Readers on a streak" value={num(streakers)} hint={`${num(data.automation.messages)} automated messages sent`} />
      </Tiles>

      <BarChart
        title="Delivered and opened, per day"
        points={data.daily.map((d) => ({ date: d.date, value: d.delivered, inner: d.opened }))}
        legend={["Delivered", "Opened"]}
        total={delivered ? `${pct(opened / delivered)} opened` : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="Readers by current streak" rows={data.streakBuckets.map((b) => ({ label: b.label, value: b.readers }))} />
        <Breakdown
          title="Reactions"
          rows={Object.entries(REACTION_LABEL).map(([k, label]) => ({ label, value: data.reactions[k] ?? 0 }))}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="grid min-w-0 content-start gap-2.5" aria-labelledby="top-jokes">
          <h2 id="top-jokes" className="text-xl">
            Jokes that landed
          </h2>
          <DataTable
            caption="Jokes that landed"
            height="28rem"
            data={data.topJokes}
            columns={jokeColumns}
            getRowId={(j) => j.id}
            state={jokes}
            searchPlaceholder="Search jokes or @writer"
            noun={["joke", "jokes"]}
            emptyMessage="No stats for this period yet."
          />
        </section>
        <section className="grid content-start gap-2.5" aria-labelledby="top-streaks">
          <h2 id="top-streaks" className="text-xl">
            Longest streaks
          </h2>
          <ol className="m-0 grid list-none gap-1.5 p-0">
            {data.topStreaks.length ? (
              data.topStreaks.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2">
                  <span className="w-5 text-right font-marker text-ink-soft">{i + 1}</span>
                  <Link to={`/admin/people/${s.id}`} className="flex-1 font-medium text-ink">
                    {s.name}
                  </Link>
                  <span className="font-semibold tabular-nums">{s.streak} days</span>
                </li>
              ))
            ) : (
              <li className="text-ink-soft">No streaks yet.</li>
            )}
          </ol>
        </section>
      </div>
    </>
  );
}
