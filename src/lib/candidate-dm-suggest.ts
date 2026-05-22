import { resolveDmName } from "@/lib/dm-territory-map";

export type DmSuggestInput = {
  candidateState?: string;
  jobState?: string;
  assignedDM?: string;
};

export function resolveCandidateState(input: DmSuggestInput): string {
  const job = input.jobState?.trim();
  if (job) return job;
  return input.candidateState?.trim() ?? "";
}

/** Territory-based DM suggestion from candidate or job state. */
export function suggestDmForCandidate(input: DmSuggestInput): string {
  const state = resolveCandidateState(input);
  if (!state) return "Unassigned";
  return resolveDmName("", state);
}

export function isDmUnassigned(dm: string): boolean {
  const v = dm.trim().toLowerCase();
  return !v || v === "unassigned" || v === "—";
}

/** True when assigned DM differs from territory suggestion (and suggestion exists). */
export function dmAssignmentNeedsAttention(assignedDM: string, suggestedDM: string): boolean {
  if (isDmUnassigned(suggestedDM)) return false;
  if (isDmUnassigned(assignedDM)) return true;
  return assignedDM.trim() !== suggestedDM.trim();
}

export function dmMatchesSuggestion(assignedDM: string, suggestedDM: string): boolean {
  if (isDmUnassigned(suggestedDM)) return isDmUnassigned(assignedDM);
  return assignedDM.trim() === suggestedDM.trim();
}
