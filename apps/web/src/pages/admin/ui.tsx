import type { ReactNode } from "react";
import { shortDate } from "../../data/dates.ts";
import { button } from "@/components/ui/button.tsx";
import { Card, card, EmptyState } from "@/components/ui/card.tsx";
import { segment, segmented } from "@/components/ui/segmented.tsx";
import { skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { num } from "./lib.ts";

/* Shared building blocks for admin screens. Same tokens as the app, denser layout. */

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="text-3xl">{title}</h1>
        {description ? <p className="max-w-[44rem] text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <EmptyState role="alert">
      <p>{error}</p>
      <button type="button" className={button({ variant: "quiet", size: "sm" })} onClick={onRetry}>
        Try again
      </button>
    </EmptyState>
  );
}

export function Loading({ height = "h-40" }: { height?: string }) {
  return <div className={cn(skeleton, height, "rounded-2xl")} aria-busy="true" />;
}

const TILE_TONES = {
  plain: "",
  good: "text-forest",
  warn: "text-butter-ink-deep",
  bad: "text-tag-red-deep",
} as const;

export function StatTile({
  label,
  value,
  hint,
  tone = "plain",
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof TILE_TONES;
  to?: string;
}) {
  const body = (
    <>
      <span className="text-sm font-medium text-ink-soft">{label}</span>
      <span className={cn("text-2xl font-bold tracking-[-0.01em]", TILE_TONES[tone])}>{value}</span>
      {hint ? <span className="text-xs text-ink-soft">{hint}</span> : null}
    </>
  );
  return to ? (
    <a href={to} className={cn(card, "grid content-start gap-1 p-4 text-ink no-underline hover:border-line-strong")}>
      {body}
    </a>
  ) : (
    <div className={cn(card, "grid content-start gap-1 p-4")}>{body}</div>
  );
}

export function Tiles({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>{children}</div>;
}

/** 7 / 30 / 90 days. */
export function RangePicker({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div className={cn(segmented, "grid-cols-3")} role="radiogroup" aria-label="Period">
      {[7, 30, 90].map((d) => (
        <button key={d} type="button" role="radio" aria-checked={days === d} className={segment(days === d, "min-h-9 px-3.5")} onClick={() => onChange(d)}>
          {d} days
        </button>
      ))}
    </div>
  );
}

export interface SeriesPoint {
  date: string;
  value: number;
  /** Optional second, smaller value drawn inside the bar (e.g. opened of delivered). */
  inner?: number;
}

/**
 * A single-hue daily bar chart for any number of days. An optional inner value
 * is drawn as a darker bar inside, for part-of-whole series. Values show on
 * hover or focus, and a hidden table carries them for screen readers.
 */
export function BarChart({
  title,
  points,
  format = num,
  total,
  legend,
}: {
  title: string;
  points: SeriesPoint[];
  format?: (n: number) => string;
  total?: ReactNode;
  legend?: [string, string];
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <figure className={cn(card, "m-0 grid gap-3 px-4 pt-3.5 pb-3")}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-semibold">{title}</span>
        {total !== undefined ? <span className="text-sm font-medium text-ink-soft">{total}</span> : null}
      </figcaption>
      {legend ? (
        <div className="flex gap-4 text-xs font-medium text-ink-soft" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-sky" /> {legend[0]}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-denim" /> {legend[1]}
          </span>
        </div>
      ) : null}
      <div className="grid h-36 items-end gap-px border-b border-line" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {points.map((p) => (
          <div key={p.date} className="group relative flex h-full items-end">
            <div
              className={cn("relative w-full rounded-t-[3px]", legend ? "bg-sky" : "bg-denim group-hover:bg-denim-deep")}
              style={{ height: `${Math.max(p.value ? 3 : 0, (p.value / max) * 100)}%` }}
            >
              {p.inner !== undefined ? (
                <div className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-denim group-hover:bg-denim-deep" style={{ height: `${p.value ? (p.inner / p.value) * 100 : 0}%` }} />
              ) : null}
            </div>
            <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-on-ink opacity-0 transition-opacity duration-120 group-first:left-0 group-first:translate-x-0 group-last:right-0 group-last:left-auto group-last:translate-x-0 group-hover:opacity-100">
              {shortDate(p.date)}: <strong>{format(p.value)}</strong>
              {p.inner !== undefined && legend ? ` · ${legend[1]} ${format(p.inner)}` : null}
            </span>
          </div>
        ))}
      </div>
      {points.length ? (
        <div className="flex justify-between text-xs text-ink-faint" aria-hidden="true">
          <span>{shortDate(points[0].date)}</span>
          <span>{shortDate(points.at(-1)!.date)}</span>
        </div>
      ) : null}
      {/* sr-only goes on a wrapper: on the table itself the <caption> escapes the clip and paints over the title. */}
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <th scope="row">{shortDate(p.date)}</th>
                <td>{format(p.value)}</td>
                {p.inner !== undefined ? <td>{format(p.inner)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Horizontal bars for a small breakdown (streak buckets, reactions). */
export function Breakdown({ title, rows, format = num }: { title: string; rows: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card as="section" className="grid content-start gap-3 p-4">
      <h2 className="text-lg">{title}</h2>
      <ul className="m-0 grid list-none gap-2 p-0">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
            <span className="font-medium">{r.label}</span>
            <span className="h-3 rounded-full bg-fridge">
              <span className="block h-full rounded-full bg-denim" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="w-14 text-right font-medium text-ink-soft tabular-nums">{format(r.value)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
