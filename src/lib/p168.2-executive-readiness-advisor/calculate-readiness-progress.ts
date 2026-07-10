import type { P1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center/types";
import type { P1682RecommendationProgress } from "@/lib/p168.2-executive-readiness-advisor/types";

const APPROVAL_GATES_EXCLUDE = new Set(["all_gates"]);

export const P1682_REQUIRED_READINESS_SCORE = 80;

export function calculateReadinessProgress(
  view: P1681ExecutiveDecisionCenterView,
): P1682RecommendationProgress {
  const gates = view.blocking.checklist.filter((c) => !APPROVAL_GATES_EXCLUDE.has(c.id));
  const gatesComplete = gates.filter((c) => c.pass).length;
  const gatesTotal = gates.length;
  const percentComplete =
    gatesTotal === 0 ? 0 : Math.round((gatesComplete / gatesTotal) * 100);
  const filled = Math.round(percentComplete / 10);
  const progressBar = `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;

  return {
    gatesComplete,
    gatesTotal,
    percentComplete,
    progressBar,
  };
}

export function buildCurrentReadiness(
  view: P1681ExecutiveDecisionCenterView,
  progress: P1682RecommendationProgress,
): {
  executiveReadinessPercent: number;
  currentScore: number;
  requiredScore: number;
  remainingPoints: number;
  remainingGates: number;
  gateProgressLabel: string;
} {
  const currentScore = view.systemStatus.decisionScore;
  const requiredScore = P1682_REQUIRED_READINESS_SCORE;
  const remainingPoints = Math.max(0, requiredScore - currentScore);
  const remainingGates = progress.gatesTotal - progress.gatesComplete;

  return {
    executiveReadinessPercent: currentScore,
    currentScore,
    requiredScore,
    remainingPoints,
    remainingGates,
    gateProgressLabel:
      remainingGates > 0
        ? `Needs +${remainingGates} approval gate${remainingGates === 1 ? "" : "s"}`
        : "All approval gates satisfied",
  };
}
