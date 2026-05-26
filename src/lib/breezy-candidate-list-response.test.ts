import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractRawBreezyCandidatesFromListResponse } from "@/lib/breezy-api";

describe("extractRawBreezyCandidatesFromListResponse", () => {
  it("reads bare array responses", () => {
    const rows = extractRawBreezyCandidatesFromListResponse([
      { _id: "c-1", name: "Pat" },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?._id, "c-1");
  });

  it("reads wrapped candidates array responses", () => {
    const rows = extractRawBreezyCandidatesFromListResponse({
      candidates: [{ _id: "c-2", email_address: "pat@example.com" }],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?._id, "c-2");
  });

  it("reads applicants array responses", () => {
    const rows = extractRawBreezyCandidatesFromListResponse({
      applicants: [{ _id: "c-3", name: "Sam" }],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?._id, "c-3");
  });

  it("returns empty for unknown shapes", () => {
    assert.deepEqual(extractRawBreezyCandidatesFromListResponse({ meta: {} }), []);
  });
});
