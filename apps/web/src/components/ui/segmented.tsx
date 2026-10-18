import { cn } from "@/lib/utils.ts";

/** Segmented control: equal options in a sunken tray; the selected one is raised. */
export const segmented = "m-0 grid grid-cols-2 gap-0.5 rounded-lg border border-line bg-fridge p-0.5";

export function segment(on: boolean, className?: string) {
  return cn(
    "flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border-0 text-center text-sm font-medium transition-colors duration-120 has-focus-visible:shadow-focus",
    on ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "bg-transparent text-ink-soft hover:text-ink",
    className,
  );
}
