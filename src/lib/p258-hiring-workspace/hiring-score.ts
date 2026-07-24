import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type {
  HiringScoreFactorId,
  HiringScoreReason,
  HiringScoreResult,
  HiringWorkspaceApplicantInput,
} from "@/lib/p258-hiring-workspace/types";

/** Factor weights sum to 100 — deterministic hiring score. */
export const HIRING_SCORE_WEIGHTS: Record<HiringScoreFactorId, number> = {
  distance: 12,
  stage: 14,
  recruiter: 10,
  dm: 8,
  phone: 6,
  email: 8,
  identity: 5,
  duplicate: 8,
  coverage: 8,
  qualification: 10,
  existingPaperwork: 6,
  signed: 5,
};

const FACTOR_LABELS: Record<HiringScoreFactorId, string> = {
  distance: "Distance",
  stage: "Breezy / workflow stage",
  recruiter: "Recruiter assignment",
  dm: "DM assignment",
  phone: "Phone on file",
  email: "Email on file",
  identity: "Identity completeness",
  duplicate: "Duplicate paperwork risk",
  coverage: "Coverage / location known",
  qualification: "Qualification progress",
  existingPaperwork: "Existing paperwork",
  signed: "Signed status",
};

function clampPoints(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function reason(
  id: HiringScoreFactorId,
  points: number,
  detail: string,
): HiringScoreReason {
  const weight = HIRING_SCORE_WEIGHTS[id];
  const clamped = clampPoints(points);
  return {
    id,
    label: FACTOR_LABELS[id],
    points: clamped,
    weight,
    contribution: Math.round(((clamped * weight) / 100) * 10) / 10,
    detail,
  };
}

function scoreDistance(miles: number | null | undefined): HiringScoreReason {
  if (miles == null || !Number.isFinite(miles)) {
    return reason("distance", 35, "Distance unknown");
  }
  if (miles <= 15) return reason("distance", 100, `${Math.round(miles)} mi — excellent`);
  if (miles <= 35) return reason("distance", 82, `${Math.round(miles)} mi — strong`);
  if (miles <= 60) return reason("distance", 55, `${Math.round(miles)} mi — review`);
  return reason("distance", 20, `${Math.round(miles)} mi — far`);
}

function scoreStage(input: HiringWorkspaceApplicantInput): HiringScoreReason {
  const status = input.workflowStatus;
  const map: Record<string, number> = {
    "Paperwork Needed": 95,
    Qualified: 88,
    "Operator Approved": 90,
    "Paperwork Sent": 72,
    Signed: 85,
    "Ready for MEL": 92,
    Applied: 48,
    "Needs Review": 52,
    "Awaiting DD Verification": 70,
    "Not Qualified": 5,
    "Loaded in MEL": 40,
    "Training Needed": 45,
    "Active Rep": 30,
  };
  const points = map[status] ?? 50;
  return reason("stage", points, `Workflow: ${status}`);
}

function scoreRecruiter(name: string | undefined): HiringScoreReason {
  const assigned = !isUnassignedRecruiter(name ?? "");
  return assigned
    ? reason("recruiter", 100, `Assigned to ${name!.trim()}`)
    : reason("recruiter", 25, "Recruiter unassigned");
}

function scoreDm(name: string | undefined): HiringScoreReason {
  const raw = (name ?? "").trim();
  const assigned = Boolean(raw) && raw.toLowerCase() !== "unassigned";
  return assigned
    ? reason("dm", 100, `DM: ${raw}`)
    : reason("dm", 30, "DM unassigned");
}

function scorePhone(phone: string | undefined): HiringScoreReason {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length >= 10) return reason("phone", 100, "Phone on file");
  if (digits.length > 0) return reason("phone", 55, "Partial phone");
  return reason("phone", 15, "Missing phone");
}

function scoreEmail(email: string | undefined): HiringScoreReason {
  const value = (email ?? "").trim();
  if (value.includes("@") && value.includes(".")) {
    return reason("email", 100, value);
  }
  if (value) return reason("email", 40, "Email looks incomplete");
  return reason("email", 0, "Missing email");
}

function scoreIdentity(input: HiringWorkspaceApplicantInput): HiringScoreReason {
  const first = (input.firstName ?? "").trim();
  const last = (input.lastName ?? "").trim();
  if (first && last) return reason("identity", 100, `${first} ${last}`);
  if (first || last) return reason("identity", 60, "Partial name");
  return reason("identity", 20, "Name missing — email/id only");
}

function scoreDuplicate(input: HiringWorkspaceApplicantInput): HiringScoreReason {
  const status = input.paperworkStatus ?? "not_sent";
  if (status === "signed" || input.workflowStatus === "Signed") {
    return reason("duplicate", 15, "Already signed — do not re-send");
  }
  if (
    input.signatureRequestId &&
    (status === "sent" || status === "viewed" || input.workflowStatus === "Paperwork Sent")
  ) {
    return reason("duplicate", 20, "Active signature request — duplicate risk");
  }
  if (status === "sent" || status === "viewed") {
    return reason("duplicate", 35, "Paperwork already in flight");
  }
  return reason("duplicate", 100, "No active duplicate packet");
}

function scoreCoverage(miles: number | null | undefined): HiringScoreReason {
  if (miles == null || !Number.isFinite(miles)) {
    return reason("coverage", 25, "Coverage unknown (no distance)");
  }
  if (miles <= 39) return reason("coverage", 100, "Within auto coverage band (≤39 mi)");
  if (miles <= 60) return reason("coverage", 55, "Manual review band (40–60 mi)");
  return reason("coverage", 15, "Outside coverage (>60 mi)");
}

function scoreQualification(input: HiringWorkspaceApplicantInput): HiringScoreReason {
  const status = input.workflowStatus;
  if (status === "Not Qualified") {
    return reason("qualification", 0, "Not qualified / rejected");
  }
  if (
    status === "Qualified" ||
    status === "Operator Approved" ||
    status === "Paperwork Needed" ||
    status === "Paperwork Sent" ||
    status === "Signed" ||
    status === "Ready for MEL"
  ) {
    return reason("qualification", 100, `Qualified path (${status})`);
  }
  if (input.recommendInterview) {
    return reason("qualification", 75, "Interview recommended");
  }
  if (status === "Applied" || status === "Needs Review") {
    return reason("qualification", 45, "Awaiting qualification");
  }
  return reason("qualification", 40, status);
}

function scoreExistingPaperwork(input: HiringWorkspaceApplicantInput): HiringScoreReason {
  const status = input.paperworkStatus ?? "not_sent";
  if (input.workflowStatus === "Paperwork Needed" && status === "not_sent") {
    return reason("existingPaperwork", 100, "Ready — paperwork needed, not yet sent");
  }
  if (status === "not_sent") {
    return reason("existingPaperwork", 70, "No paperwork sent yet");
  }
  if (status === "failed" || status === "declined") {
    return reason("existingPaperwork", 40, `Prior paperwork ${status}`);
  }
  if (status === "sent" || status === "viewed") {
    return reason("existingPaperwork", 55, `Paperwork ${status}`);
  }
  return reason("existingPaperwork", 80, `Paperwork ${status}`);
}

function scoreSigned(input: HiringWorkspaceApplicantInput): HiringScoreReason {
  if (input.paperworkStatus === "signed" || input.workflowStatus === "Signed") {
    return reason("signed", 100, "Paperwork signed");
  }
  if (input.workflowStatus === "Ready for MEL") {
    return reason("signed", 95, "Past signed — ready for MEL");
  }
  return reason("signed", 40, "Not signed yet");
}

/**
 * Pure deterministic hiring score (0–100) with weighted reason breakdown.
 * Does not read or write production systems.
 */
export function computeHiringScore(input: HiringWorkspaceApplicantInput): HiringScoreResult {
  const reasons: HiringScoreReason[] = [
    scoreDistance(input.distanceMiles),
    scoreStage(input),
    scoreRecruiter(input.assignedRecruiter),
    scoreDm(input.assignedDM),
    scorePhone(input.phone),
    scoreEmail(input.email),
    scoreIdentity(input),
    scoreDuplicate(input),
    scoreCoverage(input.distanceMiles),
    scoreQualification(input),
    scoreExistingPaperwork(input),
    scoreSigned(input),
  ];

  const weighted = reasons.reduce((sum, row) => sum + row.points * row.weight, 0);
  const score = clampPoints(weighted / 100);
  return { score, reasons };
}

/** True when the applicant is in the "Ready for Paperwork" operator queue. */
export function isReadyForPaperwork(input: HiringWorkspaceApplicantInput): boolean {
  if (input.workflowStatus === "Paperwork Needed") return true;
  if (input.actionType === "send-paperwork") return true;
  return false;
}
