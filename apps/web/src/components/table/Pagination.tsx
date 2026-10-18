import { Icon } from "@/components/ui/icon.tsx";
import { cn } from "@/lib/utils.ts";
import { Spinner } from "@/components/ui/spinner.tsx";
import { PAGE_SIZES, pageWindow } from "./paging.ts";

const n = new Intl.NumberFormat("en-KE");

const navButton =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border-0 bg-transparent px-2 text-sm tabular-nums text-ink-soft transition-colors duration-120 hover:bg-fridge hover:text-ink disabled:pointer-events-none disabled:opacity-40";

export function Pagination({
  page,
  pageSize,
  total,
  noun = ["row", "rows"],
  fetching,
  selected = 0,
  onPageChange,
  onPageSizeChange,
}: {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  noun?: [string, string];
  fetching?: boolean;
  selected?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), pageCount);
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);
  const sizes = PAGE_SIZES.includes(pageSize) ? PAGE_SIZES : [...PAGE_SIZES, pageSize].sort((a, b) => a - b);

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-3 py-2 text-sm text-ink-soft">
      <p className="flex items-center gap-2 tabular-nums" aria-live="polite">
        {selected ? <span className="font-medium text-ink">{n.format(selected)} selected ·</span> : null}
        {total === 0 ? `No ${noun[1]}` : `${n.format(first)}–${n.format(last)} of ${n.format(total)} ${total === 1 ? noun[0] : noun[1]}`}
        {fetching ? <Spinner className="text-ink-faint" /> : null}
      </p>
      <div className="flex items-center gap-3">
        <label className="hidden items-center gap-2 sm:flex">
          <span className="whitespace-nowrap">Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="min-h-8 rounded-md border border-line-strong bg-paper px-2 text-sm text-ink outline-none focus:border-focus"
          >
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-0.5">
          <button type="button" className={navButton} disabled={current <= 1} onClick={() => onPageChange(current - 1)} aria-label="Previous page">
            <Icon name="prev" size={16} />
          </button>
          {pageWindow(current, pageCount).map((x, i) =>
            x === null ? (
              <span key={`gap-${i}`} className="px-1 text-ink-faint" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={x}
                type="button"
                onClick={() => onPageChange(x)}
                aria-current={x === current ? "page" : undefined}
                aria-label={`Page ${x}`}
                className={cn(navButton, x === current && "bg-fridge font-medium text-ink")}
              >
                {x}
              </button>
            ),
          )}
          <button type="button" className={navButton} disabled={current >= pageCount} onClick={() => onPageChange(current + 1)} aria-label="Next page">
            <Icon name="chevron" size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
