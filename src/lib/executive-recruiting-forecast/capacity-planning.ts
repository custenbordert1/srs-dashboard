import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { isFollowUpOverdue } from "@/lib/candidate-action-sla";
import type {
  CapacityStatus,
  DmCapacityRow,
  RecruiterCapacityRow,
} from "@/lib/executive-recruiting-forecast/types";

/** Target active candidates per recruiter before workload is considered elevated. */
const RECRUITER_TARGET_ACTIVE = 20;

/** Open jobs per recruiter before posting pressure rises. */
const JOBS_PER_RECRUITER_COMFORT = 8;

function classifyCapacity(score: number, assignedLoad: number, target: number): CapacityStatus {
  if (score < 40 || assignedLoad > target * 1.4) return "overloaded";
  if (score > 72 && assignedLoad < target * 0.45) return "underused";
  return "stable";
}

export function buildRecruiterCapacityRows(input: {
  candidates: BreezyCandidate[];
  jobs: BreezyJob[];
  workflows: CandidateWorkflowState;
  productivityRows: { recruiter: string; candidatesReviewed: number }[];
}): RecruiterCapacityRow[] {
  const assignedByRecruiter = new Map<string, number>();
  const followUpsByRecruiter = new Map<string, { open: number; overdue: number }>();

  for (const candidate of input.candidates) {
    const record = input.workflows[candidate.candidateId];
    const recruiter = record?.assignedRecruiter?.trim() || "Unassigned";
    assignedByRecruiter.set(recruiter, (assignedByRecruiter.get(recruiter) ?? 0) + 1);
    const bucket = followUpsByRecruiter.get(recruiter) ?? { open: 0, overdue: 0 };
    if (record?.followUpDueAt || record?.recruitingActions?.needsFollowUp) {
      bucket.open += 1;
      if (
        isFollowUpOverdue({
          recruitingActions: record.recruitingActions,
          followUpDueAt: record.followUpDueAt,
        })
      ) {
        bucket.overdue += 1;
      }
    }
    followUpsByRecruiter.set(recruiter, bucket);
  }

  const recruiters = new Set([
    ...assignedByRecruiter.keys(),
    ...input.productivityRows.map((row) => row.recruiter),
  ]);

  const openJobs = input.jobs.length;
  const recruiterCount = Math.max(recruiters.size, 1);
  const jobsPerRecruiter = openJobs / recruiterCount;

  return [...recruiters].map((recruiter) => {
    const assignedCandidates = assignedByRecruiter.get(recruiter) ?? 0;
    const followUps = followUpsByRecruiter.get(recruiter) ?? { open: 0, overdue: 0 };
    const backlogPressure = Math.min(100, Math.round((assignedCandidates / RECRUITER_TARGET_ACTIVE) * 100));
    const openJobPressure = Math.min(
      100,
      Math.round((jobsPerRecruiter / JOBS_PER_RECRUITER_COMFORT) * 100),
    );
    const overduePenalty = Math.min(30, followUps.overdue * 6);
    const capacityScore = Math.max(
      0,
      Math.min(100, 100 - backlogPressure * 0.55 - openJobPressure * 0.25 - overduePenalty),
    );
    return {
      recruiter,
      capacityScore,
      status: classifyCapacity(capacityScore, assignedCandidates, RECRUITER_TARGET_ACTIVE),
      assignedCandidates,
      openFollowUps: followUps.open,
      overdueFollowUps: followUps.overdue,
      candidateBacklogPressure: backlogPressure,
      openJobPressure,
    };
  }).sort((a, b) => a.capacityScore - b.capacityScore || b.assignedCandidates - a.assignedCandidates);
}

export function buildDmCapacityRows(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  opportunities: MelOpportunity[];
}): DmCapacityRow[] {
  const openOppsByDm = new Map<string, number>();
  const pipelineByDm = new Map<string, number>();
  const statesByDm = new Map<string, Set<string>>();

  for (const opp of input.opportunities.filter((row) => row.openStatus && !row.isStaffed)) {
    const dm = opp.territoryOwner?.trim() || getDmForState(opp.state) || "Unassigned";
    openOppsByDm.set(dm, (openOppsByDm.get(dm) ?? 0) + 1);
    const states = statesByDm.get(dm) ?? new Set<string>();
    states.add(normalizeStateCode(opp.state));
    statesByDm.set(dm, states);
  }

  for (const candidate of input.candidates) {
    const record = input.workflows[candidate.candidateId];
    const state = normalizeStateCode(candidate.state ?? record?.assignedDM ?? "");
    const dm = getDmForState(state) ?? (record?.assignedDM?.trim() || "Unassigned");
    pipelineByDm.set(dm, (pipelineByDm.get(dm) ?? 0) + 1);
  }

  const dms = new Set([...openOppsByDm.keys(), ...pipelineByDm.keys()]);
  return [...dms].map((dmName) => {
    const openOpportunities = openOppsByDm.get(dmName) ?? 0;
    const activePipelineCandidates = pipelineByDm.get(dmName) ?? 0;
    const coveragePressure = openOpportunities > 0
      ? Math.min(100, Math.round((openOpportunities / Math.max(activePipelineCandidates, 1)) * 35))
      : 0;
    const backlogPressure = Math.min(100, Math.round(activePipelineCandidates / 3));
    const capacityScore = Math.max(
      0,
      Math.min(100, 100 - coveragePressure * 0.5 - backlogPressure * 0.35 - openOpportunities * 2),
    );
    return {
      dmName,
      capacityScore,
      status: classifyCapacity(capacityScore, openOpportunities, 12),
      openOpportunities,
      activePipelineCandidates,
      territoryCoveragePressure: coveragePressure,
      candidateBacklogPressure: backlogPressure,
    };
  }).sort((a, b) => a.capacityScore - b.capacityScore || b.openOpportunities - a.openOpportunities);
}
