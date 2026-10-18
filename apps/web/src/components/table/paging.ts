export const PAGE_SIZES = [10, 25, 50, 100];

/** Page numbers to show: first, last, one either side of the current; gaps as null. */
export function pageWindow(page: number, pageCount: number): Array<number | null> {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((x) => x >= 1 && x <= pageCount).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  pages.forEach((x, i) => {
    const prev = pages[i - 1];
    if (prev !== undefined && x - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && x - prev > 2) out.push(null);
    out.push(x);
  });
  return out;
}
