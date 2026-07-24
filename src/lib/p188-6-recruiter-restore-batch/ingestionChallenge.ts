import {
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import type { P1885FrozenCohort } from "@/lib/p188-5-recruiter-restore-canary/types";

export type P1886IngestionDurabilityReport = {
  challengedAt: string;
  newBatchSize: number;
  priorCanarySize: number;
  newBatchPreserved: number;
  priorCanaryPreserved: number;
  clobbered: number;
  totalNamedProtectedExpected: number;
  totalNamedProtectedActual: number;
  unrelatedFieldChanges: number;
  details: Array<{
    candidateId: string;
    cohort: "prior_canary" | "p1886_batch";
    before: string;
    afterChallenge: string;
    preserved: boolean;
    unrelatedChanges: string[];
  }>;
};

async function challengeOne(
  candidateId: string,
  expected: string,
  cohortLabel: "prior_canary" | "p1886_batch",
  cohortId: string,
): Promise<P1886IngestionDurabilityReport["details"][number]> {
  const beforeState = await getCandidateWorkflowState();
  const wf = beforeState[candidateId];
  if (!wf || wf.assignedRecruiter !== expected) {
    return {
      candidateId,
      cohort: cohortLabel,
      before: wf?.assignedRecruiter ?? "(missing)",
      afterChallenge: wf?.assignedRecruiter ?? "(missing)",
      preserved: false,
      unrelatedChanges: [],
    };
  }

  const statusBefore = wf.workflowStatus;
  const paperworkBefore = wf.paperworkStatus;
  const recommendedBefore = wf.recommendedStage ?? null;

  await upsertCandidateWorkflow({
    candidateId,
    assignedRecruiter: "Unassigned",
    workflowStatus: wf.workflowStatus,
    audit: {
      action: "ingestion_import",
      metadata: { p1886Challenge: "unassigned_incoming", cohortId },
    },
    skipOwnershipLedger: true,
  });
  await upsertCandidateWorkflow({
    candidateId,
    workflowStatus: wf.workflowStatus,
    audit: {
      action: "ingestion_import",
      metadata: { p1886Challenge: "omit_recruiter", cohortId },
    },
    skipOwnershipLedger: true,
  });

  const after = (await getCandidateWorkflowState())[candidateId];
  const unrelatedChanges: string[] = [];
  if (after?.workflowStatus !== statusBefore) unrelatedChanges.push("workflowStatus");
  if (after?.paperworkStatus !== paperworkBefore) unrelatedChanges.push("paperworkStatus");
  if ((after?.recommendedStage ?? null) !== recommendedBefore) {
    unrelatedChanges.push("recommendedStage");
  }

  return {
    candidateId,
    cohort: cohortLabel,
    before: expected,
    afterChallenge: after?.assignedRecruiter ?? "(missing)",
    preserved: after?.assignedRecruiter === expected,
    unrelatedChanges,
  };
}

export async function runP1886IngestionDurabilityChallenge(input: {
  newBatch: P1885FrozenCohort;
  priorCanary: P1885FrozenCohort;
}): Promise<P1886IngestionDurabilityReport> {
  const challengedAt = new Date().toISOString();
  const details: P1886IngestionDurabilityReport["details"] = [];

  for (const m of input.newBatch.members) {
    details.push(
      await challengeOne(m.candidateId, m.proposedRecruiter, "p1886_batch", input.newBatch.cohortId),
    );
  }
  for (const m of input.priorCanary.members) {
    details.push(
      await challengeOne(
        m.candidateId,
        m.proposedRecruiter,
        "prior_canary",
        input.priorCanary.cohortId,
      ),
    );
  }

  const newBatchPreserved = details.filter((d) => d.cohort === "p1886_batch" && d.preserved).length;
  const priorCanaryPreserved = details.filter(
    (d) => d.cohort === "prior_canary" && d.preserved,
  ).length;
  const clobbered = details.filter((d) => !d.preserved).length;
  const unrelatedFieldChanges = details.reduce((n, d) => n + d.unrelatedChanges.length, 0);
  const expected = input.newBatch.size + input.priorCanary.size;

  return {
    challengedAt,
    newBatchSize: input.newBatch.size,
    priorCanarySize: input.priorCanary.size,
    newBatchPreserved,
    priorCanaryPreserved,
    clobbered,
    totalNamedProtectedExpected: expected,
    totalNamedProtectedActual: newBatchPreserved + priorCanaryPreserved,
    unrelatedFieldChanges,
    details,
  };
}
