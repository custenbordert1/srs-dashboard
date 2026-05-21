"use client";

import { useEffect, useState } from "react";

/** After this many ms of loading, UI should show sync/timeout messaging instead of bare skeletons. */
export const DASHBOARD_LOADING_CEILING_MS = 10_000;

export function useLoadingCeiling(isLoading: boolean, ceilingMs = DASHBOARD_LOADING_CEILING_MS): boolean {
  const [exceeded, setExceeded] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      const resetId = window.setTimeout(() => setExceeded(false), 0);
      return () => window.clearTimeout(resetId);
    }
    const id = window.setTimeout(() => setExceeded(true), ceilingMs);
    return () => window.clearTimeout(id);
  }, [isLoading, ceilingMs]);

  return exceeded;
}
