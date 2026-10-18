import { cn } from "@/lib/utils.ts";
import { useTheme, type ThemePreference } from "./theme.ts";

const OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" },
  { value: "dark", label: "Dark", icon: "M20.4 14.6A8.5 8.5 0 0 1 9.4 3.6a8.5 8.5 0 1 0 11 11Z" },
  { value: "system", label: "System", icon: "M3 5h18v11H3zM8 20h8m-4-4v4" },
];

/** Three-way theme switch (light / dark / system). `compact` hides the labels. */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-grid grid-cols-3 gap-0.5 rounded-md border border-line bg-fridge p-0.5", className)}>
      {OPTIONS.map((o) => {
        const on = preference === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={compact ? o.label : undefined}
            title={o.label}
            onClick={() => setPreference(o.value)}
            className={cn(
              "flex min-h-8 items-center justify-center gap-1.5 rounded-[5px] border-0 px-2 text-xs font-medium transition-colors duration-120",
              on ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "bg-transparent text-ink-soft hover:text-ink",
            )}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={o.icon} />
            </svg>
            {compact ? null : o.label}
          </button>
        );
      })}
    </div>
  );
}
