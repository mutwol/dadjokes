import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * How tall a table's scrolling body may get:
 * - "viewport" (default): down to the bottom of the window, so the page itself doesn't
 *   scroll and the header, footer and pagination stay in view. Never below `minPx`.
 * - "auto": no inner scrolling; the page scrolls (short tables, printing).
 * - any CSS length ("24rem", "50dvh"): a fixed cap, for tables sharing a page.
 */
export type TableHeight = "auto" | "viewport" | (string & {});

/** Space kept below the scroll area in "viewport" mode: pagination bar + page padding. */
const BELOW_PX = 88;

export function useScrollBody(height: TableHeight, minPx: number, resetKey: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewportMax, setViewportMax] = useState<number | null>(null);
  const [edges, setEdges] = useState({ top: true, bottom: true });

  const measureEdges = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop <= 1;
    const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }));
  }, []);

  // "viewport": fit to the space left under the table's top edge, and keep fitting as the
  // window resizes or content above it (filters, banners) changes height.
  useLayoutEffect(() => {
    if (height !== "viewport") return;
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      // A fixed bar at the bottom of the screen (the phone tab bar) covers part of the window.
      const bar = document.querySelector<HTMLElement>("[data-bottom-bar]");
      const covered = bar && bar.offsetParent !== null ? bar.offsetHeight : 0;
      setViewportMax(Math.max(minPx, window.innerHeight - top - BELOW_PX - covered));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [height, minPx]);

  // Edge shadows follow content changes (rows loading, density) as well as scrolling.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measureEdges();
    const ro = new ResizeObserver(measureEdges);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measureEdges]);

  // A new page, sort or filter starts at the top of the list.
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  const maxHeight = height === "auto" ? undefined : height === "viewport" ? (viewportMax ?? undefined) : height;
  return { ref, maxHeight, scrollable: height !== "auto", edges, onScroll: measureEdges };
}
