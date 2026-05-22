import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import { extractRawBreezyCandidatesFromListResponse } from "@/lib/breezy-api";
import {
  buildJobsLookupMap,
  describeBreezyResponseShape,
  FROZEN_BREEZY_CANDIDATE_LIST_STRATEGY,
  getBreezyCandidateListStrategyForFetch,
} from "@/lib/breezy-global-candidates";

describe("extractRawBreezyCandidatesFromListResponse (global shapes)", () => {
  it("reads results and nested data.candidates", () => {
    assert.equal(
      extractRawBreezyCandidatesFromListResponse({ results: [{ _id: "c-1" }] }).length,
      1,
    );
    assert.equal(
      extractRawBreezyCandidatesFromListResponse({
        data: { candidates: [{ _id: "c-2" }] },
      }).length,
      1,
    );
  });
});

describe("describeBreezyResponseShape", () => {
  it("reports pagination from meta", () => {
    const shape = describeBreezyResponseShape({
      candidates: [{ _id: "x" }],
      meta: { page: 1, page_size: 50, has_more: true },
    });
    assert.equal(shape.extractedCount, 1);
    assert.equal(shape.candidatesArrayLength, 1);
    assert.deepEqual(shape.pagination, { page: 1, page_size: 50, has_more: true });
  });
});

describe("getBreezyCandidateListStrategyForFetch", () => {
  it("returns frozen per-position strategy without probing", () => {
    const strategy = getBreezyCandidateListStrategyForFetch();
    assert.equal(strategy.kind, "per_position");
    assert.equal(strategy.label, FROZEN_BREEZY_CANDIDATE_LIST_STRATEGY.label);
  });
});

describe("buildJobsLookupMap", () => {
  it("indexes jobId and friendlyId", () => {
    const jobs: BreezyJob[] = [
      {
        jobId: "mongo-id",
        friendlyId: "friendly-123",
        name: "Role",
        city: "",
        state: "",
        zip: "",
        displayLocation: "",
        locationSource: "missing",
        status: "published",
        createdDate: "",
        updatedDate: "",
      },
    ];
    const map = buildJobsLookupMap(jobs);
    assert.equal(map.get("mongo-id")?.name, "Role");
    assert.equal(map.get("friendly-123")?.name, "Role");
  });
});
