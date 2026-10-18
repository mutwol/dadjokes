import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

/** Underlined tabs over a hairline. Controlled: the caller owns `value`. */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (t: T) => void; tabs: { id: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-5 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px flex min-h-10 items-center gap-1.5 border-0 border-b-2 bg-transparent px-0 font-medium whitespace-nowrap",
            value === t.id ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
