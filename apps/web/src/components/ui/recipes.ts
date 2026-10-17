import { cn } from "./cn.ts";

/*
 * Class-name recipes for the shared look of buttons, fields and cards. Components in
 * this folder use them, and so can any element that isn't a component: a router <Link>
 * styled as a button, a <section> styled as a card.
 */

/* ------------------------------------------------------------------ Buttons */

const BUTTON_VARIANTS = {
  /** The one main action on a screen. */
  primary:
    "bg-tag-red text-white hover:bg-tag-red-deep disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-paper",
  /** Secondary actions: an outline that darkens on hover. */
  quiet: "border-line-strong bg-transparent text-ink hover:border-ink",
  /** On a coloured joke background. */
  light: "bg-white text-ink hover:bg-fridge",
  /** On the yellow joke background, where white would disappear. */
  dark: "bg-ink text-white",
} as const;

const BUTTON_SIZES = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4.5",
  lg: "min-h-13 px-4.5",
} as const;

export interface ButtonStyle {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
  block?: boolean;
  className?: string;
}

/** A pill button: `<Link className={button({ variant: "quiet" })}>`. */
export function button({ variant = "primary", size = "md", block, className }: ButtonStyle = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full border-2 border-transparent font-bold no-underline",
    "transition-[scale,background-color] duration-120 ease-out active:scale-97",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    block && "w-full",
    className,
  );
}

/** A round, 44px icon-only button. */
export function iconButton(tone: "ink" | "white" = "ink", className?: string) {
  return cn(
    "grid size-11 place-items-center rounded-full border-0 bg-transparent",
    tone === "ink" ? "text-ink hover:bg-ink/6" : "text-inherit hover:bg-white/15",
    className,
  );
}

/** An underlined, text-only action ("Use a different email", "Report"). */
export const textButton =
  "justify-self-start border-0 bg-transparent p-0 text-sm font-extrabold text-ink underline underline-offset-3";

/* ------------------------------------------------------------------- Surfaces */

/** The white, hairline-bordered surface used for panels, list items and settings groups. */
export const card = "rounded-2xl border border-line bg-paper";

/** A dashed placeholder box for "nothing here yet" states. */
export const emptyState =
  "grid justify-items-start gap-2.5 rounded-2xl border border-dashed border-line p-5 text-ink-soft";

/** A shimmering placeholder block while content loads. Give it a height. */
export const skeleton =
  "animate-shimmer rounded-3xl bg-[linear-gradient(100deg,var(--color-fridge)_40%,var(--color-paper)_50%,var(--color-fridge)_60%)] bg-size-[300%_100%] motion-reduce:animate-none";

/* --------------------------------------------------------------------- Fields */

/**
 * Text fields come in three sizes:
 * - `md`: the standard field in forms (Create).
 * - `lg`: the roomy field in onboarding.
 * - `sm`: compact fields inside cards (curation, tips).
 * `pill` is the rounded select used inline in settings rows.
 */
const FIELD = {
  md: "w-full rounded-2xl border-2 border-line-strong bg-paper px-3.5 py-3 text-base focus:border-ink",
  lg: "min-h-13 w-full rounded-2xl border-2 border-line-strong bg-paper px-3.5 text-base focus:border-ink",
  sm: "min-h-10 rounded-xl border-[1.5px] border-line bg-paper px-2.5 py-2 font-semibold text-ink",
  pill: "min-h-10 rounded-full border-2 border-line-strong bg-paper px-3 font-bold text-ink",
} as const;

export type FieldSize = keyof typeof FIELD;

export function field(size: FieldSize = "md", className?: string) {
  return cn(FIELD[size], "focus:outline-none aria-invalid:border-tag-red", className);
}

/** Bold field label, also used for fieldset legends. */
export const label = "p-0 font-extrabold";

/** Small grey helper text under a field. */
export const help = "text-sm font-normal text-ink-soft";

/** Small bold error text. */
export const errorText = "text-sm font-bold text-tag-red-deep";

/** A fieldset without the browser's border and padding. */
export const fieldset = "m-0 grid min-w-0 gap-2 border-0 p-0";

/**
 * A selectable tile: role cards, radio rows, time slots, tip amounts. Selected tiles get
 * an ink border and, unless `tint` is off, a cream fill. The hidden input inside drives
 * the focus ring.
 */
export function choice(on: boolean, { tint = true, className }: { tint?: boolean; className?: string } = {}) {
  return cn(
    "cursor-pointer border-2 bg-paper has-focus-visible:shadow-focus",
    on ? cn("border-ink", tint && "bg-cream") : "border-line",
    className,
  );
}

/* ------------------------------------------------------------------ Controls */

/** Segmented control: two or more equal options in a white tray; the selected one is ink. */
export const segmented = "m-0 grid grid-cols-2 gap-1 rounded-2xl border border-line bg-paper p-1";

export function segment(on: boolean, className?: string) {
  return cn(
    "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-0 text-center text-sm font-bold has-focus-visible:shadow-focus",
    on ? "bg-ink text-white" : "bg-transparent text-ink-soft",
    className,
  );
}
