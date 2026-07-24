import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

export function validateNoLifecycleSideEffects(input: {
  workflowsBefore: Record<string, CandidateWorkflowRecord>;
  workflowsAfter: Record<string, CandidateWorkflowRecord>;
  touchedCandidateIds: string[];
}): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const id of input.touchedCandidateIds) {
    const before = input.workflowsBefore[id];
    const after = input.workflowsAfter[id];
    if (!before || !after) continue;
    if (before.workflowStatus !== after.workflowStatus) {
      violations.push(`stage_changed:${id}`);
    }
    if ((before.assignedRecruiter ?? null) !== (after.assignedRecruiter ?? null)) {
      violations.push(`recruiter_changed:${id}`);
    }
    if ((before.paperworkStatus ?? null) !== (after.paperworkStatus ?? null)) {
      violations.push(`paperwork_changed:${id}`);
    }
    if ((before.signatureRequestId ?? null) !== (after.signatureRequestId ?? null)) {
      violations.push(`envelope_changed:${id}`);
    }
  }
  return { ok: violations.length === 0, violations };
}

export function assertQuestionnaireOnlyWrites(input: {
  melWrites: number;
  paperworkSends: number;
  reminderSends: number;
  p192Restarted: boolean;
  p193GlobalEnabled: boolean;
}): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  if (input.melWrites !== 0) violations.push("mel_writes");
  if (input.paperworkSends !== 0) violations.push("paperwork_sends");
  if (input.reminderSends !== 0) violations.push("reminder_sends");
  if (input.p192Restarted) violations.push("p192_restarted");
  if (input.p193GlobalEnabled) violations.push("p193_global_enabled");
  return { ok: violations.length === 0, violations };
}
