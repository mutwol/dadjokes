import { shortDate } from "../data/dates.ts";
import { card, cn } from "./ui/index.ts";

interface Day {
  date: string;
  value: number;
}

/**
 * A small single-series bar chart for the last couple of weeks. One hue, the
 * title names the series, each bar shows its value on hover or focus, and a
 * hidden table carries the same numbers for screen readers.
 */
export function DailyChart({ title, days, unit }: { title: string; days: Day[]; unit: string }) {
  const max = Math.max(1, ...days.map((d) => d.value));
  const total = days.reduce((n, d) => n + d.value, 0);
  return (
    <figure className={cn(card, "m-0 grid gap-2.5 px-4 pt-3.5 pb-2.5")}>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-extrabold">{title}</span>
        <span className="text-sm font-bold text-ink-soft">
          {total} {unit}
        </span>
      </figcaption>
      <div className="grid h-24 grid-cols-14 items-end gap-0.5 border-b border-line" aria-hidden="true">
        {days.map((d) => (
          <div key={d.date} className="group relative flex h-full items-end outline-none" tabIndex={-1}>
            <div className="w-full rounded-t-sm bg-denim group-hover:bg-denim-deep" style={{ height: `${Math.max(d.value ? 4 : 0, (d.value / max) * 100)}%` }} />
            <span
              className={cn(
                "pointer-events-none absolute bottom-[calc(100%+6px)] z-1 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity duration-120 group-hover:opacity-100",
                "left-1/2 -translate-x-1/2 group-first:left-0 group-first:translate-x-0 group-last:right-0 group-last:left-auto group-last:translate-x-0",
              )}
            >
              {shortDate(d.date)}: <strong>{d.value}</strong>
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-ink-faint" aria-hidden="true">
        <span>{shortDate(days[0].date)}</span>
        <span>{shortDate(days.at(-1)!.date)}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{shortDate(d.date)}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
