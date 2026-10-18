import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils.ts";

/** A toggleable topic chip. */
export function Chip({
  on,
  size = "md",
  className,
  type = "button",
  ...props
}: { on: boolean; size?: "md" | "lg" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-pressed={on}
      className={cn(
        "rounded-md border font-medium transition-colors duration-120 disabled:cursor-not-allowed disabled:opacity-45",
        size === "md" ? "min-h-8 px-3 text-sm" : "min-h-10 px-4 text-sm",
        on ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-paper text-ink hover:border-ink-faint",
        className,
      )}
      {...props}
    />
  );
}
