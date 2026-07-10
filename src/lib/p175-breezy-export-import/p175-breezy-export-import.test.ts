import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeIngestionSource } from "@/lib/candidate-ingestion/merge-candidate-record";
import { findStoreMatchForExportRow } from "@/lib/p175-breezy-export-import/match-export-to-store";
import {
  exportRowToBreezyCandidate,
  mergeExportRowIntoCandidate,
} from "@/lib/p175-breezy-export-import/merge-export-candidate";
import {
  exportSyntheticCandidateId,
  normalizeEmail,
  normalizeExportApplicantRow,
} from "@/lib/p175-breezy-export-import/normalize";
import type { BreezyExportNormalizedRow } from "@/lib/p175-breezy-export-import/types";

function sampleRow(overrides: Partial<BreezyExportNormalizedRow> = {}): BreezyExportNormalizedRow {
  return {
    rowNumber: 2,
    name: "Patricia Irby",
    firstName: "Patricia",
    lastName: "Irby",
    email: "patricia@example.com",
    phone: "5551234567",
    positionName: "Retail Merchandiser - Weekly Store Visit",
    positionId: "pos-abc",
    city: "Wynne",
    state: "AR",
    source: "Indeed",
    recruiter: "Unassigned",
    appliedAt: "2026-07-07T21:07:27.000Z",
    lastActivityAt: "2026-07-07T21:07:27.000Z",
    syntheticCandidateId: exportSyntheticCandidateId({
      email: "patricia@example.com",
      positionName: "Retail Merchandiser - Weekly Store Visit",
      appliedAt: "2026-07-07T21:07:27.000Z",
    }),
    ...overrides,
  };
}

describe("P175 breezy export import", () => {
  it("generates deterministic synthetic IDs from email + position + applied date", () => {
    const a = exportSyntheticCandidateId({
      email: "a@example.com",
      positionName: "Role A",
      appliedAt: "2026-07-09T10:00:00.000Z",
    });
    const b = exportSyntheticCandidateId({
      email: "a@example.com",
      positionName: "Role B",
      appliedAt: "2026-07-09T10:00:00.000Z",
    });
    assert.notEqual(a, b);
    assert.match(a, /^[a-f0-9]{12}$/);
  });

  it("normalizes export applicant rows", () => {
    const result = normalizeExportApplicantRow({
      rowNumber: 2,
      raw: {
        name: "April White",
        email_address: "greatdeals0501@gmail.com",
        phone_number: "555-000-1111",
        position: "Independent Merchandiser",
        location: "Attalla, AL",
        source: "Indeed",
        addedDate: 45512,
        addedTime: 0.38,
      },
      matchPosition: () => null,
    });
    assert.ok(!("skipReason" in result));
    if (!("skipReason" in result)) {
      assert.equal(normalizeEmail(result.email), "greatdeals0501@gmail.com");
      assert.ok(result.appliedAt.length > 0);
      assert.ok(result.syntheticCandidateId.length === 12);
    }
  });

  it("matches export rows to API candidates by email, position, and date", () => {
    const exportRow = sampleRow();
    const apiCandidate = exportRowToBreezyCandidate(exportRow);
    apiCandidate.candidateId = "abc123def456";
    apiCandidate.ingestionSource = "breezy_api";
    apiCandidate.breezyCandidateIdUnavailable = false;
    const match = findStoreMatchForExportRow({
      exportRow,
      candidates: [apiCandidate],
    });
    assert.equal(match?.candidateId, "abc123def456");
  });

  it("merges export fields into API records without overwriting API id", () => {
    const exportRow = sampleRow({ phone: "9998887777" });
    const existing = exportRowToBreezyCandidate(exportRow);
    existing.candidateId = "abc123def456";
    existing.ingestionSource = "breezy_api";
    existing.breezyCandidateIdUnavailable = false;
    existing.phone = "";
    const merged = mergeExportRowIntoCandidate(existing, exportRow);
    assert.equal(merged.candidateId, "abc123def456");
    assert.equal(merged.phone, "9998887777");
    assert.equal(merged.ingestionSource, "merged");
    assert.equal(merged.breezyCandidateIdUnavailable, false);
  });

  it("creates export-only records with breezy_export source", () => {
    const candidate = exportRowToBreezyCandidate(sampleRow());
    assert.equal(candidate.ingestionSource, "breezy_export");
    assert.equal(candidate.breezyCandidateIdUnavailable, true);
    assert.equal(candidate.addedDateSource, "breezy_export");
  });

  it("merges ingestion source attribution", () => {
    assert.equal(mergeIngestionSource("breezy_api", "breezy_export"), "merged");
    assert.equal(mergeIngestionSource("breezy_export", "breezy_export"), "breezy_export");
  });
});
