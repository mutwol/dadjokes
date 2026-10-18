import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils.ts";
import { field } from "./input.tsx";
import type { FieldSize } from "./input.tsx";

/** A native <select> with the field look. */
export function Select({
  fieldSize = "md",
  className,
  ...props
}: { fieldSize?: FieldSize } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={field(fieldSize, cn("pr-8", className))} {...props} />;
}
