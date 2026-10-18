import { createElement, lazy } from "react";
import type { ComponentType } from "react";
import { RouteBoundary } from "./RouteBoundary.tsx";

/**
 * `React.lazy` for a named export, wrapped in Suspense and an error boundary so it can
 * be used directly as a route element: `const Studio = lazyNamed(() => import("./Studio.tsx"), "Studio")`.
 */
export function lazyNamed<M extends Record<string, unknown>, K extends keyof M & string>(load: () => Promise<M>, name: K): ComponentType {
  const Page = lazy(async () => ({ default: (await load())[name] as ComponentType }));
  const Lazy = () => createElement(RouteBoundary, null, createElement(Page));
  Lazy.displayName = `Lazy(${name})`;
  return Lazy;
}
