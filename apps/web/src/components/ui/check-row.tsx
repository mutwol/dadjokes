import type { ReactNode } from "react";
import { help } from "./label.tsx";

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
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-cream-edge bg-cream px-4 py-3">
      <input
        type="checkbox"
        className="mt-px size-5.5 shrink-0 accent-ink"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="grid gap-0.5">
        <span className="font-medium">{title}</span>
        {children ? <span className={help}>{children}</span> : null}
      </span>
    </label>
  );
}
