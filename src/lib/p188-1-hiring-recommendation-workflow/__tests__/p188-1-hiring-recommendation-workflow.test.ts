import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildCandidateContextFromWorkflow,
  buildRecommendHirePreview,
  classifyUnresolvedRecruiters,
  detectOnboardingBypassFindings,
  executeRecommendHire,
  forecastP187EligibilityAfterRecommendations,
  planOnboardingReconcileGuard,
  previewBulkRecommendHire,
  readP1881Flags,
  recoverJobAssignment,
  recoverRecruiterAssignment,
  resetP1881AuditMemoryForTests,
  listP1881AuditMemoryForTests,
  validateRecommendHire,
  P188_1_RECOMMENDED_STAGE,
  type P1881CandidateContext,
} from "@/lib/p188-1-hiring-recommendation-workflow";
import { mapToLifecycleState } from "@/lib/p187-hr-to-oa-canary/adapter";

const NOW = "2026-07-13T18:00:00.000Z";
const NOW_MS = Date.parse(NOW);

function clearFlags() {
  for (const k of [
    "P188_RECOMMENDATION_UI",
    "P188_RECOMMENDATION_API",
    "P188_RECRUITER_ASSIGNMENT_RECOVERY",
    "P188_JOB_ASSIGNMENT_RECOVERY",
    "P188_BULK_RECOMMENDATION_PREVIEW",
    "P188_BULK_RECOMMENDATION_EXECUTION",
    "P188_BYPASS_FINDINGS_DASHBOARD",
    "P188_PREVENT_ONBOARDING_MIDFUNNEL_BYPASS",
  ]) {
    delete process.env[k];
  }
}

function wf(
  partial: Partial<CandidateWorkflowRecord> & { candidateId: string },
): CandidateWorkflowRecord {
  return {
    candidateId: partial.candidateId,
    workflowStatus: partial.workflowStatus ?? "Needs Review",
    notes: partial.notes ?? [],
    assignedRecruiter: partial.assignedRecruiter ?? "Taylor",
    assignedDM: partial.assignedDM ?? "Field Ops",
    lastActionAt: partial.lastActionAt ?? NOW,
    nextActionNeeded: partial.nextActionNeeded ?? "",
    history: partial.history ?? [
      {
        id: "h1",
        type: "status",
        message: "Status changed to Needs Review.",
        createdAt: NOW,
      },
    ],
    recruitingActions: partial.recruitingActions ?? emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    signatureRequestId: partial.signatureRequestId ?? null,
    paperworkTemplateKey: null,
    paperworkSentAt: partial.paperworkSentAt ?? null,
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkStatus: partial.paperworkStatus ?? "not_sent",
    paperworkError: null,
    onboardingContactEmail: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    recommendedStage: partial.recommendedStage ?? null,
    progressionReason: partial.progressionReason ?? null,
    updatedAt: partial.updatedAt ?? NOW,
  };
}

function eligibleContext(id = "cand-1", patch: Partial<P1881CandidateContext> = {}): P1881CandidateContext {
  return {
    candidateId: id,
    workflowExists: true,
    workflowStatus: "Needs Review",
    recommendedStage: null,
    progressionReason: null,
    notes: [],
    assignedRecruiter: "Taylor",
    assignedDM: "Field Ops",
    recruiterResolved: true,
    recruiterId: "Taylor",
    jobResolved: true,
    jobId: "job-1",
    jobLabel: "Merchandiser",
    identityResolved: true,
    reviewCompleted: true,
    holdFlags: [],
    withdrawn: false,
    archived: false,
    hasPriorRecommendation: false,
    hasPriorOperatorApproval: false,
    paperworkActive: false,
    paperworkStatus: "not_sent",
    conflictingOperation: false,
    productionRecordVersion: `${NOW}:Needs Review:1:`,
    expectedProductionRecordVersion: null,
    stale: false,
    updatedAt: NOW,
    lastActionAt: NOW,
    ...patch,
  };
}

describe("P188.1 hiring recommendation workflow", () => {
  beforeEach(() => {
    clearFlags();
    resetP1881AuditMemoryForTests();
  });

  it("feature flags default off", () => {
    const f = readP1881Flags();
    assert.equal(f.recommendationUi, false);
    assert.equal(f.recommendationApi, false);
    assert.equal(f.recruiterAssignmentRecovery, false);
    assert.equal(f.jobAssignmentRecovery, false);
    assert.equal(f.bulkRecommendationPreview, false);
    assert.equal(f.bulkRecommendationExecution, false);
    assert.equal(f.bypassFindingsDashboard, false);
    assert.equal(f.preventOnboardingMidfunnelBypass, false);
  });

  it("eligible recruiter recommendation validates", () => {
    const v = validateRecommendHire({
      actor: "u1",
      role: "recruiter",
      reason: "Strong retail fit for role",
      context: eligibleContext(),
    });
    assert.equal(v.eligible, true);
    assert.equal(v.paperworkWillBeSent, false);
    assert.equal(v.operatorApprovalWillOccur, false);
    assert.equal(v.expectedResultingState, P188_1_RECOMMENDED_STAGE);
  });

  it("missing recruiter block", () => {
    const v = validateRecommendHire({
      actor: "u1",
      role: "recruiter",
      reason: "Strong retail fit for role",
      context: eligibleContext("c", {
        recruiterResolved: false,
        recruiterId: null,
        assignedRecruiter: "Unassigned",
      }),
    });
    assert.equal(v.eligible, false);
    assert.ok(v.blockers.some((b) => /recruiter_resolved/.test(b)));
  });

  it("unresolved job block", () => {
    const v = validateRecommendHire({
      actor: "u1",
      role: "recruiter",
      reason: "Strong retail fit for role",
      context: eligibleContext("c", { jobResolved: false, jobId: null }),
    });
    assert.equal(v.eligible, false);
    assert.ok(v.blockers.some((b) => /job_resolved/.test(b)));
  });

  it("hold block", () => {
    const v = validateRecommendHire({
      actor: "u1",
      role: "recruiter",
      reason: "Strong retail fit for role",
      context: eligibleContext("c", { holdFlags: ["[HOLD] client"] }),
    });
    assert.equal(v.eligible, false);
    assert.ok(v.blockers.some((b) => /no_active_hold/.test(b)));
  });

  it("withdrawn block", () => {
    const v = validateRecommendHire({
      actor: "u1",
      role: "recruiter",
      reason: "Strong retail fit for role",
      context: eligibleContext("c", { withdrawn: true }),
    });
    assert.equal(v.eligible, false);
    assert.ok(v.blockers.some((b) => /not_withdrawn/.test(b)));
  });

  it("stale-state block", () => {
    const v = validateRecommendHire({
      actor: "u1",
      role: "recruiter",
      reason: "Strong retail fit for role",
      context: eligibleContext("c", { stale: true }),
    });
    assert.equal(v.eligible, false);
    assert.ok(v.blockers.some((b) => /fresh_record_version/.test(b)));
  });

  it("duplicate recommendation prevention", () => {
    const v = validateRecommendHire({
      actor: "u1",
      role: "recruiter",
      reason: "Strong retail fit for role",
      context: eligibleContext("c", {
        hasPriorRecommendation: true,
        recommendedStage: P188_1_RECOMMENDED_STAGE,
      }),
    });
    assert.equal(v.eligible, false);
    assert.ok(v.blockers.some((b) => /no_prior_recommendation/.test(b)));
  });

  it("prior approval block", () => {
    const v = validateRecommendHire({
      actor: "u1",
      role: "recruiter",
      reason: "Strong retail fit for role",
      context: eligibleContext("c", { hasPriorOperatorApproval: true }),
    });
    assert.equal(v.eligible, false);
  });

  it("paperwork active block", () => {
    const v = validateRecommendHire({
      actor: "u1",
      role: "recruiter",
      reason: "Strong retail fit for role",
      context: eligibleContext("c", {
        paperworkActive: true,
        paperworkStatus: "sent",
      }),
    });
    assert.equal(v.eligible, false);
  });

  it("recommendation audit on success and no paperwork/MEL/approval", async () => {
    let upserted: Record<string, unknown> | null = null;
    let observed = false;
    const result = await executeRecommendHire(
      {
        candidateId: "cand-ok",
        actor: "recruiter-1",
        role: "recruiter",
        reason: "Excellent merchandising background",
        source: "test",
        context: eligibleContext("cand-ok"),
      },
      {
        upsert: async (input) => {
          upserted = input as unknown as Record<string, unknown>;
          return {
            ...wf({ candidateId: "cand-ok" }),
            recommendedStage: P188_1_RECOMMENDED_STAGE,
            workflowStatus: "Needs Review",
            paperworkStatus: "not_sent",
          };
        },
        observe: async () => {
          observed = true;
        },
      },
      { recommendationApi: true },
    );
    assert.equal(result.ok, true);
    assert.equal(result.recommendedStage, P188_1_RECOMMENDED_STAGE);
    assert.equal(result.paperworkSendsAttempted, 0);
    assert.equal(result.approvalsAttempted, 0);
    assert.equal(result.melWritesAttempted, 0);
    assert.equal(observed, true);
    assert.equal(upserted?.recommendedStage, P188_1_RECOMMENDED_STAGE);
    assert.ok(result.auditId);
    assert.ok(listP1881AuditMemoryForTests().some((a) => a.action === "recommend_hire"));
    assert.equal(
      mapToLifecycleState({
        workflowStatus: "Needs Review",
        recommendedStage: P188_1_RECOMMENDED_STAGE,
      }),
      "HIRING_RECOMMENDATION",
    );
  });

  it("audit failure rollback (fail closed)", async () => {
    const result = await executeRecommendHire(
      {
        candidateId: "cand-aud",
        actor: "recruiter-1",
        role: "recruiter",
        reason: "Excellent merchandising background",
        source: "test",
        context: eligibleContext("cand-aud"),
      },
      {
        upsert: async () =>
          ({
            ...wf({ candidateId: "cand-aud" }),
            recommendedStage: P188_1_RECOMMENDED_STAGE,
            paperworkStatus: "not_sent",
          }) as CandidateWorkflowRecord,
        auditFail: true,
      },
      { recommendationApi: true },
    );
    assert.equal(result.ok, false);
    assert.ok(result.blockers.includes("audit_persistence_failed"));
  });

  it("recruiter recovery and ambiguous handling", () => {
    const resolved = recoverRecruiterAssignment(
      {
        candidateId: "c1",
        persistedRecruiter: "Unassigned",
        breezyAssignee: "Taylor",
      },
      { recruiterAssignmentRecovery: true },
    );
    assert.equal(resolved.resolved, true);
    assert.equal(resolved.recruiter, "Taylor");

    const ambiguous = recoverRecruiterAssignment(
      {
        candidateId: "c2",
        persistedRecruiter: "Taylor",
        breezyAssignee: "Alex",
      },
      { recruiterAssignmentRecovery: true },
    );
    assert.equal(ambiguous.ambiguous, true);
    assert.equal(ambiguous.resolved, false);

    const classified = classifyUnresolvedRecruiters([resolved, ambiguous]);
    assert.equal(classified.resolved.length, 1);
    assert.equal(classified.ambiguous.length, 1);
  });

  it("job mapping recovery and ambiguous handling", () => {
    const catalog = [
      {
        jobId: "job-1",
        friendlyId: "FRI-1",
        title: "Merchandiser",
        city: "Austin",
        state: "TX",
        aliases: ["alias-1"],
      },
      {
        jobId: "job-2",
        friendlyId: "FRI-2",
        title: "Merchandiser",
        city: "Austin",
        state: "TX",
      },
    ];
    const ok = recoverJobAssignment(
      {
        candidateId: "c1",
        breezyPositionId: "job-1",
        catalog,
      },
      { jobAssignmentRecovery: true },
    );
    assert.equal(ok.resolved, true);
    assert.equal(ok.jobId, "job-1");

    const amb = recoverJobAssignment(
      {
        candidateId: "c2",
        title: "Merchandiser",
        city: "Austin",
        state: "TX",
        catalog,
      },
      { jobAssignmentRecovery: true },
    );
    assert.equal(amb.ambiguous, true);
    assert.equal(amb.resolved, false);
  });

  it("onboarding bypass detection and prevent guard", () => {
    const findings = detectOnboardingBypassFindings(
      [
        wf({
          candidateId: "b1",
          workflowStatus: "Paperwork Sent",
          paperworkStatus: "sent",
          paperworkSentAt: NOW,
          history: [
            {
              id: "1",
              type: "status",
              message: "Status changed to Applied.",
              createdAt: NOW,
            },
            {
              id: "2",
              type: "status",
              message: "Reconciled workflow from onboarding (sent).",
              createdAt: NOW,
            },
          ],
        }),
      ],
      { bypassFindingsDashboard: true },
    );
    assert.ok(findings.length >= 1);
    assert.equal(findings[0]!.createdHiringRecommendation, false);
    assert.equal(findings[0]!.createdOperatorApproved, false);

    const guard = planOnboardingReconcileGuard({
      workflowStatus: "Applied",
      targetWorkflowStatus: "Paperwork Sent",
      forceFlags: { preventOnboardingMidfunnelBypass: true },
    });
    assert.equal(guard.allowWorkflowStatusAdvance, false);
    assert.equal(guard.createsHiringRecommendation, false);
    assert.equal(guard.createsPaperworkNeeded, false);
  });

  it("no automatic approval; preview confirms no paperwork", () => {
    const validation = validateRecommendHire({
      actor: "u1",
      role: "executive",
      reason: "Ready for operator decision",
      context: eligibleContext(),
    });
    const preview = buildRecommendHirePreview({
      context: eligibleContext(),
      validation,
      reason: "Ready for operator decision",
    });
    assert.equal(preview.confirmationNoPaperwork, true);
    assert.equal(validation.operatorApprovalWillOccur, false);
  });

  it("P186 observation path and P187 eligibility after recommendation", async () => {
    const result = await executeRecommendHire(
      {
        candidateId: "cand-p187",
        actor: "dm-1",
        role: "dm",
        reason: "Completed review — recommend hire",
        source: "test",
        context: eligibleContext("cand-p187"),
      },
      {
        upsert: async () =>
          ({
            ...wf({
              candidateId: "cand-p187",
              assignedRecruiter: "Taylor",
            }),
            recommendedStage: P188_1_RECOMMENDED_STAGE,
            paperworkStatus: "not_sent",
          }) as CandidateWorkflowRecord,
        observe: async () => undefined,
        dryRun: true,
      },
      { recommendationApi: true },
    );
    assert.equal(result.status, "preview");
    const forecast = forecastP187EligibilityAfterRecommendations({
      workflows: [
        wf({
          candidateId: "cand-p187",
          assignedRecruiter: "Taylor",
          workflowStatus: "Needs Review",
        }),
      ],
      successfulRecommendations: [
        {
          ...result,
          ok: true,
          status: "recommended",
        },
      ],
      jobByCandidate: { "cand-p187": "job-1" },
    });
    assert.ok(forecast.predictedEligibleCount >= 1);
    assert.equal(forecast.p187AuthorityEnabled, false);
    assert.equal(forecast.operatorApprovalOccurred, false);
  });

  it("bulk preview default; execution flag gated", () => {
    const preview = previewBulkRecommendHire({
      members: [
        {
          candidateId: "a",
          reason: "Strong fit for Austin role",
          context: eligibleContext("a"),
        },
      ],
      actor: "u1",
      role: "recruiter",
      forceFlags: { bulkRecommendationPreview: true },
    });
    assert.ok(!("reason" in preview));
    assert.equal((preview as { previewOnly: true }).previewOnly, true);
    assert.equal((preview as { executed: false }).executed, false);
  });

  it("context builder detects prior recommendation and paperwork", () => {
    const ctx = buildCandidateContextFromWorkflow(
      wf({
        candidateId: "x",
        recommendedStage: P188_1_RECOMMENDED_STAGE,
        paperworkStatus: "sent",
        paperworkSentAt: NOW,
      }),
      "x",
      { jobId: "job-1", jobResolved: true, nowMs: NOW_MS },
    );
    assert.equal(ctx.hasPriorRecommendation, true);
    assert.equal(ctx.paperworkActive, true);
  });

  it("API flag off blocks live recommend hire", async () => {
    const result = await executeRecommendHire({
      candidateId: "x",
      actor: "u",
      role: "recruiter",
      reason: "Strong retail fit here",
      source: "api",
      context: eligibleContext("x"),
    });
    assert.equal(result.ok, false);
    assert.ok(result.blockers.includes("recommendation_api_disabled"));
  });
});
