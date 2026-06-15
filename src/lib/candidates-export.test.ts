import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildCandidatesExportCsv,
  buildCandidatesExportRow,
  candidatesExportFilename,
  formatMatchScoreForExport,
  operationalWorkflowStateForExport,
  readyForMelExportStatus,
} from "@/lib/candidates-export";

function sampleCandidate(): BreezyCandidate {
  return {
    candidateId: "cand-1",
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    phone: "555-0100",
    source: "Indeed",
    stage: "Applied",
    appliedDate: "2026-05-20",
    createdDate: "2026-05-20",
    addedDate: "2026-05-20",
    updatedDate: "2026-05-20",
    addedDateSource: "creation_date",
    positionId: "pos-1",
    positionName: "Merchandiser",
    city: "Dallas",
    state: "TX",
    zipCode: "75001",
    resumeText: "walmart reset merchandising travel",
    hasResume: true,
  };
}

describe("candidates-export", () => {
  it("builds CSV with required headers and escaped values", () => {
    const row = buildScoredWorkflowRow(sampleCandidate());
    const enriched = {
      ...row,
      assignedRecruiter: "Taylor",
      assignedDM: "Jordan",
      paperworkStatus: "sent" as const,
      workflowStatus: "Ready for MEL" as const,
      nextActionNeeded: "Load into MEL",
    };
    const csv = buildCandidatesExportCsv([enriched]);
    const lines = csv.split("\r\n");
    const headerLine = lines.find((line) => line.startsWith("Candidate name"));
    const dataLine = lines[lines.length - 1];
    assert.ok(headerLine);
    assert.match(headerLine!, /Candidate name,Email,Phone,Position/);
    assert.match(dataLine, /Alex Rivera,alex@example.com,555-0100,Merchandiser,Dallas,TX,Indeed/);
    assert.match(dataLine, /Taylor,Jordan,Ready for MEL/);
    assert.match(dataLine, /Load into MEL,Sent,Ready for MEL/);
  });

  it("prepends export metadata rows when provided", () => {
    const row = buildScoredWorkflowRow(sampleCandidate());
    const csv = buildCandidatesExportCsv([row], {
      exportDate: "May 28, 2026",
      totalRecords: 1,
      filtersApplied: "Focus: My work (Taylor)",
    });
    assert.match(csv, /^Export Date,/);
    assert.match(csv, /Data As Of,"May 28, 2026"/);
    assert.match(csv, /Total Records,1/);
    assert.match(csv, /Filters Applied,Focus: My work \(Taylor\)/);
    assert.match(csv, /Candidate name,Email,Phone/);
  });

  it("escapes commas and quotes in cell values", () => {
    const row = buildScoredWorkflowRow({
      ...sampleCandidate(),
      firstName: 'Pat "Pro"',
      lastName: "Lee",
      positionName: "Merchandiser, Reset",
    });
    const cells = buildCandidatesExportRow(row);
    assert.equal(cells[0], 'Pat "Pro" Lee');
    assert.equal(cells[3], "Merchandiser, Reset");
    const csv = buildCandidatesExportCsv([row]);
    assert.match(csv, /"Pat ""Pro"" Lee"/);
    assert.match(csv, /"Merchandiser, Reset"/);
  });

  it("maps operational workflow and MEL readiness labels", () => {
    const row = buildScoredWorkflowRow(sampleCandidate());
    const escalated = {
      ...row,
      recruitingActions: { ...row.recruitingActions, priorityList: true },
    };
    assert.equal(operationalWorkflowStateForExport(escalated), "Escalated");

    const unassigned = { ...row, assignedRecruiter: "Unassigned" };
    assert.equal(operationalWorkflowStateForExport(unassigned), "Awaiting Assignment");

    const ready = { ...row, workflowStatus: "Ready for MEL" as const };
    assert.equal(readyForMelExportStatus(ready), "Ready for MEL");
    assert.equal(
      readyForMelExportStatus({ ...row, workflowStatus: "Loaded in MEL" }),
      "Loaded in MEL",
    );
    assert.equal(readyForMelExportStatus(row), "Not ready");
  });

  it("formats match score with level label", () => {
    const row = buildScoredWorkflowRow(sampleCandidate());
    assert.match(formatMatchScoreForExport(row), /% \(/);
  });

  it("uses srs-candidates-export date filename", () => {
    assert.equal(
      candidatesExportFilename(new Date("2026-05-28T15:00:00.000Z")),
      "srs-candidates-export-2026-05-28.csv",
    );
  });
});
