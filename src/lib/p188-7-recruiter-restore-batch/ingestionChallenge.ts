import {
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import type { P1885FrozenCohort } from "@/lib/p188-5-recruiter-restore-canary/types";

export type P1887IngestionDurabilityReport = {
  challengedAt: string;
  newBatchSize: number;
  priorRestoredSize: number;
  newBatchPreserved: number;
  priorRestoredPreserved: number;
  clobbered: number;
  totalNamedProtectedExpected: number;
  totalNamedProtectedActual: number;
  unrelatedFieldChanges: number;
  details: Array<{
    candidateId: string;
    cohort: "prior_restored" | "p1887_batch";
    before: string;
    afterChallenge: string;
    preserved: boolean;
    unrelatedChanges: string[];
  }>;
};

async function challengeOne(
  candidateId: string,
  expected: string,
  cohortLabel: "prior_restored" | "p1887_batch",
  cohortId: string,
): Promise<P1887IngestionDurabilityReport["details"][number]> {
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
      metadata: { p1887Challenge: "unassigned_incoming", cohortId },
    },
    skipOwnershipLedger: true,
  });
  await upsertCandidateWorkflow({
    candidateId,
    workflowStatus: wf.workflowStatus,
    audit: {
      action: "ingestion_import",
      metadata: { p1887Challenge: "omit_recruiter", cohortId },
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

export async function runP1887IngestionDurabilityChallenge(input: {
  newBatch: P1885FrozenCohort;
  priorMembers: P1885FrozenCohort["members"];
}): Promise<P1887IngestionDurabilityReport> {
  const challengedAt = new Date().toISOString();
  const details: P1887IngestionDurabilityReport["details"] = [];

  for (const m of input.newBatch.members) {
    details.push(
      await challengeOne(m.candidateId, m.proposedRecruiter, "p1887_batch", input.newBatch.cohortId),
    );
  }
  for (const m of input.priorMembers) {
    details.push(
      await challengeOne(
        m.candidateId,
        m.proposedRecruiter,
        "prior_restored",
        "prior-p188.5+p188.6",
      ),
    );
  }

  const newBatchPreserved = details.filter((d) => d.cohort === "p1887_batch" && d.preserved).length;
  const priorRestoredPreserved = details.filter(
    (d) => d.cohort === "prior_restored" && d.preserved,
  ).length;
  const clobbered = details.filter((d) => !d.preserved).length;
  const unrelatedFieldChanges = details.reduce((n, d) => n + d.unrelatedChanges.length, 0);
  const expected = input.newBatch.size + input.priorMembers.length;

  return {
    challengedAt,
    newBatchSize: input.newBatch.size,
    priorRestoredSize: input.priorMembers.length,
    newBatchPreserved,
    priorRestoredPreserved,
    clobbered,
    totalNamedProtectedExpected: expected,
    totalNamedProtectedActual: newBatchPreserved + priorRestoredPreserved,
    unrelatedFieldChanges,
    details,
  };
}
