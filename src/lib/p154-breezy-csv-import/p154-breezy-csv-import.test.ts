import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidateIdFromEmail,
  normalizeEmail,
  parseBreezyExportDate,
  parseLocation,
  parsePersonName,
} from "@/lib/p154-breezy-csv-import/import-breezy-csv";

describe("P154.5 breezy CSV import", () => {
  it("normalizes email for deduplication", () => {
    assert.equal(normalizeEmail("  Test@Example.COM "), "test@example.com");
  });

  it("generates stable candidate IDs from email", () => {
    const a = candidateIdFromEmail("test@example.com");
    const b = candidateIdFromEmail("test@example.com");
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{12}$/);
  });

  it("parses Breezy export dates", () => {
    assert.equal(parseBreezyExportDate("6/28/26"), "2026-06-28");
    assert.equal(parseBreezyExportDate("7/7/26"), "2026-07-07");
  });

  it("parses location into city and state", () => {
    assert.deepEqual(parseLocation("Wynne, AR"), { city: "Wynne", state: "AR" });
  });

  it("parses person names", () => {
    assert.deepEqual(parsePersonName("Brittaney Henderson"), {
      firstName: "Brittaney",
      lastName: "Henderson",
    });
  });
});
