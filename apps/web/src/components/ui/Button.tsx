import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils.ts";

const BUTTON_VARIANTS = {
  /** The one main action on a screen, and the confirm button of a destructive dialog. */
  primary:
    "bg-tag-red text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.12)] hover:bg-tag-red-hover disabled:bg-line-strong disabled:text-ink-faint disabled:shadow-none",
  /** Secondary actions: a hairline outline on the surface colour. */
  quiet: "border-line-strong bg-paper text-ink hover:border-ink-faint hover:bg-fridge",
  /** Tertiary: no chrome until hovered (toolbars, table actions). */
  ghost: "bg-transparent text-ink-soft hover:bg-ink/6 hover:text-ink",
  /** Opens a destructive confirmation: suspend, delete, take down. */
  danger: "border-tag-red/40 bg-paper text-tag-red-deep hover:border-tag-red hover:bg-tag-red/8",
  /** On a coloured joke background. */
  light: "theme-light bg-white text-ink hover:bg-fridge",
  /** On the yellow joke background, where white would disappear. */
  dark: "bg-ink text-on-ink",
} as const;

const BUTTON_SIZES = {
  sm: "min-h-8 px-3 text-sm",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
} as const;

export interface ButtonStyle {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  block?: boolean;
  className?: string;
}

/** A button look for any element: `<Link className={button({ variant: "quiet" })}>`. */
export function button({ variant = "primary", size = "md", block, className }: ButtonStyle = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent font-medium whitespace-nowrap no-underline select-none",
    "transition-[background-color,border-color,color,scale] duration-120 ease-out active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-60 aria-busy:cursor-progress aria-busy:opacity-80",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    block && "w-full",
    className,
  );
}

/** A square, 40px icon-only button. */
export function iconButton(tone: "ink" | "white" = "ink", className?: string) {
  return cn(
    "grid size-10 place-items-center rounded-md border-0 bg-transparent transition-colors duration-120",
    tone === "ink" ? "text-ink hover:bg-ink/6" : "text-inherit hover:bg-white/15",
    className,
  );
}

/** An underlined, text-only action ("Use a different email", "Report"). */
export const textButton =
  "justify-self-start border-0 bg-transparent p-0 text-sm font-medium text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink";

/*
 * The components spread every prop onto the <button>, `ref` included, so they can be
 * a Base UI trigger: `<PopoverTrigger render={<Button variant="quiet" />} />`.
 */

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: ButtonStyle & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={button({ variant, size, block, className })} {...props} />;
}

/** A square, 40px icon-only button. Always give it an `aria-label`. */
export function IconButton({
  tone = "ink",
  className,
  type = "button",
  ...props
}: { tone?: "ink" | "white" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={iconButton(tone, className)} {...props} />;
}

export function TextButton({ className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn(textButton, className)} {...props} />;
}
