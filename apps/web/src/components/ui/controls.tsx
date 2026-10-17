import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";

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
        "rounded-full border-2 font-bold disabled:cursor-not-allowed disabled:opacity-45",
        size === "md" ? "min-h-9 px-3.5 text-sm" : "min-h-11 px-4.5 text-base",
        on ? "border-ink bg-ink text-white" : "border-line-strong bg-paper",
        className,
      )}
      {...props}
    />
  );
}

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

const PILL_TONES = {
  review: "bg-butter text-butter-ink",
  scheduled: "bg-sky text-denim",
  delivered: "bg-mint text-forest",
  muted: "bg-fridge text-ink-soft",
} as const;

/** A small rounded label: joke status, report reasons. */
export function Pill({
  tone,
  className,
  ...props
}: { tone: keyof typeof PILL_TONES } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-extrabold", PILL_TONES[tone], className)} {...props} />
  );
}

/** Red unread count, e.g. on the Activity link. */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "ml-auto inline-grid h-5 min-w-5 place-items-center rounded-full bg-tag-red px-1.5 text-xs font-extrabold text-white",
        className,
      )}
      aria-label={`${count} new`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Red dot on an icon button when there's something new. */
export function DotBadge() {
  return (
    <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-tag-red shadow-[0_0_0_2px_var(--color-paper)]" />
  );
}

const TOAST_PLACEMENT = {
  /** Above the phone tab bar; near the bottom on desktop. */
  shell: "fixed bottom-[calc(var(--spacing-nav)+20px+env(safe-area-inset-bottom))] lg:bottom-8",
  /** Screens without a tab bar. */
  bottom: "fixed bottom-[calc(24px+env(safe-area-inset-bottom))]",
  /** Inside the full-screen viewer, under its top bar. */
  viewer: "absolute top-18",
} as const;

/** A short confirmation message. Rendered by whatever screen owns the toast state. */
export function Toast({
  children,
  placement = "shell",
}: {
  children: ReactNode;
  placement?: keyof typeof TOAST_PLACEMENT;
}) {
  return (
    <div
      role="status"
      className={cn(
        "inset-x-0 z-100 mx-auto w-fit max-w-[calc(100%-32px)] animate-toast-in rounded-full bg-ink px-4.5 py-2.5 text-center text-sm font-bold text-white",
        TOAST_PLACEMENT[placement],
      )}
    >
      {children}
    </div>
  );
}
