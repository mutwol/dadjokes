import type { JokeBackground } from "@/data/types.ts";
import { TONE } from "@/lib/tones.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Initials on a joke-background colour. A parent can shrink it with `[--avatar-size:36px]`.
 */
export function Avatar({
  name,
  tone,
  size = 40,
}: {
  name: string;
  tone: JokeBackground;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const box = `var(--avatar-size, ${size}px)`;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold dark:ring-1 dark:ring-white/15", TONE[tone])}
      style={{ width: box, height: box, fontSize: `calc(${box} * 0.38)` }}
    >
      {initials}
    </span>
  );
}
