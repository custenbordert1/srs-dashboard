import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import {
  buildIngestionPositionQueue,
  countUnscannedPositions,
  selectNextIngestionScanChunk,
} from "@/lib/candidate-ingestion/build-ingestion-scan-queue";

function job(id: string, candidateCount?: number, updatedDate = "2026-07-08"): BreezyJob {
  return {
    jobId: id,
    name: id,
    city: "Dallas",
    state: "TX",
    zip: "",
    displayLocation: "Dallas, TX",
    locationSource: "location",
    status: "published",
    createdDate: "2026-06-01",
    updatedDate,
    candidateCount,
  };
}

describe("P174 ingestion scan queue", () => {
  it("prioritizes unscanned positions ahead of scanned", () => {
    const jobs = [job("a", 5), job("b", 10), job("c", 1)];
    const queue = buildIngestionPositionQueue(jobs, { scannedPositionIds: ["a"] });
    assert.deepEqual(queue.slice(0, 2), ["b", "c"]);
    assert.equal(queue[2], "a");
  });

  it("selectNextIngestionScanChunk returns highest-priority unscanned only", () => {
    const jobs = [job("low", 1, "2026-06-01"), job("high", 20, "2026-07-09")];
    const chunk = selectNextIngestionScanChunk({
      jobs,
      store: { scannedPositionIds: [] },
      chunkSize: 1,
    });
    assert.equal(chunk[0]?.jobId, "high");
  });

  it("countUnscannedPositions excludes scanned ids", () => {
    const jobs = [job("a"), job("b"), job("c")];
    assert.equal(countUnscannedPositions(jobs, { scannedPositionIds: ["a", "c"] }), 1);
  });
});
