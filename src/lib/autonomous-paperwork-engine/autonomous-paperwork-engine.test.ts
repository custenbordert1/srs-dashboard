import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_CANDIDATE_ONBOARDING_POLICY } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  buildPaperworkAutoEligibility,
  buildPaperworkTodayActivity,
  lifecycleStatusLabel,
  resolvePaperworkLifecycleStatus,
  resolvePaperworkSendSource,
  runAutonomousPaperworkPreview,
} from "@/lib/autonomous-paperwork-engine";
import { buildPaperworkNlAnswers } from "@/lib/autonomous-paperwork-engine/build-paperwork-nl-answers";

const REFERENCE = "2026-06-26T15:00:00.000Z";

function workflowRow(overrides: Partial<ScoredCandidateWorkflowRow> & { candidateId: string }): ScoredCandidateWorkflowRow {
  return {
    candidateId: overrides.candidateId,
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex@example.com",
    assignedRecruiter: "Taylor",
    actionGeneratedAt: "2026-06-25T10:00:00.000Z",
    aiGrade: "B",
    workflowStatus: "Paperwork Sent",
    paperworkStatus: "sent",
    paperworkSentAt: "2026-06-26T09:00:00.000Z",
    paperworkSignedAt: null,
    paperworkError: null,
    signatureRequestId: "sig-1",
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

function onboardingRecord(
  candidateId: string,
  patch: Partial<CandidateOnboardingRecord> = {},
): CandidateOnboardingRecord {
  return {
    onboardingId: `onb-${candidateId}`,
    candidateId,
    status: "sent",
    paperworkComplete: false,
    readyForMel: false,
    createdAt: "2026-06-20T12:00:00.000Z",
    sentAt: "2026-06-26T09:00:00.000Z",
    retryCount: 0,
    escalated: false,
    statusHistory: [{ at: "2026-06-26T09:00:00.000Z", status: "sent" }],
    ...patch,
  };
}

describe("autonomous-paperwork-engine", () => {
  it("labels lifecycle statuses for the queue UI", () => {
    assert.equal(lifecycleStatusLabel("sent"), "Sent");
    assert.equal(lifecycleStatusLabel("needs_recruiter_review"), "Needs Recruiter Review");
  });

  it("classifies auto vs manual send sources", () => {
    const manual = resolvePaperworkSendSource({
      row: workflowRow({ candidateId: "manual-1" }),
      onboarding: onboardingRecord("manual-1"),
    });
    assert.equal(manual, "manual");

    const auto = resolvePaperworkSendSource({
      row: workflowRow({ candidateId: "auto-1" }),
      onboarding: onboardingRecord("auto-1", {
        orchestratorRunId: "run-123",
        statusHistory: [
          { at: "2026-06-26T08:00:00.000Z", status: "queued" },
          { at: "2026-06-26T09:00:00.000Z", status: "sent" },
        ],
      }),
    });
    assert.equal(auto, "auto");
  });

  it("builds today activity with auto and manual counts", () => {
    const rows = [
      workflowRow({ candidateId: "manual-send" }),
      workflowRow({
        candidateId: "auto-send",
        paperworkSentAt: "2026-06-26T10:00:00.000Z",
      }),
      workflowRow({
        candidateId: "signed-today",
        paperworkStatus: "signed",
        paperworkSignedAt: "2026-06-26T11:00:00.000Z",
      }),
    ];
    const onboarding = [
      onboardingRecord("manual-send"),
      onboardingRecord("auto-send", {
        orchestratorRunId: "run-1",
        sentAt: "2026-06-26T10:00:00.000Z",
      }),
      onboardingRecord("signed-today", { status: "signed", sentAt: "2026-06-26T09:00:00.000Z" }),
    ];

    const activity = buildPaperworkTodayActivity({
      candidates: rows,
      onboardingRecords: onboarding,
      referenceMs: Date.parse(REFERENCE),
    });

    assert.equal(activity.paperworkSentToday, 3);
    assert.equal(activity.autoSentToday, 1);
    assert.equal(activity.manualSentToday, 2);
    assert.equal(activity.signedToday, 1);
    assert.ok(activity.pendingSignature >= 1);
  });

  it("evaluates auto eligibility with blocking reasons", () => {
    const eligible = buildPaperworkAutoEligibility({
      row: workflowRow({
        candidateId: "ready-1",
        workflowStatus: "Paperwork Needed",
        paperworkStatus: "not_sent",
        paperworkSentAt: null,
        signatureRequestId: null,
        actionType: "send-paperwork",
      }),
      onboarding: null,
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
    });
    assert.equal(eligible.status, "ready_for_auto_send");
    assert.equal(eligible.eligible, true);

    const blocked = buildPaperworkAutoEligibility({
      row: workflowRow({
        candidateId: "blocked-1",
        email: "",
        aiGrade: "D",
      }),
      onboarding: null,
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
    });
    assert.equal(blocked.eligible, false);
    assert.ok(blocked.missingReasons.length >= 2);
  });

  it("resolves lifecycle status from onboarding queue state", () => {
    const queued = resolvePaperworkLifecycleStatus({
      row: workflowRow({ candidateId: "q-1", paperworkStatus: "not_sent", paperworkSentAt: null }),
      onboarding: onboardingRecord("q-1", {
        status: "queued",
        sentAt: undefined,
        statusHistory: [{ at: "2026-06-26T08:00:00.000Z", status: "queued" }],
      }),
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
    });
    assert.equal(queued, "queued");
  });

  it("runs preview without production writes", () => {
    const result = runAutonomousPaperworkPreview({
      candidates: [workflowRow({ candidateId: "c-1" })],
      onboardingRecords: [onboardingRecord("c-1")],
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      fetchedAt: REFERENCE,
    });

    assert.equal(result.previewMode, true);
    assert.equal(result.ok, true);
    assert.equal(result.dashboard.sourcePhase, "P70");
    assert.ok(result.warnings.some((row) => /preview mode/i.test(row)));
    assert.ok(result.warnings.some((row) => /dropbox sign/i.test(row)));
  });

  it("answers P70 natural language queries from dashboard snapshot", () => {
    const rows = [
      workflowRow({ candidateId: "auto-1", paperworkSentAt: "2026-06-26T08:00:00.000Z" }),
      workflowRow({ candidateId: "manual-1", paperworkSentAt: "2026-06-26T09:00:00.000Z" }),
    ];
    const onboarding = [
      onboardingRecord("auto-1", { orchestratorRunId: "run-1" }),
      onboardingRecord("manual-1"),
    ];

    const autoAnswer = buildPaperworkNlAnswers({
      queryId: "paperwork_auto_sent_today",
      candidates: rows,
      onboardingRecords: onboarding,
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      fetchedAt: REFERENCE,
    });
    assert.equal(autoAnswer?.queryId, "paperwork_auto_sent_today");
    assert.equal(autoAnswer?.total, 1);

    const recruiterAnswer = buildPaperworkNlAnswers({
      queryId: "paperwork_top_recruiter_today",
      candidates: rows,
      onboardingRecords: onboarding,
      policy: DEFAULT_CANDIDATE_ONBOARDING_POLICY,
      fetchedAt: REFERENCE,
    });
    assert.ok(recruiterAnswer?.summary.includes("Taylor"));
  });
});
