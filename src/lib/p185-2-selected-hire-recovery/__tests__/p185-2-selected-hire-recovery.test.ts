import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  projectP1852ControlledRollout,
  resetP1852StateMemoryForTests,
  resolveP1852Selection,
  resolveP1852TemplateReadiness,
} from "@/lib/p185-2-selected-hire-recovery";
import type { P1851JobMappingResult } from "@/lib/p185-1-paperwork-eligibility-recovery/types";
import type { P1852EvidenceItem } from "@/lib/p185-2-selected-hire-recovery/types";
import { installIsolatedRecruitingDataDir } from "@/lib/test/recruiting-test-isolation";

function mapping(ok = true): P1851JobMappingResult {
  return {
    candidateId: "cand-1",
    originalPositionId: "pos-1",
    resolvedPositionId: ok ? "pos-1" : null,
    mappingMethod: ok ? "exact_breezy_position_id" : "unresolved",
    confidence: ok ? "high" : "none",
    ambiguity: false,
    jobOpen: ok,
    jobAcceptingCandidates: ok,
    onboardingJobClassification: ok ? "published_accepting" : "unknown",
    acceptingForOnboarding: ok,
    supportingFields: {},
  };
}

function row(overrides: Partial<ScoredCandidateWorkflowRow> = {}): ScoredCandidateWorkflowRow {
  return {
    candidateId: "cand-1",
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
    stage: "Applied",
    workflowStatus: "Applied",
    positionId: "pos-1",
    positionName: "Merchandiser",
    paperworkStatus: "not_sent",
    paperworkSentAt: null,
    signatureRequestId: null,
    paperworkTemplateKey: "onboarding_packet",
    notes: [],
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

function auth(source = "p97_approval_persist"): P1852EvidenceItem[] {
  return [
    {
      source,
      authority: "authoritative",
      detail: "Approved",
      timestamp: "2026-07-01T00:00:00.000Z",
      actor: "exec",
    },
  ];
}

describe("P185.2 selected-hire recovery", () => {
  let isolation: Awaited<ReturnType<typeof installIsolatedRecruitingDataDir>>;

  beforeEach(async () => {
    isolation = await installIsolatedRecruitingDataDir("p185-2-");
    resetP1852StateMemoryForTests();
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    await isolation.restore();
    resetP1852StateMemoryForTests();
  });

  it("P181 approved queue entry creates authoritative evidence path to new packet", () => {
    const resolved = resolveP1852Selection({
      row: row(),
      evidence: auth("p181_scoped_operator_queue"),
      mapping: mapping(true),
      envelopeLifecycle: null,
      templateReady: true,
    });
    assert.equal(resolved.classification, "verified_selected_new_packet");
    assert.equal(resolved.canAutoNormalize, true);
  });

  it("P181 draft / supporting-only does not authorize paperwork", () => {
    const resolved = resolveP1852Selection({
      row: row(),
      evidence: [
        {
          source: "p181_draft",
          authority: "supporting",
          detail: "Draft only",
          timestamp: null,
          actor: null,
        },
      ],
      mapping: mapping(true),
      envelopeLifecycle: null,
      templateReady: true,
    });
    assert.equal(resolved.classification, "likely_selected_needs_review");
    assert.equal(resolved.canAutoNormalize, false);
  });

  it("P83 executed advancement authorizes paperwork", () => {
    const resolved = resolveP1852Selection({
      row: row(),
      evidence: auth("p83_executed_advancement"),
      mapping: mapping(true),
      envelopeLifecycle: null,
      templateReady: true,
    });
    assert.equal(resolved.classification, "verified_selected_new_packet");
  });

  it("P83 recommendation alone does not authorize paperwork", () => {
    const resolved = resolveP1852Selection({
      row: row(),
      evidence: [
        {
          source: "p83_recommendation_only",
          authority: "supporting",
          detail: "Recommendation",
          timestamp: null,
          actor: null,
        },
      ],
      mapping: mapping(true),
      envelopeLifecycle: null,
      templateReady: true,
    });
    assert.notEqual(resolved.classification, "verified_selected_new_packet");
  });

  it("explicit Ready for Paperwork / Paperwork Needed stage authorizes normalization", () => {
    const resolved = resolveP1852Selection({
      row: row({ workflowStatus: "Paperwork Needed" }),
      evidence: [],
      mapping: mapping(true),
      envelopeLifecycle: null,
      templateReady: true,
    });
    assert.equal(resolved.classification, "verified_selected_new_packet");
  });

  it("Applied stage does not authorize normalization", () => {
    const resolved = resolveP1852Selection({
      row: row({ workflowStatus: "Applied" }),
      evidence: [],
      mapping: mapping(true),
      envelopeLifecycle: null,
      templateReady: true,
    });
    assert.equal(resolved.classification, "applied_not_selected");
  });

  it("selected candidate on closed historical job can normalize when mapping accepts onboarding", () => {
    const closedMap = mapping(true);
    closedMap.onboardingJobClassification = "historical_valid_for_onboarding";
    closedMap.jobAcceptingCandidates = false;
    closedMap.acceptingForOnboarding = true;
    const resolved = resolveP1852Selection({
      row: row(),
      evidence: auth("p97_approval_persist"),
      mapping: closedMap,
      envelopeLifecycle: null,
      templateReady: true,
    });
    assert.equal(resolved.classification, "verified_selected_new_packet");
  });

  it("selected candidate with unresolved job is blocked", () => {
    const resolved = resolveP1852Selection({
      row: row(),
      evidence: auth(),
      mapping: mapping(false),
      envelopeLifecycle: null,
      templateReady: true,
    });
    assert.equal(resolved.classification, "unresolved_job");
    assert.equal(resolved.reviewBucket, "C");
  });

  it("active envelope prevents queue insertion class", () => {
    const resolved = resolveP1852Selection({
      row: row({ signatureRequestId: "env-1", paperworkStatus: "sent" }),
      evidence: auth(),
      mapping: mapping(true),
      envelopeLifecycle: "confirmed_sent",
      templateReady: true,
    });
    assert.equal(resolved.classification, "verified_selected_existing_packet");
  });

  it("signed packet prevents queue insertion", () => {
    const resolved = resolveP1852Selection({
      row: row({ paperworkStatus: "signed", workflowStatus: "Signed" }),
      evidence: auth(),
      mapping: mapping(true),
      envelopeLifecycle: "signed",
      templateReady: true,
    });
    assert.equal(resolved.classification, "verified_selected_completed_packet");
  });

  it("hired candidate requires exception review", () => {
    const resolved = resolveP1852Selection({
      row: row({ workflowStatus: "Ready for MEL" }),
      evidence: auth(),
      mapping: mapping(true),
      envelopeLifecycle: null,
      templateReady: true,
    });
    assert.equal(resolved.classification, "hired_without_paperwork");
    assert.equal(resolved.reviewBucket, "I");
  });

  it("missing template blocks sending", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    const readiness = resolveP1852TemplateReadiness(row());
    assert.equal(readiness.templateReady, false);
    const resolved = resolveP1852Selection({
      row: row(),
      evidence: auth(),
      mapping: mapping(true),
      envelopeLifecycle: null,
      templateReady: false,
      templateBlockingReason: readiness.blockingReason,
    });
    assert.equal(resolved.classification, "template_blocked");
    process.env.NODE_ENV = prev;
  });

  it("conflicting withdrawal blocks sending", () => {
    const resolved = resolveP1852Selection({
      row: row({ workflowStatus: "Withdrawn" }),
      evidence: auth(),
      mapping: mapping(true),
      envelopeLifecycle: null,
      templateReady: true,
    });
    assert.equal(resolved.classification, "withdrawn_after_selection");
  });

  it("projects controlled rollout schedule", () => {
    const proj = projectP1852ControlledRollout({ eligibleCount: 45 });
    assert.equal(proj.cyclesRequired, 5);
    assert.equal(proj.daysRequired, 1);
    assert.ok(proj.hoursRequired > 0);
    assert.match(proj.projectedCompletionLabel, /cycles/);
  });

  it("does not enable live sends in this phase", () => {
    assert.notEqual(process.env.P185_PRODUCTION_AUTOMATION_ENABLED, "1");
  });
});
