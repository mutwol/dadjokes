import { cn } from "./ui/index.ts";

const SIZES = {
  s: { band: "px-1 pt-0.75 pb-0.5 text-[0.5rem]", name: "px-2 pt-1 pb-0.75 text-[0.875rem]" },
  m: { band: "px-1.5 pt-1.25 pb-1 text-[0.625rem]", name: "px-3 pt-1.5 pb-1 text-lg" },
  l: { band: "px-2.5 pt-2 pb-1.5 text-sm", name: "px-4.5 pt-2.5 pb-2 text-[1.75rem]" },
} as const;

/**
 * The "Hello, my name is" sticker. Used as the logo and as the byline on a joke,
 * because every dad joke starts with "Hi hungry, I'm Dad."
 */
export function NameTag({
  name,
  size = "m",
  tilt = -3,
  className,
}: {
  name: string;
  size?: "s" | "m" | "l";
  tilt?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 flex-col rounded-xl bg-tag-red px-1 pb-1 leading-none shadow-tag",
        className,
      )}
      style={{ rotate: `${tilt}deg` }}
    >
      <span className={cn("text-center font-extrabold tracking-[0.01em] whitespace-nowrap text-white", SIZES[size].band)}>
        Hello, my name is
      </span>
      <span
        className={cn(
          "rounded-sm bg-white text-center font-marker whitespace-nowrap text-ink",
          SIZES[size].name,
        )}
      >
        {name}
      </span>
    </span>
  );
}
