import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import type { P155RecentSendRow } from "@/lib/p155-autopilot-operations-dashboard/types";

export async function buildP155RecentSends(input?: {
  limit?: number;
  sinceMs?: number;
}): Promise<P155RecentSendRow[]> {
  const limit = input?.limit ?? 25;
  const sinceMs = input?.sinceMs ?? Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const bundle = await getCandidateWorkflowBundle();
  const audit = await loadPaperworkAutomationAuditLog();

  const sentEvents = audit
    .filter(
      (e) =>
        e.sendResult === "sent" &&
        e.executed === true &&
        ["paperwork_sent", "initial_paperwork_sent"].includes(e.type) &&
        Date.parse(e.at) >= sinceMs,
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);

  return sentEvents.map((event) => {
    const workflow = bundle.workflows[event.candidateId];
    return {
      candidateId: event.candidateId,
      candidateName: event.candidateName ?? event.candidateId,
      email: event.email ?? workflow?.onboardingContactEmail ?? "—",
      recruiter: event.recruiter ?? workflow?.assignedRecruiter ?? "Unassigned",
      dm: workflow?.assignedDM ?? "Unassigned",
      signatureRequestId: workflow?.signatureRequestId ?? null,
      status: workflow?.paperworkStatus ?? event.paperworkStatusBeforeSend ?? "sent",
      sentAt: event.at,
      dryRun: event.simulated === true || event.executionMode === "dry_run",
    };
  });
}
