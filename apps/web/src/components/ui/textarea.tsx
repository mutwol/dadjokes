import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils.ts";
import { field } from "./input.tsx";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={field("md", cn("resize-y", className))} {...props} />;
}
