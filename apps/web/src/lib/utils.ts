import { extendTailwindMerge } from "tailwind-merge";

/**
 * Joins class names and resolves Tailwind conflicts, so a component's defaults can be
 * overridden from outside: `cn("px-4 text-ink", "px-6")` gives `"text-ink px-6"`.
 *
 * tailwind-merge needs to know about the custom tokens in index.css that it can't guess
 * from the class name alone.
 */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["focus", "pop", "tag", "fab", "lift", "frame", "knob"],
      spacing: ["nav"],
      animate: ["viewer-in", "shimmer", "burst", "highlighter", "punch-in", "progress"],
    },
  },
});

export type ClassValue = string | false | null | undefined;

export function cn(...classes: ClassValue[]) {
  return merge(...classes);
}
