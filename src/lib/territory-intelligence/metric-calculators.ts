import { countCandidatesLast7Days, type BreezyCandidate, type BreezyJob } from "@/lib/breezy-api";
import { isMelReadyStatus } from "@/lib/candidate-action-sla";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { buildTerritoryHealthScore, type TerritoryHealthScore } from "@/lib/dm-dashboard/territory-health-score";
import { getAssignedStatesForDm, normalizeStateCode } from "@/lib/dm-territory-map";
import type {
  TerritoryDemandSignals,
  TerritoryOnboardingSignals,
} from "@/lib/territory-intelligence/types";

export function isHiredStage(stage: string): boolean {
  const normalized = stage.toLowerCase();
  return (
    normalized.includes("hired") ||
    normalized.includes("offer") ||
    normalized.includes("onboard") ||
    normalized.includes("active rep")
  );
}

export function countHiredFromCandidates(candidates: BreezyCandidate[]): number {
  return candidates.filter((candidate) => isHiredStage(candidate.stage)).length;
}

export function countWorkflowPaperworkSent(workflows: CandidateWorkflowState | null): number {
  if (!workflows) return 0;
  let count = 0;
  for (const workflow of Object.values(workflows)) {
    if (workflow.paperworkStatus === "sent" || workflow.paperworkStatus === "viewed") {
      count += 1;
    }
  }
  return count;
}

export function countWorkflowReadyForMel(workflows: CandidateWorkflowState | null): number {
  if (!workflows) return 0;
  let count = 0;
  for (const workflow of Object.values(workflows)) {
    if (isMelReadyStatus(workflow.workflowStatus)) count += 1;
  }
  return count;
}

export function countReadyForMel(input: {
  workflows: CandidateWorkflowState | null;
  ddApproved?: number;
  melMatchCount?: number;
}): number {
  if (input.workflows) {
    return countWorkflowReadyForMel(input.workflows);
  }
  return (input.ddApproved ?? 0) + (input.melMatchCount ?? 0);
}

export function countOpenCallsFromDemandSignals(signals: TerritoryDemandSignals): number {
  if (signals.shortageSum > 0) return signals.shortageSum;
  return signals.unstaffedMelCount;
}

export function countOpenCallsForDm(dmName: string, coverage: CoverageRiskSnapshot | null): number {
  if (!coverage) return 0;
  return coverage.opportunities.filter((row) => row.territoryOwner === dmName).length;
}

export function countActiveRepsFromOnboardingFallback(signals: TerritoryOnboardingSignals): number {
  return signals.paperworkSigned + signals.ddApproved + signals.hired;
}

export function aggregateActiveRepsByState(coverage: CoverageRiskSnapshot | null): Map<string, number> {
  const activeRepsByState = new Map<string, number>();
  if (!coverage) return activeRepsByState;

  for (const row of coverage.opportunities) {
    const state = normalizeStateCode(row.state);
    const nearby = row.nearby.activeWithin50;
    activeRepsByState.set(state, Math.max(activeRepsByState.get(state) ?? 0, nearby));
  }

  for (const row of coverage.executiveSummary.lowDensityStates) {
    const state = normalizeStateCode(row.state);
    activeRepsByState.set(state, Math.max(activeRepsByState.get(state) ?? 0, row.activeReps));
  }

  return activeRepsByState;
}

export function countActiveRepsForDm(dmName: string, activeRepsByState: Map<string, number>): number {
  const states = getAssignedStatesForDm(dmName);
  return states.reduce((sum, state) => sum + (activeRepsByState.get(state) ?? 0), 0);
}

export function buildTerritoryHealth(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  fetchedAt: string,
): TerritoryHealthScore {
  return buildTerritoryHealthScore(jobs, candidates, fetchedAt);
}

export function filterJobsByStates(jobs: BreezyJob[], states: string[]): BreezyJob[] {
  const stateSet = new Set(states.map((state) => normalizeStateCode(state)));
  return jobs.filter((job) => stateSet.has(normalizeStateCode(job.state)));
}

export function filterCandidatesByStates(
  candidates: BreezyCandidate[],
  states: string[],
): BreezyCandidate[] {
  const stateSet = new Set(states.map((state) => normalizeStateCode(state)));
  return candidates.filter((candidate) => stateSet.has(normalizeStateCode(candidate.state)));
}

/** Canonical 7-day applicant count — see `@/lib/metric-definitions` APPLICANTS_7D. */
export function countApplicantsLast7Days(
  candidates: BreezyCandidate[],
  fetchedAt: string,
  override?: number,
): number {
  if (override !== undefined && override > 0) return override;
  return countCandidatesLast7Days(candidates, fetchedAt);
}
