import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { listCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { buildPrioritizedQueueFromCohort } from "@/lib/p156-candidate-prioritization/build-prioritized-queue";
import {
  buildScoringContextForRow,
  loadPrioritizationCohort,
  pickActiveOnboardingRecord,
} from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { loadP158AssignmentAuditLog } from "@/lib/p158-autonomous-recruiter-assignment/assignment-audit-store";
import { getP158MaxAssignmentsPerRun } from "@/lib/p158-autonomous-recruiter-assignment/assignment-config";
import { buildP158AssignmentQueue } from "@/lib/p158-autonomous-recruiter-assignment/assignment-engine";
import type { P158AssignmentQueueItem } from "@/lib/p158-autonomous-recruiter-assignment/types";
import { sortAssignmentQueue } from "@/lib/p158-autonomous-recruiter-assignment/recommendation-builder";
import {
  analyzeSimulationBottlenecks,
  buildConfidenceDistribution,
} from "@/lib/p158-assignment-simulation/bottleneck-analysis";
import { projectPostAssignmentOutcomes } from "@/lib/p158-assignment-simulation/paperwork-impact";
import { buildSimulationSummary } from "@/lib/p158-assignment-simulation/simulation-summary";
import {
  buildTerritoryHeatMap,
  computeTerritoryImbalanceScore,
} from "@/lib/p158-assignment-simulation/territory-impact";
import type { P1581AssignmentSimulation } from "@/lib/p158-assignment-simulation/types";
import { P158_1_SOURCE_PHASE } from "@/lib/p158-assignment-simulation/types";
import {
  buildCurrentRecruiterLoads,
  buildWorkloadImpact,
  findLargestWorkloadIncrease,
} from "@/lib/p158-assignment-simulation/workload-impact";
import { buildPostAssignmentOutcomeDiagnosis } from "@/lib/p158-post-assignment-outcome-diagnosis";

function countQueueUnassigned(queue: P158AssignmentQueueItem[]): number {
  return queue.filter((q) => isUnassignedRecruiter(q.assignedRecruiter)).length;
}

function countRemainingUnassignedAfterSimulation(
  queue: P158AssignmentQueueItem[],
  simulatedIds: Set<string>,
): number {
  return queue.filter(
    (q) => isUnassignedRecruiter(q.assignedRecruiter) && !simulatedIds.has(q.candidateId),
  ).length;
}

export async function buildAssignmentSimulation(input?: {
  maxAssignments?: number | null;
}): Promise<P1581AssignmentSimulation> {
  const [
    cohortBase,
    bundle,
    store,
    p158AuditEvents,
    paperworkAuditEvents,
    onboardingRecords,
  ] = await Promise.all([
    loadPrioritizationCohort(),
    getCandidateWorkflowBundle(),
    readIngestionStore(),
    loadP158AssignmentAuditLog(),
    loadPaperworkAutomationAuditLog(),
    listCandidateOnboardingRecords(500),
  ]);

  const candidatesById = new Map(
    listIngestedCandidates(store).map((candidate) => [candidate.candidateId, candidate]),
  );
  const cohort = { ...cohortBase, candidatesById };
  const jobs = [...cohort.jobsByPositionId.values()];
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const referenceMs = Date.parse(cohort.fetchedAt);

  const queue = sortAssignmentQueue(
    buildP158AssignmentQueue({
      cohort,
      workflows: bundle.workflows,
      rosters: bundle.rosters,
      jobs,
      onboardingByCandidate,
      auditEvents: p158AuditEvents,
      referenceMs,
    }),
  );

  const maxCap = input?.maxAssignments ?? getP158MaxAssignmentsPerRun();
  const queued = queue.filter((q) => q.status === "queued");
  const simulatedAssignments = queued.slice(0, maxCap);

  const currentLoads = buildCurrentRecruiterLoads(bundle.workflows);
  const projectedLoads = new Map(currentLoads);
  for (const item of simulatedAssignments) {
    if (!item.recommendedRecruiter) continue;
    projectedLoads.set(
      item.recommendedRecruiter,
      (projectedLoads.get(item.recommendedRecruiter) ?? 0) + 1,
    );
  }

  const workloadImpact = buildWorkloadImpact({
    currentLoads,
    queue,
    simulatedAssignments,
    rosterRecruiters: bundle.rosters.recruiters,
  });

  const territoryHeatMap = buildTerritoryHeatMap({ queue, simulatedAssignments });
  const territoryImbalanceScore = computeTerritoryImbalanceScore(territoryHeatMap);

  const priorityQueue = buildPrioritizedQueueFromCohort(cohort);
  const priorityById = new Map(priorityQueue.candidates.map((c) => [c.candidateId, c]));

  const scoringMetaByCandidate = new Map<
    string,
    {
      openDemand: number;
      coverageStatus: string;
      daysUntilProjectStart: number | null;
      projectName: string | null;
      jobStatus: string | null;
      jobPublished: boolean;
    }
  >();

  for (const row of cohort.candidates) {
    const meta = buildScoringContextForRow({
      row,
      coverageNeeds: cohort.coverageNeeds,
      opportunities: cohort.opportunities,
      jobsByPositionId: cohort.jobsByPositionId,
      referenceMs,
    });
    const job = cohort.jobsByPositionId.get(row.positionId);
    scoringMetaByCandidate.set(row.candidateId, {
      openDemand: meta.openDemand,
      coverageStatus: meta.coverageStatus,
      daysUntilProjectStart: meta.daysUntilProjectStart,
      projectName: meta.projectName,
      jobStatus: job?.status ?? null,
      jobPublished: job?.status === "published",
    });
  }

  const outcomes = projectPostAssignmentOutcomes({
    simulatedAssignments,
    workflows: bundle.workflows,
    candidatesById,
    priorityById,
    onboardingByCandidate,
    auditEvents: paperworkAuditEvents,
    jobsByPositionId: cohort.jobsByPositionId,
    scoringMetaByCandidate,
    recruiterLoads: projectedLoads,
    referenceMs,
  });

  const simulatedIds = new Set(simulatedAssignments.map((i) => i.candidateId));
  const remainingUnassigned = countRemainingUnassignedAfterSimulation(queue, simulatedIds);
  const largestWorkloadIncrease = findLargestWorkloadIncrease(workloadImpact);

  const summary = buildSimulationSummary({
    candidatesEvaluated: queue.length,
    simulatedAssignments: simulatedAssignments.length,
    remainingUnassigned,
    workload: workloadImpact,
    territoryImbalanceScore,
    outcomes,
    largestWorkloadIncrease,
  });

  const simulationWarnings = analyzeSimulationBottlenecks({
    queue,
    workload: workloadImpact,
    territory: territoryHeatMap,
    simulatedCount: simulatedAssignments.length,
    remainingUnassigned,
  });

  const confidenceDistribution = buildConfidenceDistribution(queue);

  const outcomeDiagnosis = await buildPostAssignmentOutcomeDiagnosis({
    maxAssignments: maxCap,
    simulatedAssignments,
  });

  return {
    generatedAt: cohort.fetchedAt,
    readOnly: true,
    sourcePhase: P158_1_SOURCE_PHASE,
    simulationOnly: true,
    maxAssignmentsApplied: maxCap,
    summary,
    sections: {
      assignmentSimulation: simulatedAssignments,
      workloadImpact,
      territoryHeatMap,
      beforeAfterComparison: workloadImpact,
      projectedPaperworkQueue: outcomes.outcomes.filter((o) =>
        ["Send Paperwork", "Ready For MEL"].includes(o.p157Action),
      ),
      warnings: simulationWarnings,
      simulationSummary: summary,
      confidenceDistribution,
      postAssignmentDiagnosis: outcomeDiagnosis.candidates,
    },
    outcomeDiagnosis,
    warnings: [
      ...cohort.warnings,
      ...simulationWarnings.map((w) => w.message),
    ],
  };
}

export async function runAssignmentSimulation(input?: {
  maxAssignments?: number | null;
}): Promise<import("@/lib/p158-assignment-simulation/types").P1581SimulationRunResult> {
  const simulation = await buildAssignmentSimulation(input);
  return {
    ok: true,
    readOnly: true,
    simulationOnly: true,
    message: `P158.1 simulation complete — ${simulation.summary.candidatesAssignedInSimulation} candidate(s) would be assigned (no production writes).`,
    simulation,
  };
}
