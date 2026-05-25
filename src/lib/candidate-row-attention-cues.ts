import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildRecruiterScanCues,
  RECRUITER_SCAN_CUE_STYLES,
  type RecruiterScanCue,
  type RecruiterScanCueId,
} from "@/lib/recruiter-candidate-intelligence";

/** @deprecated Use RecruiterScanCueId */
export type AttentionCueId = RecruiterScanCueId;

/** @deprecated Use RecruiterScanCue */
export type AttentionCue = RecruiterScanCue;

/** Table scan badges — delegates to recruiter intelligence cues. */
export function buildRowAttentionCues(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
  max = 2,
): RecruiterScanCue[] {
  return buildRecruiterScanCues(row, referenceMs, max);
}

export const ATTENTION_CUE_STYLES = RECRUITER_SCAN_CUE_STYLES;
