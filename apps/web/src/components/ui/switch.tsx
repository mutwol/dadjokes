import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils.ts";

/** An on/off switch. Label it with `aria-label` or `aria-labelledby`. */
export function Switch({
  checked,
  className,
  ...props
}: { checked: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role" | "type">) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        "group h-8 w-13 shrink-0 rounded-full border-0 bg-line-strong p-0.75 transition-colors duration-160 aria-checked:bg-lawn",
        className,
      )}
      {...props}
    >
      <span className="block size-6.5 rounded-full bg-white shadow-knob transition-[translate] duration-160 ease-out group-aria-checked:translate-x-5" />
    </button>
  );
}
