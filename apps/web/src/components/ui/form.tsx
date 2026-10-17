import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn.ts";
import { field, help } from "./recipes.ts";
import type { FieldSize } from "./recipes.ts";

export function Input({
  fieldSize = "md",
  className,
  ...props
}: { fieldSize?: FieldSize } & InputHTMLAttributes<HTMLInputElement>) {
  return <input className={field(fieldSize, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={field("md", cn("resize-y", className))} {...props} />;
}

export function Select({
  fieldSize = "md",
  className,
  ...props
}: { fieldSize?: FieldSize } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={field(fieldSize, cn(fieldSize === "md" && "min-h-12", className))} {...props} />;
}

/** A highlighted checkbox with a bold statement and a line of help ("I wrote this joke myself"). */
export function CheckRow({
  checked,
  onChange,
  title,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-cream px-4 py-3.5">
      <input
        type="checkbox"
        className="mt-px size-5.5 shrink-0 accent-ink"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="grid gap-0.5">
        <strong>{title}</strong>
        {children ? <span className={help}>{children}</span> : null}
      </span>
    </label>
  );
}
