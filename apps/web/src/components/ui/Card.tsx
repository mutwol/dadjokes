import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "./cn.ts";
import { card, emptyState } from "./recipes.ts";

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
