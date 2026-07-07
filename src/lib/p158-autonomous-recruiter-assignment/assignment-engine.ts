import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { evaluateRecruiterAssignmentCandidate } from "@/lib/p151-autonomous-recruiter-assignment/evaluate-recruiter-assignment-candidate";
import { buildPrioritizedQueueFromCohort } from "@/lib/p156-candidate-prioritization/build-prioritized-queue";
import type { P156PrioritizationCohort } from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import {
  computeP158AssignmentConfidence,
  extractStateOwnership,
} from "@/lib/p158-autonomous-recruiter-assignment/confidence-score";
import { buildAssignmentExplanation } from "@/lib/p158-autonomous-recruiter-assignment/explanation-generator";
import { resolveP158AssignmentStatus } from "@/lib/p158-autonomous-recruiter-assignment/assignment-rules";
import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";
import { P158_ASSIGNMENT_CONFIDENCE_THRESHOLD } from "@/lib/p158-autonomous-recruiter-assignment/assignment-config";
import { hasP158RecentAssignment } from "@/lib/p158-autonomous-recruiter-assignment/assignment-audit-store";
import type { P158AssignmentAuditEvent } from "@/lib/p158-autonomous-recruiter-assignment/types";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import type { RecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/types";

export function buildP158AssignmentQueue(input: {
  cohort: P156PrioritizationCohort & { candidatesById: Map<string, BreezyCandidate> };
  workflows: Record<string, CandidateWorkflowRecord>;
  rosters: import("@/lib/candidate-workflow-types").RecruiterRosters;
  jobs: BreezyJob[];
  onboardingByCandidate: Map<string, import("@/lib/candidate-onboarding-engine/types").CandidateOnboardingRecord>;
  auditEvents: P158AssignmentAuditEvent[];
  referenceMs: number;
}): P158AssignmentQueueItem[] {
  const jobsByPositionId = new Map(input.jobs.map((job) => [job.jobId, job]));
  const priorityQueue = buildPrioritizedQueueFromCohort(input.cohort);
  const priorityById = new Map(priorityQueue.candidates.map((c) => [c.candidateId, c]));

  const decisions = buildRecruiterAssignmentDecisions({
    candidates: [...input.cohort.candidatesById.values()],
    workflows: input.workflows,
    rosters: input.rosters,
    jobsByPositionId,
  });
  const decisionById = new Map(decisions.map((d) => [d.candidateId, d]));

  const recruiterLoad = new Map<string, number>();
  for (const wf of Object.values(input.workflows)) {
    const key = wf.assignedRecruiter?.trim();
    if (!key || isUnassignedRecruiter(key)) continue;
    recruiterLoad.set(key, (recruiterLoad.get(key) ?? 0) + 1);
  }

  const items: P158AssignmentQueueItem[] = [];

  for (const candidate of input.cohort.candidates) {
    const workflow = input.workflows[candidate.candidateId];
    const breezy = input.cohort.candidatesById.get(candidate.candidateId);
    if (!breezy) continue;

    const assignment = decisionById.get(candidate.candidateId);
    if (!assignment) continue;

    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: jobsByPositionId.get(candidate.positionId ?? ""),
    });
    const evaluation = evaluateRecruiterAssignmentCandidate({
      row,
      candidate: breezy,
      assignment,
      jobsByPositionId,
      publishedJobs: input.jobs,
      onboarding: input.onboardingByCandidate.get(candidate.candidateId) ?? null,
      referenceMs: input.referenceMs,
    });

    const priority = priorityById.get(candidate.candidateId);
    const openDemand = priority?.openDemand ?? 0;
    const priorityScore = priority?.priorityScore ?? 0;
    const projectedRecruiter = assignment.recruiter || evaluation.recommendedRecruiter || "";
    const workload = projectedRecruiter ? (recruiterLoad.get(projectedRecruiter) ?? 0) : 0;

    const confidence = computeP158AssignmentConfidence({
      baseConfidence: assignment.confidence,
      priorityScore,
      openDemand,
      recruiterWorkload: workload,
      stateOwned: extractStateOwnership(assignment, assignment.reason),
    });

    const { status: baseStatus, skipReason: baseSkip } = resolveP158AssignmentStatus({
      workflow,
      evaluation,
      assignment,
      duplicateInAudit: hasP158RecentAssignment(input.auditEvents, candidate.candidateId),
    });

    let status = baseStatus;
    let skipReason = baseSkip;
    if (
      assignment.recruiter &&
      !evaluation.duplicateStatus &&
      isUnassignedRecruiter(row.assignedRecruiter) &&
      baseStatus === "manual_review" &&
      confidence >= P158_ASSIGNMENT_CONFIDENCE_THRESHOLD
    ) {
      status = "queued";
      skipReason = null;
    }

    const reasoning = buildAssignmentExplanation({
      territoryState: assignment.territoryState,
      dmName: assignment.dmName,
      recommendedRecruiter: evaluation.recommendedRecruiter,
      openDemand,
      recruiterWorkload: workload,
      assignmentReason: assignment.reason,
      priorityScore,
    });

    items.push({
      candidateId: candidate.candidateId,
      candidateName: evaluation.candidateName,
      email: row.email?.trim() || null,
      state: breezy.state?.trim() || null,
      territory: assignment.territoryState,
      dm: assignment.dmName,
      position: row.positionName ?? "—",
      assignedRecruiter: row.assignedRecruiter || "Unassigned",
      recommendedRecruiter: evaluation.recommendedRecruiter,
      confidence,
      priorityScore,
      openDemand,
      recruiterWorkload: workload,
      status,
      reasoning,
      skipReason,
      duplicateRisk: evaluation.duplicateStatus || hasP158RecentAssignment(input.auditEvents, candidate.candidateId),
    });
  }

  return items;
}

export function findAssignmentDecision(
  decisions: RecruiterAssignmentDecision[],
  candidateId: string,
): RecruiterAssignmentDecision | undefined {
  return decisions.find((d) => d.candidateId === candidateId);
}
