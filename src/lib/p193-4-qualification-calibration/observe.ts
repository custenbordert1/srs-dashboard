import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P1934FrozenCohort } from "@/lib/p193-4-qualification-calibration/types";
import { listP193Records } from "@/lib/p193-simplified-autonomous-lifecycle/server/persistence";

export function observeP1934Pilot(input: {
  cohort: P1934FrozenCohort;
  workflows: Record<string, CandidateWorkflowRecord>;
  bridgedIds: string[];
}): {
  generatedAt: string;
  queueAdditions: number;
  paperworkAttempted: number;
  confirmedSent: number;
  viewed: number;
  signed: number;
  failed: number;
  duplicatePrevented: number;
  rows: Array<{
    candidateId: string;
    bridged: boolean;
    workflowStatus: string | null;
    paperworkStatus: string | null;
    hasEnvelope: boolean;
    simplifiedState: string | null;
  }>;
} {
  // Synchronous observation helper using already-loaded workflows; records loaded by caller optionally.
  const rows = input.cohort.members.map((member) => {
    const wf = input.workflows[member.candidateId];
    const paperwork = wf?.paperworkStatus ?? null;
    return {
      candidateId: member.candidateId,
      bridged: input.bridgedIds.includes(member.candidateId),
      workflowStatus: wf?.workflowStatus ?? null,
      paperworkStatus: paperwork,
      hasEnvelope: Boolean(wf?.signatureRequestId),
      simplifiedState: null as string | null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    queueAdditions: rows.filter((r) => r.workflowStatus === "Paperwork Needed").length,
    paperworkAttempted: rows.filter((r) =>
      ["sent", "viewed", "signed", "declined", "failed"].includes(String(r.paperworkStatus)),
    ).length,
    confirmedSent: rows.filter((r) => r.paperworkStatus === "sent" || r.hasEnvelope).length,
    viewed: rows.filter((r) => r.paperworkStatus === "viewed").length,
    signed: rows.filter((r) => r.paperworkStatus === "signed").length,
    failed: rows.filter((r) => r.paperworkStatus === "failed" || r.paperworkStatus === "declined")
      .length,
    duplicatePrevented: 0,
    rows,
  };
}

export async function enrichObservationWithP193States(input: {
  observation: ReturnType<typeof observeP1934Pilot>;
}): Promise<ReturnType<typeof observeP1934Pilot>> {
  const records = await listP193Records();
  const byId = Object.fromEntries(records.map((r) => [r.candidateId, r]));
  return {
    ...input.observation,
    rows: input.observation.rows.map((row) => ({
      ...row,
      simplifiedState: byId[row.candidateId]?.state ?? null,
    })),
  };
}
