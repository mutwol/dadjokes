import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils.ts";

const BADGE_TONES = {
  green: "bg-mint text-forest",
  blue: "bg-sky text-sky-ink",
  yellow: "bg-butter text-butter-ink",
  red: "bg-tag-red/12 text-tag-red-deep",
  grey: "bg-fridge text-ink-soft",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

/** A small rounded label: statuses, counts in words, "live v3". */
export function Badge({ tone = "grey", className, ...props }: { tone?: BadgeTone } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-xs font-medium whitespace-nowrap", BADGE_TONES[tone], className)}
      {...props}
    />
  );
}

/** Joke statuses, named for what they mean in the app. */
const PILL_TONES = {
  review: "yellow",
  scheduled: "blue",
  delivered: "green",
  muted: "grey",
} as const satisfies Record<string, BadgeTone>;

/** A badge toned by joke status: in review, scheduled, delivered. */
export function Pill({ tone, ...props }: { tone: keyof typeof PILL_TONES } & HTMLAttributes<HTMLSpanElement>) {
  return <Badge tone={PILL_TONES[tone]} {...props} />;
}

/** Red unread count, e.g. on the Activity link. */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "ml-auto inline-grid h-5 min-w-5 place-items-center rounded-full bg-tag-red px-1.5 text-xs font-semibold text-white",
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
