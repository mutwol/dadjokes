import { cn } from "@/lib/utils.ts";

/**
 * A selectable tile: role cards, radio rows, time slots, tip amounts. Selected tiles get
 * an ink border and, unless `tint` is off, a cream fill. The hidden input inside drives
 * the focus ring.
 */
export function choice(on: boolean, { tint = true, className }: { tint?: boolean; className?: string } = {}) {
  return cn(
    "cursor-pointer border bg-paper transition-[border-color,background-color,box-shadow] duration-120 has-focus-visible:shadow-focus",
    on ? cn("border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]", tint && "bg-cream") : "border-line-strong hover:border-ink-faint",
    className,
  );
}
