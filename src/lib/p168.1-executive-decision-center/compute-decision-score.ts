import type { P1681DecisionGrade, P1681DecisionScore } from "@/lib/p168.1-executive-decision-center/types";

export type P1681DecisionScoreInput = {
  readinessScore: number | null;
  runnerHealthy: boolean;
  runnerIdle: boolean;
  dropboxThrottling: boolean;
  dropboxWithinBudget: boolean;
  eligibleNow: number;
  queueRemaining: number;
  deferredCount: number;
  monitorBudget: number;
  processingLockHeld: boolean;
  duplicateProtectionActive: boolean;
  activeSignatureCount: number;
  recentSendFailures: number;
  todayFailures: number;
};

function gradeForScore(score: number): P1681DecisionGrade {
  if (score >= 95) return "Excellent";
  if (score >= 85) return "Healthy";
  if (score >= 70) return "Caution";
  return "Intervention Required";
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeExecutiveDecisionScore(input: P1681DecisionScoreInput): P1681DecisionScore {
  const factors: P1681DecisionScore["factors"] = [];

  const readinessContribution =
    input.readinessScore == null ? 40 : clamp((input.readinessScore / 100) * 100);
  factors.push({
    id: "readiness",
    label: "Production readiness",
    weight: 20,
    contribution: clamp((readinessContribution / 100) * 20),
  });

  const runnerContribution = input.runnerHealthy && input.runnerIdle ? 100 : input.runnerHealthy ? 60 : 0;
  factors.push({
    id: "runner",
    label: "Runner health",
    weight: 15,
    contribution: clamp((runnerContribution / 100) * 15),
  });

  const dropboxContribution =
    input.dropboxThrottling ? 0 : input.dropboxWithinBudget ? 100 : 40;
  factors.push({
    id: "dropbox",
    label: "Dropbox API health",
    weight: 15,
    contribution: clamp((dropboxContribution / 100) * 15),
  });

  const queueContribution =
    input.eligibleNow > 0
      ? clamp(60 + Math.min(40, input.eligibleNow * 4))
      : input.queueRemaining > 0
        ? 45
        : 70;
  factors.push({
    id: "queue",
    label: "Queue health",
    weight: 10,
    contribution: clamp((queueContribution / 100) * 10),
  });

  const deferredRatio = input.monitorBudget > 0 ? input.deferredCount / input.monitorBudget : 0;
  const deferredContribution = deferredRatio <= 1 ? 100 : deferredRatio <= 2 ? 55 : 20;
  factors.push({
    id: "deferred",
    label: "Deferred backlog",
    weight: 10,
    contribution: clamp((deferredContribution / 100) * 10),
  });

  factors.push({
    id: "lock",
    label: "Processing lock",
    weight: 10,
    contribution: input.processingLockHeld ? 0 : 10,
  });

  factors.push({
    id: "duplicate",
    label: "Duplicate protection",
    weight: 5,
    contribution: input.duplicateProtectionActive ? 5 : 0,
  });

  const signatureLoad =
    input.activeSignatureCount <= 50 ? 100 : input.activeSignatureCount <= 100 ? 70 : 40;
  factors.push({
    id: "signatures",
    label: "Active signatures",
    weight: 5,
    contribution: clamp((signatureLoad / 100) * 5),
  });

  const failurePenalty = Math.min(10, input.recentSendFailures * 3 + Math.min(5, input.todayFailures));
  factors.push({
    id: "failures",
    label: "Recent failures",
    weight: 10,
    contribution: clamp(10 - failurePenalty),
  });

  const decisionScore = clamp(factors.reduce((sum, f) => sum + f.contribution, 0));

  return {
    decisionScore,
    decisionGrade: gradeForScore(decisionScore),
    factors,
  };
}

export function gradeTone(
  grade: P1681DecisionGrade,
): "success" | "warning" | "critical" | "neutral" {
  if (grade === "Excellent" || grade === "Healthy") return "success";
  if (grade === "Caution") return "warning";
  return "critical";
}
