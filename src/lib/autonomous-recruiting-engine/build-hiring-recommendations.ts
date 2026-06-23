import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import { evaluateCandidateFunnelAutomation } from "@/lib/hiring-funnel-automation/evaluate-candidate-automation";
import { isMelReadyStatus, isPaperworkPendingStatus } from "@/lib/candidate-action-sla";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import type {
  CandidateReadinessConfidence,
  CandidateReadinessGrade,
} from "@/lib/candidate-readiness/types";
import type {
  HiringRecommendation,
  HiringRecommendationAction,
  TerritoryCoverageNeed,
} from "@/lib/autonomous-recruiting-engine/types";

function candidateName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || "Candidate";
}

function coverageContextForRow(
  row: ScoredCandidateWorkflowRow,
  coverageNeeds: TerritoryCoverageNeed[],
): string {
  const state = normalizeStateCode(row.state ?? "");
  const dm = getDmForState(state) ?? "Unassigned";
  const need = coverageNeeds.find((entry) => entry.dmName === dm || entry.states.includes(state));
  if (!need) return `Territory ${dm} — no coverage need signal.`;
  return `${need.territoryLabel}: ${need.coverageStatus} (need score ${need.coverageNeedScore}) — ${need.openCalls} open calls, ${need.activeReps} active reps`;
}

function territoryCoveragePressure(
  row: ScoredCandidateWorkflowRow,
  coverageNeeds: TerritoryCoverageNeed[],
): TerritoryCoverageNeed | null {
  const state = normalizeStateCode(row.state ?? "");
  const dm = getDmForState(state) ?? "Unassigned";
  return coverageNeeds.find((entry) => entry.dmName === dm || entry.states.includes(state)) ?? null;
}

export function resolveHiringAction(input: {
  row: ScoredCandidateWorkflowRow;
  review: ReturnType<typeof evaluateApplicantReview>;
  funnel: ReturnType<typeof evaluateCandidateFunnelAutomation>;
  coverageNeed: TerritoryCoverageNeed | null;
}): HiringRecommendationAction {
  const { row, review, funnel, coverageNeed } = input;
  const grade = row.candidateGrade.grade as CandidateReadinessGrade;
  const confidence = row.candidateGrade.confidence as CandidateReadinessConfidence;
  const coverageCritical =
    coverageNeed?.coverageStatus === "Critical" || (coverageNeed?.coverageNeedScore ?? 0) >= 80;

  if (review.verdict === "disqualified" || row.workflowStatus === "Not Qualified" || grade === "D") {
    return "Reject";
  }

  if (
    isMelReadyStatus(row.workflowStatus) ||
    row.workflowStatus === "Active Rep" ||
    row.workflowStatus === "Loaded in MEL"
  ) {
    return "Hire Now";
  }

  if (review.verdict === "incomplete") {
    return "Hold";
  }

  if (review.qualified) {
    if (grade === "A") {
      if (confidence === "high") return "Hire Now";
      if (confidence === "medium") return coverageCritical ? "Hire Now" : "Interview";
      return "Interview";
    }

    if (grade === "B") {
      if (confidence === "high" && coverageCritical) return "Hire Now";
      return "Interview";
    }

    if (grade === "C" && confidence !== "low") {
      return "Interview";
    }
  }

  if (
    row.recruitingActions.recommendInterview ||
    row.workflowStatus === "Qualified" ||
    funnel.taskType === "interview-needed" ||
    isPaperworkPendingStatus(row.workflowStatus)
  ) {
    return "Interview";
  }

  if (review.verdict === "needs-review") {
    if (grade === "C" || confidence === "low") return "Hold";
    return "Interview";
  }

  return "Hold";
}

function buildReasons(
  row: ScoredCandidateWorkflowRow,
  review: ReturnType<typeof evaluateApplicantReview>,
  funnel: ReturnType<typeof evaluateCandidateFunnelAutomation>,
  recommendedAction: HiringRecommendationAction,
  coverageNeed: TerritoryCoverageNeed | null,
): string[] {
  const reasons: string[] = [];
  if (review.summary) reasons.push(review.summary);
  if (coverageNeed && recommendedAction === "Hire Now") {
    reasons.push(`Coverage need ${coverageNeed.coverageStatus.toLowerCase()} (${coverageNeed.coverageNeedScore})`);
  }
  if (funnel.copilot.headline) reasons.push(funnel.copilot.headline);
  if (funnel.copilot.recommendedAction) reasons.push(funnel.copilot.recommendedAction);
  for (const strength of review.strengths.slice(0, 2)) reasons.push(strength);
  for (const concern of review.concerns.slice(0, 2)) reasons.push(concern);
  for (const risk of funnel.riskReasons.slice(0, 2)) reasons.push(risk);
  return [...new Set(reasons)].slice(0, 6);
}

const ACTION_RANK: Record<HiringRecommendationAction, number> = {
  "Hire Now": 0,
  Interview: 1,
  Hold: 2,
  Reject: 3,
};

const MAX_HOLD_IN_RESULTS = 8;

export function countHiringRecommendationsByAction(
  recommendations: HiringRecommendation[],
): Record<HiringRecommendationAction, number> {
  return recommendations.reduce(
    (counts, row) => {
      counts[row.recommendedAction] += 1;
      return counts;
    },
    { "Hire Now": 0, Interview: 0, Hold: 0, Reject: 0 },
  );
}

export function buildHiringRecommendations(input: {
  scoredRows: ScoredCandidateWorkflowRow[];
  coverageNeeds: TerritoryCoverageNeed[];
  referenceMs?: number;
  limit?: number;
}): HiringRecommendation[] {
  const referenceMs = input.referenceMs ?? Date.now();
  const limit = input.limit ?? 40;

  const recommendations = input.scoredRows
    .filter((row) => row.workflowStatus !== "Loaded in MEL")
    .map((row) => {
      const review = evaluateApplicantReview(row);
      const funnel = evaluateCandidateFunnelAutomation(row, referenceMs);
      const coverageNeed = territoryCoveragePressure(row, input.coverageNeeds);
      const recommendedAction = resolveHiringAction({ row, review, funnel, coverageNeed });

      return {
        candidateId: row.candidateId,
        candidateName: candidateName(row),
        positionName: row.positionName,
        city: row.city,
        state: row.state,
        territory: getDmForState(normalizeStateCode(row.state ?? "")) ?? "Unassigned",
        recommendedAction,
        grade: review.grade,
        confidence: review.confidence,
        coverageContext: coverageContextForRow(row, input.coverageNeeds),
        reasons: buildReasons(row, review, funnel, recommendedAction, coverageNeed),
      };
    })
    .sort(
      (a, b) =>
        ACTION_RANK[a.recommendedAction] - ACTION_RANK[b.recommendedAction] ||
        a.grade.localeCompare(b.grade),
    );

  const actionable = recommendations.filter((row) => row.recommendedAction !== "Hold");
  const holdSample = recommendations
    .filter((row) => row.recommendedAction === "Hold")
    .slice(0, MAX_HOLD_IN_RESULTS);

  return [...actionable, ...holdSample].slice(0, limit);
}
