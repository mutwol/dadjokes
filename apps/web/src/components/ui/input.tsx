import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Text fields come in three sizes:
 * - `md`: the standard field in forms (Create).
 * - `lg`: the roomy field in onboarding.
 * - `sm`: compact fields inside cards (curation, tips).
 * `pill` is the rounded select used inline in settings rows.
 */
const FIELD = {
  md: "min-h-10 w-full px-3 py-2 text-base",
  lg: "min-h-12 w-full px-3.5 text-base",
  sm: "min-h-8 px-2.5 py-1 text-sm",
  pill: "min-h-8 px-2.5 text-sm",
} as const;

export type FieldSize = keyof typeof FIELD;

/** The field look for inputs, textareas and selects. */
export function field(size: FieldSize = "md", className?: string) {
  return cn(
    "rounded-md border border-line-strong bg-paper text-ink placeholder:text-ink-faint",
    "transition-[border-color,box-shadow] duration-120 hover:border-ink-faint",
    "focus:border-focus focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-focus)_22%,transparent)] focus:outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-focus)_22%,transparent)]",
    "disabled:cursor-not-allowed disabled:bg-fridge disabled:text-ink-faint",
    "aria-invalid:border-tag-red aria-invalid:focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-tag-red)_20%,transparent)]",
    FIELD[size],
    className,
  );
}

export function Input({
  fieldSize = "md",
  className,
  ...props
}: { fieldSize?: FieldSize } & InputHTMLAttributes<HTMLInputElement>) {
  return <input className={field(fieldSize, className)} {...props} />;
}
