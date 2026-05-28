import type { BreezyCandidatesSuccess } from "@/lib/breezy-api";

export type CandidatesSafeModeStateInput = {
  snapshot: BreezyCandidatesSuccess | null | undefined;
  hasRenderableRows: boolean;
  liveDataOk: boolean;
  liveSyncPending: boolean;
  refreshing: boolean;
};

export type CandidatesSafeModeState = {
  showingCachedView: boolean;
  liveSyncPending: boolean;
  lastSnapshotFetchedAt: string | null;
};

export function resolveCandidatesSafeModeState(
  input: CandidatesSafeModeStateInput,
): CandidatesSafeModeState {
  const liveSyncPending = input.liveSyncPending || input.refreshing;
  const snapshotCached = Boolean(input.snapshot?.fromCache || input.snapshot?.stale);
  const showingCachedView =
    snapshotCached || (input.hasRenderableRows && !input.liveDataOk && liveSyncPending);

  return {
    showingCachedView,
    liveSyncPending,
    lastSnapshotFetchedAt: input.snapshot?.fetchedAt ?? null,
  };
}

function formatShortSnapshotTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Recruiter-facing safe-mode diagnostics (cached view / live sync / last snapshot). */
export function formatCandidatesSafeModeDiagnostics(
  state: CandidatesSafeModeState,
): string | null {
  const parts: string[] = [];
  if (state.showingCachedView) {
    parts.push("Safe mode — using cached view");
  }
  if (state.liveSyncPending) {
    parts.push("Live sync pending");
  }
  const snapshotTime = state.lastSnapshotFetchedAt
    ? formatShortSnapshotTime(state.lastSnapshotFetchedAt)
    : null;
  if (snapshotTime) {
    parts.push(`Last successful candidate snapshot ${snapshotTime}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export const CANDIDATES_NO_CACHE_EMPTY_MESSAGE =
  "No cached candidates yet. Start sync and leave this page open.";
