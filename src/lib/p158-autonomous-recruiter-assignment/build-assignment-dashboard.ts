import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { listCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadPrioritizationCohort } from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import {
  countP158AssignmentsToday,
  loadP158AssignmentAuditLog,
} from "@/lib/p158-autonomous-recruiter-assignment/assignment-audit-store";
import {
  isP158AutomaticAssignmentsEnabled,
} from "@/lib/p158-autonomous-recruiter-assignment/assignment-config";
import { buildP158AssignmentQueue } from "@/lib/p158-autonomous-recruiter-assignment/assignment-engine";
import { isHighConfidenceAssignment } from "@/lib/p158-autonomous-recruiter-assignment/confidence-score";
import { sortAssignmentQueue } from "@/lib/p158-autonomous-recruiter-assignment/recommendation-builder";
import type {
  P158AssignmentDashboard,
  P158AssignmentQueueItem,
  P158RecruiterWorkloadRow,
  P158TerritoryBalanceRow,
} from "@/lib/p158-autonomous-recruiter-assignment/types";
import { P158_SOURCE_PHASE } from "@/lib/p158-autonomous-recruiter-assignment/types";
import { buildTransitionReport } from "@/lib/p158-post-assignment-workflow-transition";

function buildRecruiterWorkload(queue: P158AssignmentQueueItem[]): P158RecruiterWorkloadRow[] {
  const byRecruiter = new Map<string, P158RecruiterWorkloadRow>();

  for (const item of queue) {
    if (!item.recommendedRecruiter) continue;
    const existing = byRecruiter.get(item.recommendedRecruiter) ?? {
      recruiter: item.recommendedRecruiter,
      currentLoad: item.recruiterWorkload,
      projectedLoad: item.recruiterWorkload,
      queuedAssignments: 0,
    };
    if (item.status === "queued") {
      existing.queuedAssignments += 1;
      existing.projectedLoad = existing.currentLoad + existing.queuedAssignments;
    }
    byRecruiter.set(item.recommendedRecruiter, existing);
  }

  return [...byRecruiter.values()].sort(
    (a, b) => b.projectedLoad - a.projectedLoad || a.recruiter.localeCompare(b.recruiter),
  );
}

function buildTerritoryBalance(queue: P158AssignmentQueueItem[]): P158TerritoryBalanceRow[] {
  const byTerritory = new Map<string, P158TerritoryBalanceRow>();

  for (const item of queue) {
    const key = item.territory ?? item.state ?? "Unknown";
    const existing = byTerritory.get(key) ?? {
      territory: key,
      dm: item.dm,
      unassignedCandidates: 0,
      openDemand: item.openDemand,
      recommendedRecruiter: item.recommendedRecruiter,
    };
    if (isUnassignedRecruiter(item.assignedRecruiter) && item.status === "queued") {
      existing.unassignedCandidates += 1;
    }
    existing.openDemand = Math.max(existing.openDemand, item.openDemand);
    byTerritory.set(key, existing);
  }

  return [...byTerritory.values()].sort(
    (a, b) => b.unassignedCandidates - a.unassignedCandidates || b.openDemand - a.openDemand,
  );
}

export async function buildAssignmentDashboard(): Promise<P158AssignmentDashboard> {
  const [cohortBase, bundle, store, auditEvents, onboardingRecords] = await Promise.all([
    loadPrioritizationCohort(),
    getCandidateWorkflowBundle(),
    readIngestionStore(),
    loadP158AssignmentAuditLog(),
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
      auditEvents,
      referenceMs,
    }),
  );

  const highConfidence = queue.filter((q) => q.status === "queued" && isHighConfidenceAssignment(q.confidence));
  const manualReview = queue.filter((q) => q.status === "manual_review");
  const assignmentQueue = queue.filter((q) => q.status === "queued");
  const skippedExisting = queue.filter((q) => q.status === "skipped");
  const blocked = queue.filter((q) => q.status === "blocked");
  const todaysAssignments = auditEvents.filter((e) => e.action === "assigned");
  const avgConfidence =
    assignmentQueue.length > 0
      ? Math.round(assignmentQueue.reduce((sum, q) => sum + q.confidence, 0) / assignmentQueue.length)
      : 0;

  const transitionReport = await buildTransitionReport();

  return {
    generatedAt: cohort.fetchedAt,
    readOnly: true,
    sourcePhase: P158_SOURCE_PHASE,
    simulationMode: !isP158AutomaticAssignmentsEnabled(),
    productionEnabled: isP158AutomaticAssignmentsEnabled(),
    summary: {
      totalEvaluated: queue.length,
      assignmentQueue: assignmentQueue.length,
      highConfidence: highConfidence.length,
      manualReview: manualReview.length,
      skippedExisting: skippedExisting.length,
      blocked: blocked.length,
      todaysAssignments: countP158AssignmentsToday(auditEvents),
      avgConfidence,
    },
    sections: {
      assignmentQueue: assignmentQueue.slice(0, 50),
      highConfidence: highConfidence.slice(0, 25),
      manualReview: manualReview.slice(0, 25),
      recruiterWorkload: buildRecruiterWorkload(queue),
      territoryBalance: buildTerritoryBalance(queue).slice(0, 20),
      assignmentHistory: auditEvents.slice(0, 50),
      todaysAssignments: todaysAssignments.slice(0, 50),
      assignmentAudit: auditEvents.slice(0, 100),
    },
    warnings: cohort.warnings,
    transitionReport,
  };
}
