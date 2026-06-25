import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCandidateExportFilename,
  formatExportDate,
  mapWorkItemToExportRow,
  splitCandidateExportName,
  summarizeSlaStatus,
} from "@/lib/recruiter-command-center/format-candidate-export";
import { buildCandidateExportSheetData } from "@/lib/recruiter-command-center/export-candidates-xlsx";
import { filterCommandCenterWorkQueue } from "@/lib/recruiter-command-center/filter-work-queue";
import { buildXlsxBuffer } from "@/lib/recruiter-command-center/write-xlsx-buffer";
import type { RecruiterCommandCenterWorkItem } from "@/lib/recruiter-command-center/types";
import { buildCandidateSlaSnapshot } from "@/lib/candidate-action-sla";
import { emptyRecruitingActions, markNeedsFollowUp } from "@/lib/candidate-recruiting-actions";

function sampleItem(
  patch: Partial<RecruiterCommandCenterWorkItem> = {},
): RecruiterCommandCenterWorkItem {
  return {
    candidateId: "c1",
    candidateName: "Sam Rivera",
    email: "sam@example.com",
    phone: "555-0100",
    city: "Dallas",
    state: "TX",
    recruiter: "Taylor Custenborder",
    assignedDm: "DM South",
    positionName: "Merchandiser",
    positionId: "pos-1",
    grade: "A",
    confidencePercent: 82,
    workflowStatus: "Applied",
    category: "new-applicants",
    categoryLabel: "New applicants",
    nextAction: "Screen candidate",
    actionType: "screen-candidate",
    actionPriority: "medium",
    actionDueDate: "2026-06-25",
    actionOverdue: false,
    priorityScore: 72,
    priorityLevel: "high",
    priorityReasons: ["Grade A"],
    positionUrgency: "At Risk",
    slaRisk: false,
    slaStatus: "On track",
    coverageUrgent: true,
    queueAgeHours: 12,
    followUpDueDate: null,
    paperworkStatus: "not_sent",
    paperworkStatusLabel: "Not sent",
    readyForMel: false,
    lastActivityDate: "2026-06-24T10:00:00.000Z",
    notesText: "Strong retail background",
    ...patch,
  };
}

describe("candidate export", () => {
  it("builds timestamped export filename", () => {
    assert.equal(
      buildCandidateExportFilename(new Date("2026-06-25T12:00:00.000Z")),
      "recruiter-candidates-export-2026-06-25.xlsx",
    );
  });

  it("maps work items to export columns", () => {
    const row = mapWorkItemToExportRow(
      sampleItem({
        followUpDueDate: "2026-06-06",
        lastActivityDate: "2026-06-24T10:00:00.000Z",
      }),
    );
    assert.equal(row["First name"], "Sam");
    assert.equal(row["Last name"], "Rivera");
    assert.equal(row.Confidence, "82%");
    assert.equal(row["Ready for MEL"], "No");
    assert.equal(row.Notes, "Strong retail background");
    assert.equal(row["Follow-up due date"], "6/6/2026");
    assert.equal(row["Last activity date"], "6/24/2026");
    assert.ok(!row["Follow-up due date"].includes(":"));
    assert.ok(!row["Last activity date"].match(/\b(AM|PM)\b/i));
  });

  it("splits single-word candidate names into first name only", () => {
    const row = mapWorkItemToExportRow(sampleItem({ candidateName: "Madonna" }));
    assert.equal(row["First name"], "Madonna");
    assert.equal(row["Last name"], "");
  });

  it("formats export dates as M/D/YYYY without time", () => {
    assert.equal(formatExportDate("2026-06-06"), "6/6/2026");
    assert.equal(formatExportDate("2025-12-01"), "12/1/2025");
    const dated = formatExportDate("2026-06-24T12:00:00.000Z");
    assert.match(dated, /^\d{1,2}\/\d{1,2}\/\d{4}$/);
    assert.ok(!dated.includes(":"));
    assert.ok(!/\b(AM|PM)\b/i.test(dated));
    assert.equal(splitCandidateExportName("Alex Kim").firstName, "Alex");
    assert.equal(splitCandidateExportName("Alex Kim").lastName, "Kim");
  });

  it("builds sheet rows with header order", () => {
    const sheet = buildCandidateExportSheetData([sampleItem()]);
    const header = sheet[0] ?? [];
    assert.equal(header[0], "First name");
    assert.equal(header[1], "Last name");
    assert.ok(!header.includes("Candidate name"));
    assert.equal(sheet[1]?.[0], "Sam");
    assert.equal(sheet[1]?.[1], "Rivera");
  });

  it("summarizes SLA status", () => {
    const referenceMs = Date.parse("2026-06-25T12:00:00.000Z");
    const sla = buildCandidateSlaSnapshot({
      appliedDate: "2026-06-01T10:00:00.000Z",
      workflowStatus: "Applied",
      lastActionAt: null,
      recruitingActions: markNeedsFollowUp(emptyRecruitingActions(), referenceMs),
      followUpDueAt: "2026-06-20T10:00:00.000Z",
      snoozedUntil: null,
      referenceMs,
    });
    const status = summarizeSlaStatus({ sla, slaRisk: true });
    assert.ok(status.includes("Follow-up overdue"));
  });

  it("builds a valid xlsx zip buffer", () => {
    const buffer = buildXlsxBuffer(buildCandidateExportSheetData([sampleItem()]));
    assert.equal(buffer[0], 0x50);
    assert.equal(buffer[1], 0x4b);
    assert.ok(buffer.length > 100);
  });

  it("filters work queue by search and priority", () => {
    const items = [
      sampleItem({ candidateId: "a", candidateName: "Alex Kim", priorityLevel: "high" }),
      sampleItem({ candidateId: "b", candidateName: "Jordan Lee", priorityLevel: "low" }),
    ];
    const filtered = filterCommandCenterWorkQueue(items, {
      searchQuery: "alex",
      priorityFilter: "all",
      categoryFilter: "all",
      actionFilter: "all",
      coverageFilter: "all",
      overdueFilter: "all",
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.candidateId, "a");
  });
});
