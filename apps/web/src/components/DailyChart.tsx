import { shortDate } from "../data/dates.ts";
import "./DailyChart.css";

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
    <figure className="dchart">
      <figcaption className="dchart-head">
        <span className="dchart-title">{title}</span>
        <span className="dchart-total">
          {total} {unit}
        </span>
      </figcaption>
      <div className="dchart-plot" aria-hidden="true">
        {days.map((d) => (
          <div key={d.date} className="dchart-col" tabIndex={-1}>
            <div className="dchart-bar" style={{ height: `${Math.max(d.value ? 4 : 0, (d.value / max) * 100)}%` }} />
            <span className="dchart-tip">
              {shortDate(d.date)}: <strong>{d.value}</strong>
            </span>
          </div>
        ))}
      </div>
      <div className="dchart-axis" aria-hidden="true">
        <span>{shortDate(days[0].date)}</span>
        <span>{shortDate(days.at(-1)!.date)}</span>
      </div>
      <table className="visually-hidden">
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
