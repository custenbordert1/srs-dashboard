import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PaperworkSendGate } from "@/lib/autonomous-paperwork-send-engine/types";
import type { JobManagementRow } from "@/lib/job-management/job-management-rows";
import {
  buildHiringWorkspaceModel,
  classifyEligibilityVerdict,
  compareHiringWorkspaceApplicants,
  computeHiringScore,
  computeWindowSlice,
  filterApplicantsByPipeline,
  isReadyForPaperwork,
  mapEligibilityFromApplicantInput,
  sortHiringWorkspaceApplicants,
  type HiringWorkspaceApplicantInput,
  type HiringWorkspaceApplicantRow,
} from "@/lib/p258-hiring-workspace";

function applicant(
  partial: Partial<HiringWorkspaceApplicantInput> &
    Pick<HiringWorkspaceApplicantInput, "candidateId" | "positionId" | "workflowStatus">,
): HiringWorkspaceApplicantInput {
  return {
    firstName: "Pat",
    lastName: partial.candidateId,
    email: `${partial.candidateId}@example.com`,
    phone: "2145550100",
    city: "Dallas",
    state: "TX",
    assignedRecruiter: "Taylor",
    assignedDM: "Field Ops",
    paperworkStatus: "not_sent",
    ...partial,
  };
}

function breezyRow(overrides: Partial<JobManagementRow> = {}): JobManagementRow {
  return {
    rowId: "breezy:job-1",
    kind: "breezy",
    title: "Merchandiser Dallas",
    city: "Dallas",
    state: "TX",
    displayLocation: "Dallas, TX",
    status: "published",
    statusLabel: "Published",
    applicants: 3,
    postedDate: "2026-06-01T12:00:00.000Z",
    source: "Breezy",
    lastSynced: "2026-07-23T16:00:00.000Z",
    breezyJobId: "job-1",
    editable: false,
    canPush: false,
    canClone: true,
    canDelete: false,
    breezyJob: {
      breezyJobId: "job-1",
      title: "Merchandiser Dallas",
      city: "Dallas",
      usState: "TX",
      displayLocation: "Dallas, TX",
      pipelineStatus: "published",
      applicantCount: 3,
      postedDate: "2026-06-01T12:00:00.000Z",
      source: "Breezy",
      description: "Stock and reset shelves.",
    },
    ...overrides,
  };
}

function gate(id: PaperworkSendGate["id"], passed: boolean, detail?: string): PaperworkSendGate {
  return { id, label: id, passed, detail: detail ?? null };
}

describe("computeHiringScore", () => {
  it("returns 0–100 with all twelve factor reasons", () => {
    const result = computeHiringScore(
      applicant({
        candidateId: "ready",
        positionId: "job-1",
        workflowStatus: "Paperwork Needed",
        distanceMiles: 12,
        actionType: "send-paperwork",
      }),
    );
    assert.ok(result.score >= 0 && result.score <= 100);
    assert.equal(result.reasons.length, 12);
    assert.ok(result.reasons.every((row) => row.weight > 0));
    assert.ok(result.score >= 70, `expected strong score, got ${result.score}`);
  });

  it("penalizes missing email, unassigned recruiter, and far distance", () => {
    const strong = computeHiringScore(
      applicant({
        candidateId: "a",
        positionId: "job-1",
        workflowStatus: "Qualified",
        distanceMiles: 10,
      }),
    );
    const weak = computeHiringScore(
      applicant({
        candidateId: "b",
        positionId: "job-1",
        workflowStatus: "Applied",
        distanceMiles: 120,
        email: "",
        phone: "",
        assignedRecruiter: "Unassigned",
        assignedDM: "Unassigned",
        firstName: "",
        lastName: "",
      }),
    );
    assert.ok(strong.score > weak.score);
    assert.ok(weak.reasons.some((r) => r.id === "email" && r.points === 0));
    assert.ok(weak.reasons.some((r) => r.id === "recruiter" && r.points < 50));
  });

  it("is deterministic for the same input", () => {
    const input = applicant({
      candidateId: "d1",
      positionId: "job-1",
      workflowStatus: "Paperwork Sent",
      distanceMiles: 22,
      paperworkStatus: "sent",
      signatureRequestId: "sig-1",
    });
    assert.deepEqual(computeHiringScore(input), computeHiringScore(input));
  });
});

describe("isReadyForPaperwork + sort", () => {
  it("flags Paperwork Needed and send-paperwork action", () => {
    assert.equal(
      isReadyForPaperwork(
        applicant({ candidateId: "1", positionId: "job-1", workflowStatus: "Paperwork Needed" }),
      ),
      true,
    );
    assert.equal(
      isReadyForPaperwork(
        applicant({
          candidateId: "2",
          positionId: "job-1",
          workflowStatus: "Qualified",
          actionType: "send-paperwork",
        }),
      ),
      true,
    );
    assert.equal(
      isReadyForPaperwork(
        applicant({ candidateId: "3", positionId: "job-1", workflowStatus: "Applied" }),
      ),
      false,
    );
  });

  it("sorts Ready for Paperwork → score → newest applied", () => {
    const rows: Array<
      Pick<HiringWorkspaceApplicantRow, "candidateId" | "readyForPaperwork" | "hiringScore" | "appliedDate">
    > = [
      {
        candidateId: "old-high",
        readyForPaperwork: false,
        hiringScore: 90,
        appliedDate: "2026-01-01T00:00:00.000Z",
      },
      {
        candidateId: "ready-low",
        readyForPaperwork: true,
        hiringScore: 40,
        appliedDate: "2026-01-02T00:00:00.000Z",
      },
      {
        candidateId: "ready-high-old",
        readyForPaperwork: true,
        hiringScore: 80,
        appliedDate: "2026-01-01T00:00:00.000Z",
      },
      {
        candidateId: "ready-high-new",
        readyForPaperwork: true,
        hiringScore: 80,
        appliedDate: "2026-02-01T00:00:00.000Z",
      },
      {
        candidateId: "new-low",
        readyForPaperwork: false,
        hiringScore: 50,
        appliedDate: "2026-03-01T00:00:00.000Z",
      },
    ];

    const sorted = sortHiringWorkspaceApplicants(rows);
    assert.deepEqual(
      sorted.map((row) => row.candidateId),
      ["ready-high-new", "ready-high-old", "ready-low", "old-high", "new-low"],
    );
    assert.ok(compareHiringWorkspaceApplicants(sorted[0], sorted[1]) <= 0);
  });
});

describe("eligibility mapping", () => {
  it("classifies all-pass as Eligible", () => {
    const result = classifyEligibilityVerdict([
      gate("recruiter_assigned", true),
      gate("paperwork_needed", true),
      gate("valid_email", true),
    ]);
    assert.equal(result.verdict, "Eligible");
  });

  it("classifies hard gate failures as Blocked", () => {
    const result = classifyEligibilityVerdict([
      gate("recruiter_assigned", true),
      gate("valid_email", false, "Missing candidate email."),
      gate("paperwork_needed", false, "Current status: Applied."),
    ]);
    assert.equal(result.verdict, "Blocked");
    assert.ok(result.blockingReasons.some((r) => /email/i.test(r)));
  });

  it("classifies soft-only failures as Needs Attention", () => {
    const result = classifyEligibilityVerdict([
      gate("valid_email", true),
      gate("not_rejected", true),
      gate("not_inactive", true),
      gate("not_signed", true),
      gate("no_duplicate", true),
      gate("recruiter_assigned", false, "Awaiting recruiter assignment."),
      gate("paperwork_needed", false, "Current status: Applied."),
    ]);
    assert.equal(result.verdict, "Needs Attention");
    assert.equal(result.blockingReasons.length, 0);
    assert.ok(result.attentionReasons.length >= 1);
  });

  it("maps applicant input through production gate helper", () => {
    const eligibleish = mapEligibilityFromApplicantInput(
      applicant({
        candidateId: "e1",
        positionId: "job-1",
        workflowStatus: "Paperwork Needed",
        actionType: "send-paperwork",
        email: "e1@example.com",
        assignedRecruiter: "Taylor",
      }),
      {
        jobsByPositionId: new Map([
          [
            "job-1",
            {
              breezyJobId: "job-1",
              title: "Merchandiser Dallas",
              city: "Dallas",
              usState: "TX",
              displayLocation: "Dallas, TX",
              pipelineStatus: "published",
              applicantCount: 1,
              postedDate: null,
              source: "Breezy",
            },
          ],
        ]),
      },
    );
    assert.ok(eligibleish.gates.length >= 8);
    assert.ok(["Eligible", "Blocked", "Needs Attention"].includes(eligibleish.verdict));
    // published job present + paperwork needed + recruiter + email + send action → should be eligible
    assert.equal(eligibleish.verdict, "Eligible");
    assert.equal(eligibleish.eligible, true);

    const blocked = mapEligibilityFromApplicantInput(
      applicant({
        candidateId: "e2",
        positionId: "job-1",
        workflowStatus: "Not Qualified",
        email: "",
        assignedRecruiter: "Unassigned",
      }),
    );
    assert.equal(blocked.verdict, "Blocked");
    assert.equal(blocked.eligible, false);
  });
});

describe("pipeline filter + workspace model", () => {
  it("filters applicants by pipeline bucket", () => {
    const rows = [
      applicant({ candidateId: "1", positionId: "job-1", workflowStatus: "Applied" }),
      applicant({
        candidateId: "2",
        positionId: "job-1",
        workflowStatus: "Qualified",
        stage: "Interview scheduled",
      }),
      applicant({ candidateId: "3", positionId: "job-1", workflowStatus: "Paperwork Needed" }),
      applicant({
        candidateId: "4",
        positionId: "job-1",
        workflowStatus: "Not Qualified",
        stage: "Archived",
      }),
    ];
    assert.equal(filterApplicantsByPipeline(rows, "Applied").length, 1);
    assert.equal(filterApplicantsByPipeline(rows, "Interview").length, 1);
    assert.equal(filterApplicantsByPipeline(rows, "Paperwork Needed").length, 1);
    assert.equal(filterApplicantsByPipeline(rows, "Rejected").length, 1);
    assert.equal(filterApplicantsByPipeline(rows, "Archived").length, 1);
  });

  it("builds ribbon, sorted applicants, and preview-only write policy", () => {
    const model = buildHiringWorkspaceModel({
      row: breezyRow(),
      applicants: [
        applicant({
          candidateId: "late",
          positionId: "job-1",
          workflowStatus: "Applied",
          appliedDate: "2026-07-20T10:00:00.000Z",
          distanceMiles: 18,
        }),
        applicant({
          candidateId: "ready",
          positionId: "job-1",
          workflowStatus: "Paperwork Needed",
          actionType: "send-paperwork",
          appliedDate: "2026-07-10T10:00:00.000Z",
          distanceMiles: 8,
        }),
        applicant({
          candidateId: "signed",
          positionId: "job-1",
          workflowStatus: "Signed",
          paperworkStatus: "signed",
          appliedDate: "2026-06-01T10:00:00.000Z",
          distanceMiles: 25,
          paperworkSignedAt: "2026-07-01T10:00:00.000Z",
        }),
      ],
      options: { candidatesFromCache: true, workflowsLoaded: true },
    });

    assert.equal(model.ribbon.applicants, 3);
    assert.equal(model.ribbon.paperworkNeeded, 1);
    assert.equal(model.ribbon.signed, 1);
    assert.equal(model.ribbon.averageDistanceMiles, 17);
    assert.equal(model.ribbon.newestApplicantAt, "2026-07-20T10:00:00.000Z");
    assert.equal(model.ribbon.oldestApplicantAt, "2026-06-01T10:00:00.000Z");
    assert.equal(model.ribbon.lastSync, "2026-07-23T16:00:00.000Z");
    assert.equal(model.applicants[0]?.candidateId, "ready");
    assert.ok(model.applicants[0]!.hiringScore > 0);
    assert.ok(model.pipeline.some((b) => b.id === "Paperwork Needed" && b.count === 1));
    assert.equal(model.writePolicy.autoWrites, false);
    assert.equal(model.writePolicy.paperworkSendMode, "preview_confirm_only");
    assert.ok(model.dataNotes.some((n) => /preview/i.test(n)));
  });
});

describe("computeWindowSlice", () => {
  it("windows a large list with overscan", () => {
    const slice = computeWindowSlice({
      total: 500,
      scrollTop: 2000,
      viewportHeight: 400,
      rowHeight: 48,
      overscan: 4,
    });
    assert.ok(slice.startIndex < slice.endIndex);
    assert.ok(slice.endIndex - slice.startIndex < 30);
    assert.equal(slice.totalHeight, 500 * 48);
    assert.equal(slice.offsetY, slice.startIndex * 48);
  });
});
