import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { ControlCenterSnapshot } from "@/lib/hiring-automation-engine/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { buildCoverageNeeds } from "@/lib/autonomous-recruiting-engine/build-coverage-needs";
import { buildHiringRecommendations } from "@/lib/autonomous-recruiting-engine/build-hiring-recommendations";
import { buildPostingRecommendations } from "@/lib/autonomous-recruiting-engine/build-posting-recommendations";
import {
  summarizeAutomationRuns,
  type ApprovalRule,
  type AutonomousRecruitingSnapshot,
  type AutopilotKpis,
  type PipelineFlowStep,
} from "@/lib/autonomous-recruiting-engine/types";

/**
 * Estimated recruiter minutes saved per automated insight (documented formula):
 * - Coverage need triage: 5 min × territories flagged Watch or worse
 * - Posting recommendation review: 8 min × ads recommended (manual review avoided when auto-approved)
 * - Auto-approved posting: additional 7 min × auto-approved ads (approval workflow skipped)
 * - Hire-ready candidate review: 6 min × candidates recommended Hire Now
 */
const MINUTES_COVERAGE_TRIAGE = 5;
const MINUTES_POSTING_REVIEW = 8;
const MINUTES_AUTO_APPROVE_BONUS = 7;
const MINUTES_HIRE_READY_REVIEW = 6;

export const HOURS_SAVED_FORMULA =
  "hoursSaved = (coverageNeedsWatchOrWorse × 5 + adsRecommended × 8 + adsAutoApproved × 7 + candidatesHireNow × 6) / 60";

function buildPipelineFlow(
  candidates: BreezyCandidate[],
  scoredRows: ScoredCandidateWorkflowRow[],
): PipelineFlowStep[] {
  const applied = candidates.filter((c) => c.stage === "Applied" || c.stage === "New").length;
  const reviewing = scoredRows.filter(
    (row) => row.workflowStatus === "Needs Review" || row.workflowStatus === "Applied",
  ).length;
  const qualified = scoredRows.filter(
    (row) => row.workflowStatus === "Qualified" || row.recruitingActions.recommendInterview,
  ).length;
  const interview = candidates.filter((c) => /interview/i.test(c.stage)).length;
  const paperwork = scoredRows.filter((row) =>
    ["Paperwork Sent", "Signed", "Paperwork Pending"].includes(row.workflowStatus),
  ).length;
  const melReady = scoredRows.filter((row) =>
    ["Ready for MEL", "Loaded in MEL", "Active Rep"].includes(row.workflowStatus),
  ).length;

  return [
    { id: "applied", label: "Applied", count: applied },
    { id: "reviewing", label: "Reviewing", count: reviewing },
    { id: "qualified", label: "Qualified", count: qualified },
    { id: "interview", label: "Interview", count: interview },
    { id: "paperwork", label: "Paperwork", count: paperwork },
    { id: "mel-ready", label: "MEL Ready", count: melReady },
  ];
}

function buildKpis(input: {
  coverageNeeds: ReturnType<typeof buildCoverageNeeds>;
  postingRecommendations: ReturnType<typeof buildPostingRecommendations>;
  hiringRecommendations: ReturnType<typeof buildHiringRecommendations>;
}): AutopilotKpis {
  const coverageNeedsDetected = input.coverageNeeds.filter(
    (row) => row.coverageStatus !== "Healthy",
  ).length;
  const adsRecommended = input.postingRecommendations.length;
  const adsAutoApproved = input.postingRecommendations.filter(
    (row) => row.approvalStatus === "auto-approved",
  ).length;
  const candidatesRecommendedForHire = input.hiringRecommendations.filter(
    (row) => row.recommendedAction === "Hire Now",
  ).length;

  const minutesSaved =
    coverageNeedsDetected * MINUTES_COVERAGE_TRIAGE +
    adsRecommended * MINUTES_POSTING_REVIEW +
    adsAutoApproved * MINUTES_AUTO_APPROVE_BONUS +
    candidatesRecommendedForHire * MINUTES_HIRE_READY_REVIEW;

  return {
    coverageNeedsDetected,
    adsRecommended,
    adsAutoApproved,
    candidatesRecommendedForHire,
    estimatedHoursSaved: Math.round((minutesSaved / 60) * 10) / 10,
    hoursSavedFormula: HOURS_SAVED_FORMULA,
  };
}

export function buildAutopilotSnapshot(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  opportunities: MelOpportunity[];
  scoredRows: ScoredCandidateWorkflowRow[];
  fetchedAt: string;
  territoryStates?: string[];
  approvalRules: ApprovalRule[];
  automationRuns: ControlCenterSnapshot;
}): AutonomousRecruitingSnapshot {
  const coverageNeeds = buildCoverageNeeds({
    jobs: input.jobs,
    candidates: input.candidates,
    workflows: input.workflows,
    opportunities: input.opportunities,
    fetchedAt: input.fetchedAt,
    territoryStates: input.territoryStates,
  });

  const postingRecommendations = buildPostingRecommendations({
    jobs: input.jobs,
    candidates: input.candidates,
    scoredRows: input.scoredRows,
    coverageNeeds,
    fetchedAt: input.fetchedAt,
    approvalRules: input.approvalRules,
  });

  const hiringRecommendations = buildHiringRecommendations({
    scoredRows: input.scoredRows,
    coverageNeeds,
  });

  return {
    fetchedAt: input.fetchedAt,
    territoryStates: input.territoryStates ?? null,
    kpis: buildKpis({ coverageNeeds, postingRecommendations, hiringRecommendations }),
    pipelineFlow: buildPipelineFlow(input.candidates, input.scoredRows),
    coverageNeeds,
    postingRecommendations,
    hiringRecommendations,
    approvalRules: input.approvalRules,
    automationRuns: summarizeAutomationRuns(input.automationRuns),
  };
}
