import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildActionQueue } from "@/lib/p119-autonomous-recovery-engine/build-action-queue";
import { buildImpactSimulation } from "@/lib/p119-autonomous-recovery-engine/build-impact-simulation";
import { classifyRecoveryCategory } from "@/lib/p119-autonomous-recovery-engine/classify-recovery-candidate";
import { scoreRecoveryValue } from "@/lib/p119-autonomous-recovery-engine/score-recovery-value";
import type { RecoveryCandidateAnalysis } from "@/lib/p119-autonomous-recovery-engine/types";

const blocked = {
  candidateId: "c1",
  candidateName: "Test Candidate",
  email: "test@example.com",
  positionId: "pos-1",
  positionTitle: "Merchandiser",
  recruiter: "Taylor",
  dm: null,
  category: "blocked",
  blockerCategory: "p84_gate_failed",
  blockerReason: "Missing recruiter",
  recommendedFix: "Assign recruiter",
  p84Eligible: false,
  autoRepairable: true,
  autoRepaired: false,
  signatureRequestId: null,
  sentAt: null,
  workflowStatus: "Paperwork Needed",
  onboardingStatus: null,
} as const;

describe("p119-autonomous-recovery-engine", () => {
  it("classifies auto-repairable P84 blockers", () => {
    const result = classifyRecoveryCategory({
      candidate: blocked,
      approvalStatus: "pending",
      approvedMapping: null,
      awaitingSignature: false,
      needsJobPublish: false,
    });
    assert.equal(result.recoveryCategory, "AUTO_RECOVERABLE");
    assert.equal(result.estimatedUnlock, 1);
    assert.equal(result.recommendedNextAction, "Auto Repair");
  });

  it("scores duplicate risk lower than auto recoverable", () => {
    const auto = scoreRecoveryValue({
      recoveryCategory: "AUTO_RECOVERABLE",
      estimatedUnlock: 1,
      mappingConfidence: 80,
      coverageDemandScore: 70,
      distanceMiles: 20,
      duplicateRisk: false,
      alreadySent: false,
      autoRepairable: true,
      candidateFreshnessDays: 5,
      openCalls: 2,
    });
    const dup = scoreRecoveryValue({
      recoveryCategory: "DUPLICATE_RISK",
      estimatedUnlock: 0,
      mappingConfidence: 80,
      coverageDemandScore: 70,
      distanceMiles: 20,
      duplicateRisk: true,
      alreadySent: false,
      autoRepairable: false,
      candidateFreshnessDays: 5,
      openCalls: 2,
    });
    assert.ok(auto > dup);
    assert.ok(auto <= 100);
  });

  it("builds prioritized action queue by ROI", () => {
    const candidates: RecoveryCandidateAnalysis[] = [
      {
        candidateId: "c1",
        candidateName: "A",
        positionId: "p1",
        positionTitle: "Job",
        blockerCategory: "p84_gate_failed",
        recoveryCategory: "AUTO_RECOVERABLE",
        recoveryReason: "auto",
        estimatedUnlock: 1,
        estimatedEffort: "low",
        confidence: 85,
        blockingSystem: "P84",
        recommendedNextAction: "Auto Repair",
        recoveryScore: 90,
        autoRepairable: true,
      },
      {
        candidateId: "c2",
        candidateName: "B",
        positionId: "p1",
        positionTitle: "Job",
        blockerCategory: "project_not_mappable",
        recoveryCategory: "REQUIRES_MAPPING_APPROVAL",
        recoveryReason: "mapping",
        estimatedUnlock: 1,
        estimatedEffort: "medium",
        confidence: 75,
        blockingSystem: "P109",
        recommendedNextAction: "Approve Mapping",
        recoveryScore: 70,
        autoRepairable: false,
      },
    ];
    const queue = buildActionQueue(candidates);
    assert.equal(queue.length, 2);
    assert.ok(queue[0]!.priority >= queue[1]!.priority);
  });

  it("simulates impact for top actions", () => {
    const candidates: RecoveryCandidateAnalysis[] = [
      {
        candidateId: "c1",
        candidateName: "A",
        positionId: "p1",
        positionTitle: "Job",
        blockerCategory: "p84_gate_failed",
        recoveryCategory: "AUTO_RECOVERABLE",
        recoveryReason: "auto",
        estimatedUnlock: 1,
        estimatedEffort: "low",
        confidence: 85,
        blockingSystem: "P84",
        recommendedNextAction: "Auto Repair",
        recoveryScore: 90,
        autoRepairable: true,
      },
    ];
    const queue = buildActionQueue(candidates);
    const impact = buildImpactSimulation({ actionQueue: queue, recoverableCandidates: candidates });
    assert.equal(impact.top5.expectedPaperworkUnlocked, 1);
    assert.equal(impact.allRecoverable.expectedPaperworkUnlocked, 1);
  });

  it("does not classify terminal status as recoverable", () => {
    const result = classifyRecoveryCategory({
      candidate: {
        ...blocked,
        blockerCategory: "terminal_status",
        autoRepairable: false,
        blockerReason: "Not Qualified",
      },
      approvalStatus: "pending",
      approvedMapping: null,
      awaitingSignature: false,
      needsJobPublish: false,
    });
    assert.equal(result.recoveryCategory, "DO_NOT_RECOVER");
    assert.equal(result.estimatedUnlock, 0);
  });
});
