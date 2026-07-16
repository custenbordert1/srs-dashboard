import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P207Stage } from "@/lib/p207-autonomous-readiness-dashboard/types";

const HISTORICAL_RE =
  /historical.?applicant|prior.?application|re.?apply|previously.?applied/i;

export function classifyP207Stage(
  workflow: CandidateWorkflowRecord | undefined,
): P207Stage {
  if (!workflow) return "Applied";
  const status = String(workflow.workflowStatus ?? "");
  const paperwork = workflow.paperworkStatus ?? "not_sent";
  const notes = (workflow.notes ?? []).join("\n");

  if (
    status === "Not Qualified" ||
    status === "Rejected" ||
    paperwork === "declined"
  ) {
    return "Rejected";
  }
  if (status === "Ready for MEL" || status === "Ready For Assignment") {
    return "Ready for MEL";
  }
  if (status === "Signed" || paperwork === "signed" || Boolean(workflow.paperworkSignedAt)) {
    return "Signed";
  }
  if (
    status === "Paperwork Sent" ||
    paperwork === "sent" ||
    paperwork === "viewed" ||
    Boolean(workflow.signatureRequestId && paperwork !== "not_sent")
  ) {
    return "Paperwork Sent";
  }
  if (status === "Paperwork Needed") return "Paperwork Needed";
  if (status === "Needs Review") return "Needs Review";
  if (HISTORICAL_RE.test(notes) && status === "Applied") return "Historical";
  if (status === "Applied") return "Applied";
  // Fallback buckets
  if (/historical/i.test(status)) return "Historical";
  return "Applied";
}

export function startOfTodayIso(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function changedToday(
  workflow: CandidateWorkflowRecord | undefined,
  todayIso: string,
): boolean {
  if (!workflow?.updatedAt) return false;
  return workflow.updatedAt >= todayIso;
}

export function hasValidEmail(candidate: BreezyCandidate | undefined): boolean {
  return Boolean(candidate?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email));
}

export function hasQuestionnaire(candidate: BreezyCandidate | undefined): boolean {
  if (!candidate) return false;
  if (candidate.hasQuestionnaire) return true;
  return Array.isArray(candidate.questionnaireAnswers) && candidate.questionnaireAnswers.length >= 4;
}

export function hasResume(candidate: BreezyCandidate | undefined): boolean {
  if (!candidate) return false;
  return Boolean(candidate.hasResume) || String(candidate.resumeText ?? "").trim().length >= 40;
}
