import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { parseP170SearchQuery, normalizePhoneDigits } from "@/lib/p170-unified-candidate-discovery/parse-search-query";
import { matchesP170Query } from "@/lib/p170-unified-candidate-discovery/search-candidates";
import { assertP170UsesExistingArchitecture } from "@/lib/p170-unified-candidate-discovery/discovery-validation";
import { buildDiscoveryChecklist, sourceLabel } from "@/lib/p170-unified-candidate-discovery/presentation";

function candidate(overrides: Partial<BreezyCandidate> = {}): BreezyCandidate {
  return {
    candidateId: "98400c5310f6",
    firstName: "Patricia",
    lastName: "Irby",
    email: "patricia.irby@aol.com",
    phone: "+1 714 883-5164",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-07-07T21:44:53.270Z",
    createdDate: "2026-07-07T21:44:53.270Z",
    addedDate: "2026-07-07T21:44:53.270Z",
    updatedDate: "2026-07-07T21:44:53.270Z",
    addedDateSource: "creation_date",
    positionId: "a707da4f2564",
    positionName: "Retail Merchandiser - Lake Havasu City, AZ",
    city: "Lake Havasu City",
    state: "AZ",
    zipCode: "86404",
    ...(overrides as BreezyCandidate),
  } as BreezyCandidate;
}

describe("p170-unified-candidate-discovery", () => {
  it("parses email queries", () => {
    const q = parseP170SearchQuery("patricia.irby@aol.com");
    assert.equal(q.email, "patricia.irby@aol.com");
    assert.equal(q.name, null);
  });

  it("parses hex ids as both candidate and position id", () => {
    const q = parseP170SearchQuery("a707da4f2564");
    assert.equal(q.candidateId, "a707da4f2564");
    assert.equal(q.positionId, "a707da4f2564");
  });

  it("parses phone numbers to digits", () => {
    const q = parseP170SearchQuery("(714) 883-5164");
    assert.equal(q.phone, "7148835164");
  });

  it("treats plain text as a name", () => {
    const q = parseP170SearchQuery("Irby");
    assert.equal(q.name, "Irby");
    assert.equal(q.email, null);
  });

  it("matches Patricia by name", () => {
    assert.equal(matchesP170Query(candidate(), parseP170SearchQuery("Irby")), true);
  });

  it("matches Patricia by email", () => {
    assert.equal(matchesP170Query(candidate(), parseP170SearchQuery("patricia.irby@aol.com")), true);
  });

  it("matches Patricia by candidate id", () => {
    assert.equal(matchesP170Query(candidate(), parseP170SearchQuery("98400c5310f6")), true);
  });

  it("matches Patricia by position id", () => {
    assert.equal(matchesP170Query(candidate(), parseP170SearchQuery("a707da4f2564")), true);
  });

  it("matches Patricia by phone digits", () => {
    assert.equal(matchesP170Query(candidate(), parseP170SearchQuery("7148835164")), true);
  });

  it("does not match an unrelated candidate", () => {
    const other = candidate({
      candidateId: "111111111111",
      firstName: "John",
      lastName: "Doe",
      email: "john@doe.com",
      phone: "5550001111",
      positionId: "222222222222",
    });
    assert.equal(matchesP170Query(other, parseP170SearchQuery("Irby")), false);
  });

  it("normalizes phone digits", () => {
    assert.equal(normalizePhoneDigits("+1 (714) 883-5164"), "17148835164");
  });

  it("uses existing architecture (no new index, no full rebuild)", () => {
    const arch = assertP170UsesExistingArchitecture();
    assert.equal(arch.usesIngestionStore, true);
    assert.equal(arch.usesP153RescuePath, true);
    assert.equal(arch.noFullIndexRebuild, true);
    assert.equal(arch.noNewSearchIndex, true);
  });

  it("builds a six-point discovery checklist", () => {
    const checklist = buildDiscoveryChecklist({
      foundInBreezy: true,
      foundInIngestion: true,
      foundInSearch: true,
      evaluatedByP157: true,
      eligibleForP169: false,
      paperworkStatus: "Paperwork Sent",
      p157Action: "Send Paperwork",
      p169Outcome: "WAIT_NEXT_CYCLE",
    });
    assert.equal(checklist.length, 6);
    assert.equal(sourceLabel("ingestion_store"), "Ingestion Store");
    assert.equal(sourceLabel("breezy_rescue"), "Breezy Rescue");
  });
});
