import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { WorkflowLike } from "@/lib/p186-3-operator-lifecycle-queues/dashboard";

/** Map production workflow records into P186.3 source rows (no secrets). */
export function workflowsToP1863Source(
  workflows: Record<string, CandidateWorkflowRecord> | CandidateWorkflowRecord[],
  meta?: Record<
    string,
    { name?: string | null; jobTitle?: string | null; city?: string | null; state?: string | null }
  >,
): WorkflowLike[] {
  const list = Array.isArray(workflows) ? workflows : Object.values(workflows);
  return list.map((wf) => {
    const m = meta?.[wf.candidateId];
    const note = wf.notes?.slice(-1)[0] ?? null;
    return {
      candidateId: wf.candidateId,
      name: m?.name ?? null,
      jobTitle: m?.jobTitle ?? null,
      city: m?.city ?? null,
      state: m?.state ?? null,
      recruiter: wf.assignedRecruiter || null,
      dm: wf.assignedDM || null,
      workflowStatus: wf.workflowStatus,
      paperworkStatus: wf.paperworkStatus,
      paperworkSentAt: wf.paperworkSentAt,
      paperworkViewedAt: wf.paperworkViewedAt,
      paperworkSignedAt: wf.paperworkSignedAt,
      signatureRequestId: wf.signatureRequestId ? "[redacted]" : null,
      recommendedStage: wf.recommendedStage ?? null,
      directDepositStatus: wf.directDepositStatus,
      note,
      updatedAt: wf.lastActionAt,
      withdrawn: /withdrawn/i.test(note ?? "") || /withdrawn/i.test(wf.nextActionNeeded ?? ""),
      archived: false,
      holdFlags: [],
      priority: wf.actionPriority ?? wf.progressionPriority ?? undefined,
    };
  });
}
