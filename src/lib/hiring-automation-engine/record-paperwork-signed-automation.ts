import { createAutomationRun, findPendingRun } from "@/lib/hiring-automation-engine/automation-run-store";

export async function recordPaperworkSignedAutomations(input: {
  candidateId: string;
  signatureRequestId: string;
  actor?: string;
}): Promise<void> {
  const existing = await findPendingRun(input.candidateId, "mark-ready-for-mel");
  if (existing) return;

  await createAutomationRun({
    type: "mark-ready-for-mel",
    candidateId: input.candidateId,
    reason: "Paperwork signed via Dropbox Sign webhook.",
    dataUsed: [`signatureRequestId: ${input.signatureRequestId}`, "paperworkStatus: signed"],
    expectedOutcome: "Candidate advances to Ready for MEL; ops handoff task created.",
    undoPath: "Revert workflow status to Signed in Candidate Workspace.",
    requiresApproval: true,
    payload: { signatureRequestId: input.signatureRequestId },
    actor: input.actor ?? "dropbox-sign-webhook",
  });

  await createAutomationRun({
    type: "escalate-recruiter-task",
    candidateId: input.candidateId,
    reason: "Paperwork signed — recruiter/ops handoff required.",
    dataUsed: [`signatureRequestId: ${input.signatureRequestId}`],
    expectedOutcome: "Recruiter completes MEL readiness checklist.",
    undoPath: "Mark handoff complete in workspace.",
    requiresApproval: false,
    actor: input.actor ?? "dropbox-sign-webhook",
  });
}
