import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidatesSuccess } from "@/lib/breezy-api";
import {
  formatCandidatesSafeModeDiagnostics,
  resolveCandidatesSafeModeState,
} from "@/lib/candidates-safe-mode";

function snapshot(overrides: Partial<BreezyCandidatesSuccess> = {}): BreezyCandidatesSuccess {
  return {
    ok: true,
    companyId: "co-1",
    candidates: [{ candidateId: "c-1" }] as BreezyCandidatesSuccess["candidates"],
    fetchedAt: "2026-05-28T15:30:00.000Z",
    scanMode: "fast",
    fromCache: true,
    stale: true,
    ...overrides,
  };
}

describe("candidates safe mode", () => {
  it("marks cached view when snapshot is stale", () => {
    const state = resolveCandidatesSafeModeState({
      snapshot: snapshot(),
      hasRenderableRows: true,
      liveDataOk: false,
      liveSyncPending: false,
      refreshing: false,
    });
    assert.equal(state.showingCachedView, true);
    assert.equal(state.liveSyncPending, false);
    assert.equal(state.lastSnapshotFetchedAt, "2026-05-28T15:30:00.000Z");
  });

  it("marks live sync pending while refresh runs", () => {
    const state = resolveCandidatesSafeModeState({
      snapshot: snapshot({ fromCache: false, stale: false }),
      hasRenderableRows: true,
      liveDataOk: true,
      liveSyncPending: false,
      refreshing: true,
    });
    assert.equal(state.liveSyncPending, true);
  });

  it("formats diagnostics for cached view and pending sync", () => {
    const line = formatCandidatesSafeModeDiagnostics({
      showingCachedView: true,
      liveSyncPending: true,
      lastSnapshotFetchedAt: "2026-05-28T15:30:00.000Z",
    });
    assert.match(line ?? "", /cached view/i);
    assert.match(line ?? "", /live sync pending/i);
    assert.match(line ?? "", /last successful candidate snapshot/i);
  });
});
