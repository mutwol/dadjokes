import { cn } from "@/lib/utils.ts";

/** The checkbox look used in menus and the selection column. */
export function CheckMark({ on, indeterminate, radio }: { on: boolean; indeterminate?: boolean; radio?: boolean }) {
  if (radio)
    return (
      <span aria-hidden="true" className={cn("grid size-4 shrink-0 place-items-center rounded-full border transition-colors duration-120", on ? "border-ink" : "border-line-strong bg-paper")}>
        {on ? <span className="size-2 rounded-full bg-ink" /> : null}
      </span>
    );
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors duration-120",
        on || indeterminate ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-paper",
      )}
    >
      {indeterminate ? (
        <svg viewBox="0 0 12 12" width="10" height="10"><path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      ) : on ? (
        <svg viewBox="0 0 12 12" width="10" height="10"><path d="m2.5 6.2 2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : null}
    </span>
  );
}
