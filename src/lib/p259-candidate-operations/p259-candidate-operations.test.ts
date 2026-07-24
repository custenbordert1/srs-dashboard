import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HiringWorkspaceApplicantRow } from "@/lib/p258-hiring-workspace";
import {
  assertBulkActionAllowed,
  buildExportCsv,
  buildRecruitingIntelligence,
  clearSelection,
  computeProbabilityToComplete,
  computeProbabilityToSign,
  CANDIDATE_OPS_BULK_ACTIONS,
  CANDIDATE_OPS_ROW_ACTIONS,
  CANDIDATE_OPS_WRITE_POLICY,
  enrichCandidateOpsApplicant,
  estimateDaysToHire,
  filterApplicantsByQuickFilters,
  invertSelection,
  matchesQuickFilter,
  selectAllVisible,
  selectionSummary,
  toggleQuickFilter,
  toggleSelection,
} from "@/lib/p259-candidate-operations";

function row(
  partial: Partial<HiringWorkspaceApplicantRow> &
    Pick<HiringWorkspaceApplicantRow, "candidateId">,
): HiringWorkspaceApplicantRow {
  return {
    displayName: partial.displayName ?? `Name ${partial.candidateId}`,
    firstName: partial.firstName ?? "Pat",
    lastName: partial.lastName ?? partial.candidateId,
    hiringScore: partial.hiringScore ?? 70,
    hiringScoreReasons: partial.hiringScoreReasons ?? [],
    distanceMiles: partial.distanceMiles ?? 15,
    appliedDate: partial.appliedDate ?? "2026-07-01T00:00:00.000Z",
    breezyStage: partial.breezyStage ?? "Applied",
    workflowStatus: partial.workflowStatus ?? "Paperwork Needed",
    paperworkStatus: partial.paperworkStatus ?? "not_sent",
    dropboxSignStatus: partial.dropboxSignStatus ?? "Not sent",
    signatureRequestId: partial.signatureRequestId ?? null,
    paperworkTemplateKey: partial.paperworkTemplateKey ?? null,
    recruiter: partial.recruiter ?? "Taylor",
    dm: partial.dm ?? "Field Ops",
    recruiterAssignmentSource: partial.recruiterAssignmentSource ?? null,
    recruiterAssignedAt: partial.recruiterAssignedAt ?? null,
    recruiterAssignedBy: partial.recruiterAssignedBy ?? null,
    recruiterConfirmationStatus: partial.recruiterConfirmationStatus ?? null,
    dmAssignmentSource: partial.dmAssignmentSource ?? null,
    dmAssignedAt: partial.dmAssignedAt ?? null,
    dmAssignedBy: partial.dmAssignedBy ?? null,
    email: partial.email ?? `${partial.candidateId}@example.com`,
    phone: partial.phone ?? "2145550100",
    lastActivity: partial.lastActivity ?? null,
    city: partial.city ?? "Dallas",
    state: partial.state ?? "TX",
    zipCode: partial.zipCode ?? "75201",
    positionId: partial.positionId ?? "job-1",
    positionName: partial.positionName ?? "Merchandiser",
    source: partial.source ?? "Breezy",
    hasResume: partial.hasResume ?? true,
    nextActionNeeded: partial.nextActionNeeded ?? "Send paperwork",
    notes: partial.notes ?? [],
    history: partial.history ?? [],
    paperworkSentAt: partial.paperworkSentAt ?? null,
    paperworkSignedAt: partial.paperworkSignedAt ?? null,
    paperworkViewedAt: partial.paperworkViewedAt ?? null,
    paperworkError: partial.paperworkError ?? null,
    readyForPaperwork: partial.readyForPaperwork ?? true,
    eligibility: partial.eligibility ?? {
      verdict: "Eligible",
      eligible: true,
      gates: [],
      blockingReasons: [],
      attentionReasons: [],
      templateKey: "onboarding_packet",
    },
    ...partial,
  };
}

describe("recruiting intelligence", () => {
  it("computes deterministic sign/complete probabilities and days", () => {
    const applicant = row({ candidateId: "a1", hiringScore: 82, distanceMiles: 12 });
    const sign = computeProbabilityToSign(applicant);
    const complete = computeProbabilityToComplete(applicant);
    const days = estimateDaysToHire(applicant);

    assert.ok(sign >= 0 && sign <= 100);
    assert.ok(complete >= 0 && complete <= 100);
    assert.equal(days, 10);
    assert.deepEqual(computeProbabilityToSign(applicant), sign);
    assert.deepEqual(computeProbabilityToComplete(applicant), complete);
  });

  it("penalizes missing contact and far distance", () => {
    const strong = row({
      candidateId: "strong",
      hiringScore: 85,
      distanceMiles: 10,
      workflowStatus: "Paperwork Needed",
    });
    const weak = row({
      candidateId: "weak",
      hiringScore: 35,
      distanceMiles: 90,
      email: "",
      phone: "",
      recruiter: "Unassigned",
      dm: "Unassigned",
      workflowStatus: "Applied",
      readyForPaperwork: false,
    });
    assert.ok(computeProbabilityToSign(strong) > computeProbabilityToSign(weak));
  });

  it("builds colored intelligence badges", () => {
    const intelligence = buildRecruitingIntelligence(
      row({ candidateId: "b1", hiringScore: 88, distanceMiles: 8 }),
    );
    assert.equal(intelligence.hiringScore, 88);
    assert.ok(intelligence.badges.length >= 7);
    assert.ok(intelligence.badges.every((b) => b.label && b.value && b.tone));
    assert.equal(intelligence.coverageBand, "within");
    assert.equal(intelligence.duplicateRisk, "none");
  });

  it("returns null days for Not Qualified", () => {
    assert.equal(
      estimateDaysToHire(row({ candidateId: "nq", workflowStatus: "Not Qualified" })),
      null,
    );
  });
});

describe("quick filters", () => {
  const sample = [
    row({
      candidateId: "ready",
      readyForPaperwork: true,
      distanceMiles: 12,
      recruiter: "Taylor",
      dm: "Ops",
    }),
    row({
      candidateId: "far",
      readyForPaperwork: false,
      distanceMiles: 55,
      recruiter: "Unassigned",
      dm: "Unassigned",
      workflowStatus: "Applied",
      email: "",
      phone: "",
      firstName: "",
      lastName: "",
    }),
    row({
      candidateId: "signed",
      readyForPaperwork: false,
      paperworkStatus: "signed",
      workflowStatus: "Signed",
      paperworkSignedAt: "2026-07-20T00:00:00.000Z",
      distanceMiles: 8,
    }),
    row({
      candidateId: "viewed",
      readyForPaperwork: false,
      paperworkStatus: "viewed",
      paperworkViewedAt: "2026-07-19T00:00:00.000Z",
      distanceMiles: 18,
      workflowStatus: "Paperwork Sent",
    }),
  ];

  it("matches individual filters", () => {
    assert.equal(matchesQuickFilter(sample[0]!, "only_ready"), true);
    assert.equal(matchesQuickFilter(sample[1]!, "needs_recruiter"), true);
    assert.equal(matchesQuickFilter(sample[1]!, "needs_dm"), true);
    assert.equal(matchesQuickFilter(sample[1]!, "distance_gt_40"), true);
    assert.equal(matchesQuickFilter(sample[0]!, "distance_lt_20"), true);
    assert.equal(matchesQuickFilter(sample[1]!, "missing_email"), true);
    assert.equal(matchesQuickFilter(sample[1]!, "missing_phone"), true);
    assert.equal(matchesQuickFilter(sample[1]!, "incomplete_identity"), true);
    assert.equal(matchesQuickFilter(sample[2]!, "signed"), true);
    assert.equal(matchesQuickFilter(sample[3]!, "viewed"), true);
  });

  it("ANDs multiple quick filters", () => {
    const filtered = filterApplicantsByQuickFilters(sample, [
      "distance_lt_20",
      "signed",
    ]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.candidateId, "signed");
  });

  it("toggles filters", () => {
    assert.deepEqual(toggleQuickFilter([], "only_ready"), ["only_ready"]);
    assert.deepEqual(toggleQuickFilter(["only_ready"], "only_ready"), []);
  });
});

describe("bulk selection helpers", () => {
  it("toggles, selects all, clears, and summarizes", () => {
    let selected = toggleSelection([], "a");
    selected = toggleSelection(selected, "b");
    assert.deepEqual(selected, ["a", "b"]);
    selected = toggleSelection(selected, "a");
    assert.deepEqual(selected, ["b"]);

    selected = selectAllVisible(["a", "b", "c"], selected);
    assert.deepEqual(selected.sort(), ["a", "b", "c"]);

    const summary = selectionSummary(selected, ["a", "b"]);
    assert.equal(summary.selectedCount, 3);
    assert.equal(summary.visibleSelectedCount, 2);
    assert.equal(summary.allVisibleSelected, true);

    selected = invertSelection(["a", "b"], ["a", "c"]);
    assert.ok(selected.includes("b"));
    assert.ok(selected.includes("c"));
    assert.ok(!selected.includes("a"));

    assert.deepEqual(clearSelection(), []);
  });

  it("blocks bulk send intents and allows safe bulk actions", () => {
    assert.equal(assertBulkActionAllowed("bulk_send").ok, false);
    assert.equal(assertBulkActionAllowed("assign_recruiter").ok, true);
    assert.ok(CANDIDATE_OPS_BULK_ACTIONS.every((action) => action.allowsSend === false));
    assert.ok(CANDIDATE_OPS_BULK_ACTIONS.every((action) => action.requiresConfirm === true));
  });

  it("builds CSV export for selected rows", () => {
    const csv = buildExportCsv([
      {
        candidateId: "c1",
        displayName: 'Pat "Quote"',
        email: "a@b.com",
        phone: "2145550100",
        hiringScore: 70,
        workflowStatus: "Applied",
        paperworkStatus: "not_sent",
        recruiter: "Taylor",
        dm: "Ops",
        distanceMiles: 12.4,
      },
    ]);
    assert.ok(csv.includes("candidateId,displayName"));
    assert.ok(csv.includes('"Pat ""Quote"""'));
    assert.ok(csv.includes("12"));
  });
});

describe("enrich + safety policy", () => {
  it("enriches applicant with intelligence, paperwork, workflow, communications", () => {
    const enriched = enrichCandidateOpsApplicant(
      row({
        candidateId: "e1",
        notes: ["Called candidate"],
        paperworkSentAt: "2026-07-10T00:00:00.000Z",
        paperworkStatus: "sent",
        signatureRequestId: "sig-1",
      }),
    );
    assert.ok(enriched.intelligence.badges.length > 0);
    assert.ok(enriched.paperworkPanel.actions.some((a) => a.id === "send_paperwork"));
    assert.ok(enriched.workflowStages.some((s) => s.id === "Applied"));
    assert.ok(enriched.communications.some((c) => c.sparse === true || c.kind === "email"));
  });

  it("exposes confirm-required write actions and no auto writes", () => {
    assert.equal(CANDIDATE_OPS_WRITE_POLICY.autoWrites, false);
    assert.equal(CANDIDATE_OPS_WRITE_POLICY.bulkSends, false);
    assert.deepEqual(CANDIDATE_OPS_WRITE_POLICY.allowedLiveWrites, [
      "assign_recruiter",
      "assign_dm",
      "move_stage",
      "send_paperwork",
    ]);
    assert.equal(CANDIDATE_OPS_WRITE_POLICY.paperworkSendMode, "live_confirm_one_at_a_time");
    const writeActions = CANDIDATE_OPS_ROW_ACTIONS.filter((a) => a.mayWrite);
    assert.ok(writeActions.every((a) => a.requiresConfirm));
    assert.equal(CANDIDATE_OPS_ROW_ACTIONS.length, 14);
    assert.equal(
      CANDIDATE_OPS_ROW_ACTIONS.find((a) => a.id === "send_paperwork")?.mayWrite,
      true,
    );
  });
});
