import { useSyncExternalStore } from "react";

/**
 * Light, dark or follow the system. The choice is a per-browser preference kept in
 * localStorage; the resolved theme lives on <html data-theme>, which index.css keys
 * every colour token off. index.html applies it before first paint (no flash), and
 * this module keeps it in sync afterwards.
 */
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const KEY = "daddyjokes.theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

let preference: ThemePreference = typeof window === "undefined" ? "system" : readPreference();

function resolve(p: ThemePreference): ResolvedTheme {
  if (p !== "system") return p;
  return media().matches ? "dark" : "light";
}

function apply(animate: boolean) {
  const root = document.documentElement;
  const theme = resolve(preference);
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 200);
  }
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0e121c" : "#f3f6f9");
  listeners.forEach((l) => l());
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    if (next === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, next);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  apply(true);
}

if (typeof window !== "undefined") {
  media().addEventListener("change", () => preference === "system" && apply(true));
  // Another tab changed the preference.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    preference = readPreference();
    apply(false);
  });
  apply(false);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The stored preference and the theme actually showing. */
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, () => preference, () => "system" as ThemePreference);
  const resolved = useSyncExternalStore(subscribe, () => resolve(preference), () => "light" as ResolvedTheme);
  return { preference: pref, resolved, setPreference: setThemePreference };
}
