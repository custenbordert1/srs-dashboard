import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyCandidatesSuccess } from "@/lib/breezy-api";
import {
  evaluateIngestionFallback,
  resolveLiveSnapshotCandidates,
} from "@/lib/p143-live-snapshot-ingestion-fallback/resolve-live-snapshot-candidates";

function mockCandidate(id: string): BreezyCandidate {
  return {
    candidateId: id,
    firstName: "Test",
    lastName: id,
    email: `${id}@example.com`,
    positionId: "pos-1",
    stage: "applied",
    appliedDate: "2026-07-01T00:00:00.000Z",
  };
}

function mockPreview(count: number, overrides: Partial<BreezyCandidatesSuccess> = {}): BreezyCandidatesSuccess {
  return {
    ok: true,
    candidates: Array.from({ length: count }, (_, i) => mockCandidate(`preview-${i}`)),
    fetchedAt: "2026-07-02T12:00:00.000Z",
    companyId: "co-1",
    scanMode: "preview",
    ...overrides,
  };
}

function mockIngestion(count: number): BreezyCandidatesSuccess {
  return {
    ok: true,
    candidates: Array.from({ length: count }, (_, i) => mockCandidate(`ing-${i}`)),
    fetchedAt: "2026-07-02T11:00:00.000Z",
    companyId: "",
    scanMode: "all",
    totalCandidatesPulled: count,
    hydrationComplete: false,
    syncNotes: ["Durable ingestion store: 24/191 positions scanned."],
  };
}

describe("p143-live-snapshot-ingestion-fallback", () => {
  it("keeps healthy live preview when preview count is sufficient", async () => {
    const preview = mockPreview(200);
    const ingested = mockIngestion(389);

    const decision = evaluateIngestionFallback({
      previewResult: preview,
      previewFromCache: false,
      ingestionCount: ingested.candidates.length,
    });
    assert.equal(decision.useFallback, false);

    const resolved = await resolveLiveSnapshotCandidates({
      previewResult: preview,
      previewFromCache: false,
      ingestedSnapshot: ingested,
    });

    assert.equal(resolved.metadata.candidateSource, "live_preview");
    assert.equal(resolved.metadata.candidateCount, 200);
    assert.equal(resolved.metadata.previewCandidateCount, 200);
    assert.equal(resolved.metadata.ingestionCandidateCount, 389);
    assert.equal(resolved.metadata.fallbackReason, null);
    assert.equal(resolved.usedIngestionFallback, false);
    assert.equal(resolved.candidates.candidates[0]?.candidateId, "preview-0");
  });

  it("uses ingestion fallback when preview count is zero", async () => {
    const preview = mockPreview(0);
    const ingested = mockIngestion(389);

    const decision = evaluateIngestionFallback({
      previewResult: preview,
      previewFromCache: false,
      ingestionCount: ingested.candidates.length,
    });
    assert.equal(decision.useFallback, true);
    assert.equal(decision.reason, "preview_empty");

    const resolved = await resolveLiveSnapshotCandidates({
      previewResult: preview,
      previewFromCache: false,
      ingestedSnapshot: ingested,
    });

    assert.equal(resolved.metadata.candidateSource, "ingestion_fallback");
    assert.equal(resolved.metadata.candidateCount, 389);
    assert.equal(resolved.metadata.fallbackReason, "preview_empty");
    assert.equal(resolved.usedIngestionFallback, true);
    assert.equal(resolved.candidates.source, "ingestion_fallback");
  });

  it("uses ingestion fallback when preview undercounts ingestion", async () => {
    const preview = mockPreview(15, {
      truncated: true,
      previewDiagnostics: {
        rawBreezyResponseCount: 15,
        extractedCandidatesCount: 15,
        normalizedCandidateCount: 15,
        servedFromServerCache: false,
        forceRequested: false,
        previewPageSize: 50,
        previewMaxPages: 1,
        jobsWithApplicantCount: 0,
        jobsWithUnknownApplicantCount: 120,
        jobsWithZeroApplicantCount: 0,
        previewStoppedReason: "server_budget",
      },
    });
    const ingested = mockIngestion(389);

    const decision = evaluateIngestionFallback({
      previewResult: preview,
      previewFromCache: false,
      ingestionCount: ingested.candidates.length,
    });
    assert.equal(decision.useFallback, true);
    assert.equal(decision.reason, "preview_server_budget_undercount");

    const resolved = await resolveLiveSnapshotCandidates({
      previewResult: preview,
      previewFromCache: false,
      ingestedSnapshot: ingested,
    });

    assert.equal(resolved.metadata.candidateSource, "mixed");
    assert.equal(resolved.metadata.candidateCount, 389);
    assert.equal(resolved.metadata.previewCandidateCount, 15);
    assert.equal(resolved.metadata.fallbackReason, "preview_server_budget_undercount");
  });

  it("uses ingestion fallback on cold cache after restart (empty peek)", async () => {
    const preview = mockPreview(0);
    const ingested = mockIngestion(120);

    const resolved = await resolveLiveSnapshotCandidates({
      previewResult: preview,
      previewFromCache: true,
      ingestedSnapshot: ingested,
    });

    assert.equal(resolved.metadata.candidateSource, "ingestion_fallback");
    assert.equal(resolved.metadata.fallbackReason, "cold_preview_cache");
    assert.equal(resolved.metadata.candidateCount, 120);
    assert.equal(resolved.usedIngestionFallback, true);
  });

  it("serves live cache when peek cache is populated and sufficient", async () => {
    const preview = mockPreview(200);
    const ingested = mockIngestion(389);

    const resolved = await resolveLiveSnapshotCandidates({
      previewResult: preview,
      previewFromCache: true,
      ingestedSnapshot: ingested,
    });

    assert.equal(resolved.metadata.candidateSource, "live_cache");
    assert.equal(resolved.metadata.candidateCount, 200);
    assert.equal(resolved.usedIngestionFallback, false);
  });

  it("returns source metadata fields on every resolution", async () => {
    const resolved = await resolveLiveSnapshotCandidates({
      previewResult: mockPreview(0),
      previewFromCache: false,
      ingestedSnapshot: mockIngestion(50),
    });

    assert.ok(resolved.metadata.candidatesFreshnessTimestamp);
    assert.equal(typeof resolved.metadata.candidateCount, "number");
    assert.equal(resolved.metadata.ingestionCandidateCount, 50);
    assert.equal(resolved.metadata.previewCandidateCount, 0);
  });
});
