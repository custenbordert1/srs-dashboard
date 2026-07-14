import {
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import type { P1885FrozenCohort } from "@/lib/p188-5-recruiter-restore-canary/types";

export type P1885IngestionDurabilityReport = {
  challengedAt: string;
  cohortSize: number;
  challenged: number;
  preserved: number;
  clobbered: number;
  lostUpdates: number;
  unrelatedFieldChanges: number;
  details: Array<{
    candidateId: string;
    before: string;
    afterChallenge: string;
    preserved: boolean;
    unrelatedChanges: string[];
  }>;
};

/**
 * Controlled ingestion durability challenge: apply Unassigned / omit recruiter
 * via backfill-style upserts and verify named owners stick.
 */
export async function runIngestionDurabilityChallenge(
  cohort: P1885FrozenCohort,
): Promise<P1885IngestionDurabilityReport> {
  const challengedAt = new Date().toISOString();
  const before = await getCandidateWorkflowState();
  const details: P1885IngestionDurabilityReport["details"] = [];

  for (const member of cohort.members) {
    const wf = before[member.candidateId];
    const expected = member.proposedRecruiter;
    if (!wf || wf.assignedRecruiter !== expected) {
      details.push({
        candidateId: member.candidateId,
        before: wf?.assignedRecruiter ?? "(missing)",
        afterChallenge: wf?.assignedRecruiter ?? "(missing)",
        preserved: false,
        unrelatedChanges: [],
      });
      continue;
    }

    const statusBefore = wf.workflowStatus;
    const paperworkBefore = wf.paperworkStatus;
    const recommendedBefore = wf.recommendedStage ?? null;

    // Challenge 1: explicit Unassigned (historical clobber path)
    await upsertCandidateWorkflow({
      candidateId: member.candidateId,
      assignedRecruiter: "Unassigned",
      workflowStatus: wf.workflowStatus,
      audit: {
        action: "ingestion_import",
        metadata: {
          p1885Challenge: "unassigned_incoming",
          cohortId: cohort.cohortId,
        },
      },
      skipOwnershipLedger: true,
    });

    // Challenge 2: omit recruiter (current backfill style)
    await upsertCandidateWorkflow({
      candidateId: member.candidateId,
      workflowStatus: wf.workflowStatus,
      audit: {
        action: "ingestion_import",
        metadata: {
          p1885Challenge: "omit_recruiter",
          cohortId: cohort.cohortId,
        },
      },
      skipOwnershipLedger: true,
    });

    const after = (await getCandidateWorkflowState())[member.candidateId];
    const unrelatedChanges: string[] = [];
    if (after?.workflowStatus !== statusBefore) unrelatedChanges.push("workflowStatus");
    if (after?.paperworkStatus !== paperworkBefore) unrelatedChanges.push("paperworkStatus");
    if ((after?.recommendedStage ?? null) !== recommendedBefore) {
      unrelatedChanges.push("recommendedStage");
    }

    details.push({
      candidateId: member.candidateId,
      before: expected,
      afterChallenge: after?.assignedRecruiter ?? "(missing)",
      preserved: after?.assignedRecruiter === expected,
      unrelatedChanges,
    });
  }

  const preserved = details.filter((d) => d.preserved).length;
  const clobbered = details.filter((d) => !d.preserved).length;
  const unrelatedFieldChanges = details.reduce((n, d) => n + d.unrelatedChanges.length, 0);

  return {
    challengedAt,
    cohortSize: cohort.size,
    challenged: details.length,
    preserved,
    clobbered,
    lostUpdates: clobbered,
    unrelatedFieldChanges,
    details,
  };
}
