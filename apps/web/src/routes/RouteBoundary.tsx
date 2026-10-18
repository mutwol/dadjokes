import { Component, Suspense } from "react";
import type { ReactNode } from "react";
import { button } from "@/components/ui/button.tsx";
import { skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";

/** Shown while a page's code downloads (usually a few hundred ms on first visit). */
function RouteFallback() {
  return (
    <div className="mx-auto grid w-full max-w-wide gap-4 px-4 pt-6 lg:px-8" aria-busy="true" aria-label="Loading">
      <div className={cn(skeleton, "h-8 w-48")} />
      <div className={cn(skeleton, "h-40")} />
      <div className={cn(skeleton, "h-24")} />
    </div>
  );
}

/**
 * A deploy can remove the chunk an open tab still points at; that import fails. Offer a
 * reload (which fetches the new build) instead of a blank screen.
 */
class ChunkBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto grid max-w-narrow justify-items-start gap-3 px-4 pt-10" role="alert">
        <h1 className="text-2xl">This page didn't load</h1>
        <p className="text-ink-soft">Daddy Jokes was probably just updated. Reloading picks up the new version.</p>
        <button type="button" className={button()} onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

/** Suspense plus a reload prompt, around a lazily loaded page. */
export function RouteBoundary({ children }: { children: ReactNode }) {
  return (
    <ChunkBoundary>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ChunkBoundary>
  );
}
