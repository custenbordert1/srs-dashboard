import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidatesSuccess } from "@/lib/breezy-api";
import {
  buildCandidatesSyncAlert,
  getStaleOkCandidatesSnapshot,
  isPartialCandidatesSync,
  mergeCandidatesSnapshots,
  rememberOkCandidatesSnapshot,
  timeoutShowsCachedCandidatesMessage,
  withCandidatesSyncMeta,
} from "@/lib/breezy-candidates-sync";

function baseSuccess(overrides: Partial<BreezyCandidatesSuccess> = {}): BreezyCandidatesSuccess {
  return {
    ok: true,
    candidates: [{ candidateId: "c-1" } as BreezyCandidatesSuccess["candidates"][number]],
    fetchedAt: "2026-05-22T12:00:00.000Z",
    companyId: "co-1",
    positionsScanned: 5,
    totalPositionsAvailable: 10,
    ...overrides,
  };
}

describe("breezy-candidates-sync", () => {
  it("marks partial sync when not all positions were scanned", () => {
    const data = baseSuccess({ positionsScanned: 3, totalPositionsAvailable: 10 });
    assert.equal(isPartialCandidatesSync(data), true);
    const alert = buildCandidatesSyncAlert(
      withCandidatesSyncMeta(data, { fromCache: false, partial: true }),
    );
    assert.ok(alert?.includes("Partial sync"));
  });

  it("returns stale snapshot remembered by cache key", () => {
    const key = "test-cache-key";
    const snapshot = withCandidatesSyncMeta(baseSuccess(), { fromCache: false });
    rememberOkCandidatesSnapshot(key, snapshot);
    const stale = getStaleOkCandidatesSnapshot(key);
    assert.ok(stale);
    assert.equal(stale?.candidates.length, 1);
  });

  it("timeout copy states when cached data is shown", () => {
    const msg = timeoutShowsCachedCandidatesMessage(60_000, true);
    assert.match(msg, /timed out after 60s/i);
    assert.match(msg, /cached candidates/i);
  });
});

describe("mergeCandidatesSnapshots", () => {
  it("combines preview and fast tiers without dropping rows", () => {
    const preview = withCandidatesSyncMeta(
      baseSuccess({
        candidates: [{ candidateId: "c-1" } as BreezyCandidatesSuccess["candidates"][number]],
        positionsScanned: 5,
        totalPositionsAvailable: 120,
        hydrationComplete: false,
        partial: true,
        scanMode: "preview",
      }),
      { fromCache: false, partial: true },
    );
    const fast = withCandidatesSyncMeta(
      baseSuccess({
        candidates: [{ candidateId: "c-2" } as BreezyCandidatesSuccess["candidates"][number]],
        positionsScanned: 60,
        totalPositionsAvailable: 120,
        hydrationComplete: false,
        partial: true,
        scanMode: "fast",
      }),
      { fromCache: false, partial: true },
    );
    const merged = mergeCandidatesSnapshots(preview, fast);
    assert.equal(merged.candidates.length, 2);
    assert.equal(merged.hydrationComplete, false);
  });

  it("combines fast and full tiers without dropping rows", () => {
    const fast = withCandidatesSyncMeta(
      baseSuccess({
        candidates: [{ candidateId: "c-1" } as BreezyCandidatesSuccess["candidates"][number]],
        positionsScanned: 60,
        totalPositionsAvailable: 120,
        hydrationComplete: false,
        partial: true,
      }),
      { fromCache: false, partial: true },
    );
    const full = withCandidatesSyncMeta(
      baseSuccess({
        candidates: [{ candidateId: "c-2" } as BreezyCandidatesSuccess["candidates"][number]],
        positionsScanned: 120,
        totalPositionsAvailable: 120,
        hydrationComplete: true,
      }),
      { fromCache: false, partial: false },
    );
    const merged = mergeCandidatesSnapshots(fast, full);
    assert.equal(merged.candidates.length, 2);
    assert.equal(merged.hydrationComplete, true);
    assert.equal(merged.partial, false);
  });
});

describe("client cache shouldCache (candidates tab)", () => {
  it("documents that failed candidate payloads must not replace ok cache entries", () => {
    const okPayload = { ok: true as const, candidates: [], fetchedAt: "", companyId: "c" };
    const failPayload = { ok: false as const, error: "timeout", fetchedAt: "" };
    const shouldCacheOk = (payload: { ok: boolean }) => payload.ok === true;
    assert.equal(shouldCacheOk(okPayload), true);
    assert.equal(shouldCacheOk(failPayload), false);
  });
});
