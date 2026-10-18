import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/utils.ts";

/** The white, hairline-bordered surface used for panels, list items and settings groups. */
export const card = "rounded-2xl border border-line bg-paper";

/** A dashed placeholder box for "nothing here yet" states. */
export const emptyState =
  "grid justify-items-start gap-2.5 rounded-2xl border border-dashed border-line-strong p-6 text-ink-soft";

type CardProps<T extends ElementType> = { as?: T } & ComponentPropsWithoutRef<T>;

/** A card surface. Padding and layout come from `className`; `as` picks the element. */
export function Card<T extends ElementType = "div">({ as, className, ...props }: CardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return <Tag className={cn(card, className)} {...props} />;
}

/** A dashed placeholder box for "nothing here yet" states. */
export function EmptyState<T extends ElementType = "div">({ as, className, ...props }: CardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return <Tag className={cn(emptyState, className)} {...props} />;
}
