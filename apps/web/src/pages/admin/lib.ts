import { card } from "@/components/ui/card.tsx";
import { cn } from "@/lib/utils.ts";

/* Formatting and table styles shared by admin screens. Data comes from RTK Query (api/rtk). */

export const kes = (n: number) => `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
export const num = (n: number) => n.toLocaleString("en-KE");
export const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Table styles for the admin tables not yet on <DataTable> (components/table). Same
 * look: quiet header, hairline rows, tabular numbers. Prefer DataTable for new tables.
 */
export const table = {
  wrap: cn(card, "overflow-x-auto"),
  table: "w-full border-collapse text-left text-sm",
  th: "border-b border-line bg-fridge px-4 py-2.5 text-xs font-medium whitespace-nowrap text-ink-soft",
  td: "border-b border-line px-4 py-3 align-middle last:border-b-0",
  row: "bg-paper transition-colors duration-120 hover:bg-fridge/70 [&:last-child>td]:border-b-0",
};

export const WORKFLOW_STATUS = {
  active: { tone: "green", label: "On" },
  paused: { tone: "grey", label: "Paused" },
  draft: { tone: "yellow", label: "Draft" },
} as const;

export const RUN_TONE: Record<string, "green" | "blue" | "yellow" | "red" | "grey"> = {
  completed: "green",
  running: "blue",
  waiting: "yellow",
  failed: "red",
  stopped: "grey",
  ok: "green",
  skipped: "yellow",
};
