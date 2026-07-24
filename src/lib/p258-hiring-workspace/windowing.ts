/**
 * Lightweight list windowing (no extra dependency).
 * Returns the visible slice plus spacer sizes for absolute positioning.
 */
export function computeWindowSlice(input: {
  total: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan?: number;
}): {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
} {
  const { total, scrollTop, viewportHeight, rowHeight } = input;
  const overscan = input.overscan ?? 8;
  const safeRow = Math.max(1, rowHeight);
  const totalHeight = total * safeRow;
  if (total <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
  }

  const rawStart = Math.floor(Math.max(0, scrollTop) / safeRow);
  const visibleCount = Math.ceil(Math.max(0, viewportHeight) / safeRow) + 1;
  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(total, rawStart + visibleCount + overscan);
  return {
    startIndex,
    endIndex,
    offsetY: startIndex * safeRow,
    totalHeight,
  };
}

/** Initial paint budget: defer heavy applicant enrichment after shell. */
export const HIRING_WORKSPACE_SHELL_BUDGET_MS = 500;
