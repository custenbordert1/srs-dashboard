/**
 * Input validation / data-quality scoring for the candidate-evaluation orchestrator.
 * Missing fields produce clear audit reasons — never a hard throw.
 */

import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { BreezyCandidate } from "@/lib/breezy-api";

export type DataQualityIssueCode =
  | "missing_email"
  | "missing_phone"
  | "missing_location"
  | "missing_position"
  | "missing_identity"
  | "missing_resume"
  | "missing_questionnaire"
  | "unassigned_recruiter"
  | "unassigned_dm"
  | "stale_action_type"
  | "active_packet_on_intake";

export type DataQualityIssue = {
  code: DataQualityIssueCode;
  field: string;
  reason: string;
  severity: "blocking" | "degraded" | "info";
};

export type DataQualityAssessment = {
  candidateId: string;
  /** 0–100 */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  issues: DataQualityIssue[];
  /** True when automation should prefer human_review over auto_advance. */
  preferHumanReview: boolean;
  summary: string;
};

function hasUsableEmail(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim();
  return e.includes("@") && e.length >= 5;
}

function hasUsablePhone(phone: string | null | undefined): boolean {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10;
}

function gradeFromScore(score: number): DataQualityAssessment["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Soft validation of candidate/row inputs before scoring.
 * Does not throw — returns issues + score for the audit trail.
 */
export function validateCandidateInputQuality(input: {
  row?: ScoredCandidateWorkflowRow | null;
  candidate?: BreezyCandidate | null;
  candidateId?: string;
}): DataQualityAssessment {
  return assessCandidateDataQuality(input);
}

/**
 * Soft validation of candidate/row inputs before scoring.
 * Does not throw — returns issues + score for the audit trail.
 * @deprecated Prefer {@link validateCandidateInputQuality}.
 */
export function assessCandidateDataQuality(input: {
  row?: ScoredCandidateWorkflowRow | null;
  candidate?: BreezyCandidate | null;
  candidateId?: string;
}): DataQualityAssessment {
  const row = input.row ?? null;
  const candidate = input.candidate ?? null;
  const candidateId =
    input.candidateId ||
    row?.candidateId ||
    candidate?.candidateId ||
    "unknown";

  const issues: DataQualityIssue[] = [];
  let score = 100;

  const email = row?.email ?? candidate?.email;
  const phone = row?.phone ?? candidate?.phone;
  const city = String(row?.city ?? candidate?.city ?? "").trim();
  const state = String(row?.state ?? candidate?.state ?? "").trim();
  const positionId = String(row?.positionId ?? candidate?.positionId ?? "").trim();
  const positionName = String(row?.positionName ?? candidate?.positionName ?? "").trim();
  const first = String(row?.firstName ?? candidate?.firstName ?? "").trim();
  const last = String(row?.lastName ?? candidate?.lastName ?? "").trim();
  const name = `${first} ${last}`.trim();

  if (!name || /^unknown/i.test(name)) {
    issues.push({
      code: "missing_identity",
      field: "name",
      reason: "Display name missing or unknown",
      severity: "blocking",
    });
    score -= 25;
  }
  if (!hasUsableEmail(email)) {
    issues.push({
      code: "missing_email",
      field: "email",
      reason: "Email missing or invalid",
      severity: "blocking",
    });
    score -= 20;
  }
  if (!hasUsablePhone(phone)) {
    issues.push({
      code: "missing_phone",
      field: "phone",
      reason: "Phone missing or fewer than 10 digits",
      severity: "blocking",
    });
    score -= 15;
  }
  if (!city || !state) {
    issues.push({
      code: "missing_location",
      field: "city/state",
      reason: `city=${city || "?"} state=${state || "?"}`,
      severity: "blocking",
    });
    score -= 15;
  }
  if (!positionId && !positionName) {
    issues.push({
      code: "missing_position",
      field: "position",
      reason: "Position id/name missing",
      severity: "degraded",
    });
    score -= 10;
  }

  const hasResume = Boolean(row?.hasResume ?? candidate?.hasResume);
  if (!hasResume) {
    issues.push({
      code: "missing_resume",
      field: "resume",
      reason: "No resume detected on candidate record",
      severity: "info",
    });
    score -= 5;
  }
  const hasQuestionnaire = Boolean(
    candidate?.hasQuestionnaire ||
      (candidate?.questionnaireAnswers?.length ?? 0) > 0 ||
      row?.questionnaireIntelligence,
  );
  if (!hasQuestionnaire) {
    issues.push({
      code: "missing_questionnaire",
      field: "questionnaire",
      reason: "Questionnaire answers not present",
      severity: "info",
    });
    score -= 5;
  }

  const recruiter = String(row?.assignedRecruiter ?? "Unassigned").trim();
  if (!recruiter || /^unassigned$/i.test(recruiter)) {
    issues.push({
      code: "unassigned_recruiter",
      field: "assignedRecruiter",
      reason: "Recruiter not assigned — P158 should resolve before send",
      severity: "degraded",
    });
    score -= 5;
  }
  const dm = String(row?.assignedDM ?? "Unassigned").trim();
  if (!dm || /^unassigned$/i.test(dm)) {
    issues.push({
      code: "unassigned_dm",
      field: "assignedDM",
      reason: "DM not assigned — P216 should resolve before send",
      severity: "info",
    });
    score -= 3;
  }

  const actionType = String(row?.actionType ?? "").trim();
  if (actionType === "await-signature" || actionType === "send-paperwork") {
    issues.push({
      code: "stale_action_type",
      field: "actionType",
      reason: `Stale actionType=${actionType} may false-fail qualification on replay`,
      severity: "degraded",
    });
    score -= 8;
  }

  const paperwork = String(row?.paperworkStatus ?? "not_sent");
  const stage = String(row?.workflowStatus ?? "");
  const sig = String(row?.signatureRequestId ?? "").trim();
  if (
    (stage === "Applied" || stage === "Needs Review") &&
    (paperwork === "sent" || paperwork === "viewed" || paperwork === "signed" || Boolean(sig))
  ) {
    issues.push({
      code: "active_packet_on_intake",
      field: "paperworkStatus",
      reason: "Intake stage with active packet — protect from resend",
      severity: "blocking",
    });
    score -= 20;
  }

  score = Math.max(0, Math.min(100, score));
  const preferHumanReview =
    issues.some((i) => i.severity === "blocking") || score < 70;

  const summary =
    issues.length === 0
      ? `Data quality ${score}/100 — complete`
      : `Data quality ${score}/100 — ${issues.length} issue(s): ${issues
          .map((i) => i.code)
          .join(", ")}`;

  return {
    candidateId,
    score,
    grade: gradeFromScore(score),
    issues,
    preferHumanReview,
    summary,
  };
}
