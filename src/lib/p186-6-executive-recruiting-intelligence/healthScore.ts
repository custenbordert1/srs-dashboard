import { readStaleSourceThresholdMs } from "@/lib/p186-6-executive-recruiting-intelligence/flags";
import type {
  P1866CohortCandidate,
  P1866HealthBand,
  P1866HealthScore,
} from "@/lib/p186-6-executive-recruiting-intelligence/types";
import { calculateAging } from "@/lib/p186-6-executive-recruiting-intelligence/aging";

function bandFromScore(score: number): P1866HealthBand {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 55) return "fair";
  if (score >= 35) return "poor";
  return "critical";
}

/**
 * Explainable 0–100 health score. Never authorizes hiring/send/MEL/lifecycle changes.
 */
export function scoreCandidateHealth(input: {
  candidate: P1866CohortCandidate;
  nowMs?: number;
  staleThresholdMs?: number;
}): P1866HealthScore {
  const c = input.candidate;
  const staleThreshold = input.staleThresholdMs ?? readStaleSourceThresholdMs();
  const aging = calculateAging({ cohort: [c], nowMs: input.nowMs })[0]!;

  let score = 72;
  const positive: string[] = [];
  const negative: string[] = [];
  const blockers: string[] = [...(c.blockers ?? [])];
  let confidence = 0.85;
  let staleDataDowngraded = false;

  if (aging.band === "healthy") {
    score += 8;
    positive.push("Stage age within healthy SLA");
  } else if (aging.band === "warning") {
    score -= 8;
    negative.push("Stage age in warning band");
  } else if (aging.band === "overdue") {
    score -= 18;
    negative.push("Stage age overdue");
  } else {
    score -= 28;
    negative.push("Stage age critical");
    blockers.push("critical_aging");
  }

  if ((c.candidateResponsivenessScore ?? 50) >= 70) {
    score += 5;
    positive.push("Strong candidate responsiveness");
  } else if ((c.candidateResponsivenessScore ?? 50) < 40) {
    score -= 8;
    negative.push("Low candidate responsiveness");
  }

  if ((c.recruiterActivityScore ?? 50) >= 70) {
    score += 5;
    positive.push("Active recruiter engagement");
  } else if ((c.recruiterActivityScore ?? 50) < 35) {
    score -= 7;
    negative.push("Low recruiter activity");
  }

  if ((c.approvalDelayMs ?? 0) > 3 * 86400000) {
    score -= 10;
    negative.push("Approval delays");
  }

  const paperwork = (c.paperworkStatus ?? "").toLowerCase();
  if (paperwork === "signed" || paperwork === "completed") {
    score += 6;
    positive.push("Paperwork signed");
  } else if (paperwork === "failed" || paperwork === "declined" || paperwork === "canceled") {
    score -= 20;
    negative.push(`Paperwork ${paperwork}`);
    blockers.push(`paperwork_${paperwork}`);
  }

  if (c.missingDocuments) {
    score -= 12;
    negative.push("Missing onboarding documents");
    blockers.push("missing_documents");
  }
  if (c.onboardingBlocked) {
    score -= 10;
    negative.push("Onboarding blocked");
    blockers.push("onboarding_blocked");
  }
  if (c.jobUrgent && c.jobAvailable) {
    score += 3;
    positive.push("Urgent open job available");
  } else if (c.jobAvailable === false) {
    score -= 6;
    negative.push("No job availability");
  }
  if (c.workflowConflict) {
    score -= 15;
    negative.push("Workflow conflict");
    blockers.push("workflow_conflict");
  }
  if (c.shadowMismatch) {
    score -= 8;
    negative.push("Shadow mismatch");
  }
  if (c.missingShadow) {
    score -= 10;
    negative.push("Missing shadow state");
    blockers.push("missing_shadow");
  }
  if (c.assignmentClear === false) {
    score -= 7;
    negative.push("Unclear assignment");
  } else if (c.assignmentClear) {
    score += 3;
    positive.push("Clear ownership assignment");
  }
  if (c.unresolvedOperations) {
    score -= 9;
    negative.push("Unresolved operations");
    blockers.push("unresolved_operations");
  }

  if (c.sourceFreshnessMs != null && c.sourceFreshnessMs > staleThreshold) {
    staleDataDowngraded = true;
    confidence = Math.min(confidence, 0.45);
    score = Math.min(score, 50);
    negative.push("Stale source data — score downgraded");
  }
  if (c.sourceFreshnessMs == null) {
    confidence = Math.min(confidence, 0.55);
    negative.push("Source freshness unknown");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const band = staleDataDowngraded && score > 50 ? "fair" : bandFromScore(score);

  return {
    candidateId: c.candidateId,
    score,
    band: staleDataDowngraded && band === "excellent" ? "fair" : band,
    positiveFactors: positive,
    negativeFactors: negative,
    blockers: [...new Set(blockers)],
    confidence,
    recommendedOperatorAction:
      blockers.length > 0
        ? "Investigate blockers in operator queue (advisory)"
        : aging.band === "healthy"
          ? "No action — monitor"
          : aging.recommendedNextAction,
    staleDataDowngraded,
  };
}

export function scoreCohortHealth(
  cohort: P1866CohortCandidate[],
  nowMs?: number,
): P1866HealthScore[] {
  return cohort.map((candidate) => scoreCandidateHealth({ candidate, nowMs }));
}
