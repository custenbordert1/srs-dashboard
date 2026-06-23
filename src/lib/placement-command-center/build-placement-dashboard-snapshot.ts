import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isPaperworkPendingStatus } from "@/lib/candidate-action-sla";
import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import type { ApplicantPerformanceRow } from "@/lib/autonomous-recruiting-execution/types";
import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { buildHiringReadinessRows } from "@/lib/placement-command-center/build-hiring-readiness";
import { buildPlacementFunnel } from "@/lib/placement-command-center/build-placement-funnel";
import { buildPlacementRecommendations } from "@/lib/placement-command-center/build-placement-intelligence";
import { buildPlacementExecutionRecommendations } from "@/lib/placement-command-center/build-placement-recommendation-engine";
import { buildPlacementOutcomeMetrics } from "@/lib/placement-command-center/build-placement-outcomes";
import type { ExecutiveTrackedAction } from "@/lib/executive-accountability/types";
import type {
  AutoPlacementOpportunity,
  CoverageGapAwaitingCandidate,
  HiringReadinessRow,
  PaperworkBottleneck,
  PlacementCommandCenterSnapshot,
  PlacementExecutionRecommendation,
  PlacementQueueItem,
  TimeToFillMetric,
} from "@/lib/placement-command-center/types";

function daysSince(iso: string | null, referenceMs: number): number | null {
  if (!iso) return null;
  const ms = referenceMs - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function buildPaperworkBottlenecks(
  scoredRows: ScoredCandidateWorkflowRow[],
  referenceMs: number,
): PaperworkBottleneck[] {
  return scoredRows
    .filter(
      (row) =>
        isPaperworkPendingStatus(row.workflowStatus) ||
        row.workflowStatus === "Paperwork Sent" ||
        row.workflowStatus === "Awaiting DD Verification",
    )
    .map((row) => {
      const anchor = row.paperworkSentAt ?? row.lastActionAt;
      const blocker =
        row.workflowStatus === "Awaiting DD Verification"
          ? "Awaiting direct deposit verification"
          : row.paperworkError
            ? row.paperworkError
            : row.paperworkStatus === "sent"
              ? "Paperwork sent — awaiting signature"
              : "Paperwork workflow in progress";

      return {
        candidateId: row.candidateId,
        candidateName: `${row.firstName} ${row.lastName}`.trim() || row.email || "Candidate",
        territory: row.assignedDM || row.suggestedDM || "Unassigned",
        workflowStatus: row.workflowStatus,
        paperworkStatus: row.paperworkStatus,
        daysInStage: daysSince(anchor, referenceMs),
        blocker,
      };
    })
    .sort((a, b) => (b.daysInStage ?? 0) - (a.daysInStage ?? 0))
    .slice(0, 20);
}

function buildCoverageGaps(
  coverageNeeds: AutonomousRecruitingSnapshot["coverageNeeds"],
  readiness: HiringReadinessRow[],
): CoverageGapAwaitingCandidate[] {
  return coverageNeeds
    .filter((need) => need.coverageStatus === "Critical" || need.coverageStatus === "At Risk")
    .map((need) => {
      const readyCandidates = readiness.filter(
        (row) =>
          row.status === "ready-to-place" &&
          (row.territory === need.dmName || need.states.includes(row.state)),
      ).length;

      return {
        territoryKey: need.territoryKey,
        territoryLabel: need.territoryLabel,
        coverageStatus: need.coverageStatus,
        openCalls: need.openCalls,
        pipelineCandidates: need.pipelineCandidates,
        readyCandidates,
        recommendedAction: need.recommendedAction,
      };
    })
    .sort((a, b) => b.openCalls - a.openCalls);
}

function resolveApprovalStatus(
  correlation: ExecutionCorrelation | undefined,
): PlacementQueueItem["approvalStatus"] {
  if (!correlation) return null;
  if (correlation.status === "archived") return "rejected";
  if (correlation.status === "recommended") return "needs-review";
  if (["approved", "executing", "completed"].includes(correlation.status)) return "approved";
  return "pending";
}

function buildPlacementQueue(
  readiness: HiringReadinessRow[],
  executionRecommendations: PlacementExecutionRecommendation[],
  correlations: ExecutionCorrelation[],
): PlacementQueueItem[] {
  const recByCandidate = new Map(executionRecommendations.map((row) => [row.candidateId, row]));
  const corrByCandidate = new Map(
    correlations
      .filter((row) => row.type === "placement" && row.candidateId)
      .map((row) => [row.candidateId!, row]),
  );

  return readiness
    .filter((row) => row.status !== "blocked")
    .map((row) => {
      const rec = recByCandidate.get(row.candidateId);
      const corr = corrByCandidate.get(row.candidateId);
      return {
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        readinessStatus: row.status,
        placementScore: rec?.placementScore ?? row.candidateScore,
        recommendedProject: rec?.recommendedProject ?? null,
        matchLabel: rec?.matchLabel ?? null,
        correlationId: corr?.id ?? null,
        correlationStatus: corr?.status ?? null,
        approvalStatus: resolveApprovalStatus(corr),
      };
    })
    .sort((a, b) => b.placementScore - a.placementScore)
    .slice(0, 30);
}

function buildAutoPlacementOpportunities(
  executionRecommendations: PlacementExecutionRecommendation[],
  correlations: ExecutionCorrelation[],
): AutoPlacementOpportunity[] {
  const corrByCandidate = new Map(
    correlations
      .filter((row) => row.type === "placement" && row.candidateId)
      .map((row) => [row.candidateId!, row]),
  );

  return executionRecommendations
    .filter(
      (row) =>
        row.matchLabel !== "Do Not Recommend" &&
        row.placementScore >= 70 &&
        row.coverageUrgency !== "Healthy",
    )
    .map((row) => {
      const corr = corrByCandidate.get(row.candidateId);
      return {
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        territory: row.recommendedTerritory,
        placementScore: row.placementScore,
        recommendedProject: row.recommendedProject,
        correlationId: corr?.id ?? null,
        hiringAction: corr?.hiringAction ?? null,
        coverageUrgency: row.coverageUrgency,
      };
    })
    .slice(0, 15);
}

function buildTimeToFill(
  applicantPerformance: ApplicantPerformanceRow[],
  readiness: HiringReadinessRow[],
  coverageNeeds: AutonomousRecruitingSnapshot["coverageNeeds"],
): TimeToFillMetric[] {
  return coverageNeeds.map((need) => {
    const perf = applicantPerformance.find((row) => row.territoryKey === need.territoryKey);
    const readyForPlacement = readiness.filter(
      (row) =>
        row.status === "ready-to-place" &&
        (row.territory === need.dmName || need.states.includes(row.state)),
    ).length;

    return {
      territoryLabel: need.territoryLabel,
      territoryKey: need.territoryKey,
      applicants: perf?.applicants ?? need.applicantCount,
      targetApplicants: perf?.targetApplicants ?? 6,
      timeToFillDays: perf?.timeToFillDays ?? null,
      readyForPlacement,
    };
  });
}

export function buildPlacementCommandCenterSnapshot(input: {
  autopilotSnapshot: AutonomousRecruitingSnapshot;
  scoredRows: ScoredCandidateWorkflowRow[];
  correlations: ExecutionCorrelation[];
  applicantPerformance: ApplicantPerformanceRow[];
  opportunities: MelOpportunity[];
  accountabilityActions?: ExecutiveTrackedAction[];
  territoryStates?: string[];
  fetchedAt: string;
}): PlacementCommandCenterSnapshot {
  const readiness = buildHiringReadinessRows(input.scoredRows);
  const placementRecommendations = buildPlacementRecommendations({
    scoredRows: input.scoredRows,
    readiness,
    opportunities: input.opportunities,
    coverageNeeds: input.autopilotSnapshot.coverageNeeds,
    hiringRecommendations: input.autopilotSnapshot.hiringRecommendations,
    territoryStates: input.territoryStates,
  });
  const placementExecutionRecommendations = buildPlacementExecutionRecommendations(
    placementRecommendations,
  );

  const funnel = buildPlacementFunnel({
    autopilotSnapshot: input.autopilotSnapshot,
    scoredRows: input.scoredRows,
    correlations: input.correlations,
    placementRecommendations,
  });

  const readyForPlacement = readiness.filter((row) => row.status === "ready-to-place");
  const paperworkBottlenecks = buildPaperworkBottlenecks(input.scoredRows, Date.now());
  const coverageGaps = buildCoverageGaps(input.autopilotSnapshot.coverageNeeds, readiness);
  const placementQueue = buildPlacementQueue(
    readiness,
    placementExecutionRecommendations,
    input.correlations,
  );
  const autoPlacementOpportunities = buildAutoPlacementOpportunities(
    placementExecutionRecommendations,
    input.correlations,
  );
  const timeToFill = buildTimeToFill(
    input.applicantPerformance,
    readiness,
    input.autopilotSnapshot.coverageNeeds,
  );
  const placementOutcomes = buildPlacementOutcomeMetrics({
    correlations: input.correlations,
    accountabilityActions: input.accountabilityActions ?? [],
    applicantPerformance: input.applicantPerformance,
  });

  const needsAction = readiness.filter((row) => row.status === "needs-action").length;
  const blocked = readiness.filter((row) => row.status === "blocked").length;
  const ttfValues = timeToFill
    .map((row) => row.timeToFillDays)
    .filter((value): value is number => value !== null);
  const avgTimeToFillDays =
    ttfValues.length > 0
      ? Math.round(ttfValues.reduce((sum, value) => sum + value, 0) / ttfValues.length)
      : null;

  return {
    fetchedAt: input.fetchedAt,
    funnel,
    readiness,
    placementRecommendations,
    readyForPlacement,
    paperworkBottlenecks,
    coverageGaps,
    placementQueue,
    autoPlacementOpportunities,
    timeToFill,
    placementExecutionRecommendations,
    placementOutcomes,
    kpis: {
      readyForPlacement: readyForPlacement.length,
      needsAction,
      blocked,
      openCoverageGaps: coverageGaps.length,
      autoPlacementCount: autoPlacementOpportunities.length,
      avgTimeToFillDays,
      recommendedPlacements: placementOutcomes.recommendedPlacements,
      approvedPlacements: placementOutcomes.approvedPlacements,
      placementSuccessRate: placementOutcomes.placementSuccessRate,
      coverageGapsFilled: placementOutcomes.coverageGapsFilled,
      placementRoi: placementOutcomes.placementRoi,
    },
  };
}
