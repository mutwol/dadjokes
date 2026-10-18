import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils.ts";

/** A shimmering placeholder block while content loads. Give it a height. */
export const skeleton =
  "animate-shimmer rounded-lg bg-[linear-gradient(100deg,var(--color-fridge)_40%,var(--color-paper)_50%,var(--color-fridge)_60%)] bg-size-[300%_100%] motion-reduce:animate-none";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn(skeleton, className)} {...props} />;
}
