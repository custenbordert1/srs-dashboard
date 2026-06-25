import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { shouldSupplementIngestionForExport } from "@/lib/candidate-ingestion/resolve-candidates-for-export";

describe("resolveCandidatesForExport", () => {
  it("supplements when ingestion cycle is incomplete", () => {
    const store = {
      ...emptyIngestionStore(),
      cycleComplete: false,
      publishedPositionsTotal: 360,
      scannedPositionIds: ["pos-1"],
    };
    assert.equal(shouldSupplementIngestionForExport(store), true);
  });

  it("supplements when published positions remain unscanned", () => {
    const store = {
      ...emptyIngestionStore(),
      cycleComplete: true,
      publishedPositionsTotal: 10,
      scannedPositionIds: ["pos-1", "pos-2"],
    };
    assert.equal(shouldSupplementIngestionForExport(store), true);
  });

  it("uses ingestion only when the full position cycle is complete", () => {
    const store = {
      ...emptyIngestionStore(),
      cycleComplete: true,
      publishedPositionsTotal: 2,
      scannedPositionIds: ["pos-1", "pos-2"],
    };
    assert.equal(shouldSupplementIngestionForExport(store), false);
  });
});
