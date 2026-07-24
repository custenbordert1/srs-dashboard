import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { HiringWorkspaceApplicantRow } from "@/lib/p258-hiring-workspace";
import type {
  CandidateOpsBadgeTone,
  CandidateOpsIntelligence,
  CandidateOpsIntelligenceBadge,
} from "@/lib/p259-candidate-operations/types";

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isUnassignedDm(name: string): boolean {
  const raw = name.trim();
  return !raw || raw.toLowerCase() === "unassigned";
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function hasEmail(email: string): boolean {
  const value = email.trim();
  return value.includes("@") && value.includes(".");
}

function hasIdentity(row: HiringWorkspaceApplicantRow): boolean {
  return Boolean(row.firstName.trim() && row.lastName.trim());
}

function coverageBand(
  miles: number | null,
): CandidateOpsIntelligence["coverageBand"] {
  if (miles == null || !Number.isFinite(miles)) return "unknown";
  if (miles <= 39) return "within";
  if (miles <= 60) return "review";
  return "outside";
}

function duplicateRisk(
  row: HiringWorkspaceApplicantRow,
): CandidateOpsIntelligence["duplicateRisk"] {
  if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") return "high";
  if (
    row.signatureRequestId &&
    (row.paperworkStatus === "sent" ||
      row.paperworkStatus === "viewed" ||
      row.workflowStatus === "Paperwork Sent")
  ) {
    return "high";
  }
  if (row.paperworkStatus === "sent" || row.paperworkStatus === "viewed") return "low";
  return "none";
}

function missingInformation(row: HiringWorkspaceApplicantRow): string[] {
  const missing: string[] = [];
  if (!hasEmail(row.email)) missing.push("email");
  if (phoneDigits(row.phone).length < 10) missing.push("phone");
  if (!hasIdentity(row)) missing.push("identity");
  if (isUnassignedRecruiter(row.recruiter)) missing.push("recruiter");
  if (isUnassignedDm(row.dm)) missing.push("dm");
  if (row.distanceMiles == null) missing.push("distance");
  return missing;
}

/**
 * Deterministic probability the candidate will sign (0–100).
 * Pure function — no I/O.
 */
export function computeProbabilityToSign(row: HiringWorkspaceApplicantRow): number {
  let score = row.hiringScore * 0.55;

  if (row.workflowStatus === "Paperwork Needed") score += 18;
  else if (row.workflowStatus === "Qualified" || row.workflowStatus === "Operator Approved")
    score += 12;
  else if (row.workflowStatus === "Paperwork Sent") score += 8;
  else if (row.workflowStatus === "Signed" || row.workflowStatus === "Ready for MEL") score += 30;
  else if (row.workflowStatus === "Not Qualified") score -= 40;

  if (hasEmail(row.email)) score += 6;
  else score -= 12;
  if (phoneDigits(row.phone).length >= 10) score += 4;
  else score -= 6;
  if (!isUnassignedRecruiter(row.recruiter)) score += 5;
  else score -= 8;

  if (row.distanceMiles != null) {
    if (row.distanceMiles <= 20) score += 8;
    else if (row.distanceMiles <= 40) score += 3;
    else if (row.distanceMiles > 60) score -= 10;
  }

  if (duplicateRisk(row) === "high" && row.paperworkStatus !== "signed") score -= 15;

  return clampPct(score);
}

/**
 * Deterministic probability the candidate will complete onboarding (0–100).
 */
export function computeProbabilityToComplete(row: HiringWorkspaceApplicantRow): number {
  const sign = computeProbabilityToSign(row);
  let score = sign * 0.7;

  if (row.workflowStatus === "Signed") score += 20;
  if (row.workflowStatus === "Ready for MEL") score += 25;
  if (row.workflowStatus === "Loaded in MEL" || row.workflowStatus === "Active Rep") score += 30;
  if (!isUnassignedDm(row.dm)) score += 6;
  else score -= 5;
  if (row.eligibility.verdict === "Blocked") score -= 20;
  else if (row.eligibility.verdict === "Needs Attention") score -= 8;

  return clampPct(score);
}

/**
 * Estimated days to hire from current stage. Null when not estimable.
 */
export function estimateDaysToHire(row: HiringWorkspaceApplicantRow): number | null {
  if (row.workflowStatus === "Not Qualified") return null;
  if (row.workflowStatus === "Active Rep" || row.workflowStatus === "Loaded in MEL") return 0;
  if (row.workflowStatus === "Ready for MEL") return 2;
  if (row.workflowStatus === "Signed") return 4;
  if (row.workflowStatus === "Paperwork Sent") return 7;
  if (row.workflowStatus === "Paperwork Needed") return 10;
  if (row.workflowStatus === "Qualified" || row.workflowStatus === "Operator Approved") return 12;
  if (row.workflowStatus === "Awaiting DD Verification") return 6;

  let days = 18;
  if (row.distanceMiles != null && row.distanceMiles > 60) days += 4;
  if (isUnassignedRecruiter(row.recruiter)) days += 3;
  if (!hasEmail(row.email)) days += 2;
  return days;
}

function badge(
  id: string,
  label: string,
  value: string,
  tone: CandidateOpsBadgeTone,
  detail: string,
): CandidateOpsIntelligenceBadge {
  return { id, label, value, tone, detail };
}

/**
 * Build recruiting intelligence badges + scores for an applicant row.
 */
export function buildRecruitingIntelligence(
  row: HiringWorkspaceApplicantRow,
): CandidateOpsIntelligence {
  const probabilityToSign = computeProbabilityToSign(row);
  const probabilityToComplete = computeProbabilityToComplete(row);
  const estimatedDaysToHire = estimateDaysToHire(row);
  const coverage = coverageBand(row.distanceMiles);
  const dup = duplicateRisk(row);
  const missing = missingInformation(row);

  const scoreTone: CandidateOpsBadgeTone =
    row.hiringScore >= 75 ? "good" : row.hiringScore >= 50 ? "warn" : "bad";
  const signTone: CandidateOpsBadgeTone =
    probabilityToSign >= 70 ? "good" : probabilityToSign >= 45 ? "warn" : "bad";
  const completeTone: CandidateOpsBadgeTone =
    probabilityToComplete >= 70 ? "good" : probabilityToComplete >= 45 ? "warn" : "bad";
  const coverageTone: CandidateOpsBadgeTone =
    coverage === "within" ? "good" : coverage === "review" ? "warn" : coverage === "outside" ? "bad" : "neutral";
  const dupTone: CandidateOpsBadgeTone =
    dup === "none" ? "good" : dup === "low" ? "warn" : "bad";

  const badges: CandidateOpsIntelligenceBadge[] = [
    badge("hiring_score", "Hiring Score", String(row.hiringScore), scoreTone, "Weighted P258 score"),
    badge(
      "prob_sign",
      "Prob. to Sign",
      `${probabilityToSign}%`,
      signTone,
      "Deterministic estimate from stage, contact, distance, ownership",
    ),
    badge(
      "prob_complete",
      "Prob. to Complete",
      `${probabilityToComplete}%`,
      completeTone,
      "Deterministic estimate of onboarding completion",
    ),
    badge(
      "days_hire",
      "Est. Days to Hire",
      estimatedDaysToHire == null ? "—" : String(estimatedDaysToHire),
      estimatedDaysToHire == null ? "neutral" : estimatedDaysToHire <= 7 ? "good" : estimatedDaysToHire <= 14 ? "warn" : "bad",
      "Stage-based estimate; not a forecast model",
    ),
    badge(
      "distance",
      "Distance",
      row.distanceMiles != null ? `${Math.round(row.distanceMiles)} mi` : "—",
      row.distanceMiles == null
        ? "neutral"
        : row.distanceMiles <= 20
          ? "good"
          : row.distanceMiles <= 40
            ? "warn"
            : "bad",
      "Miles to job location",
    ),
    badge(
      "coverage",
      "Coverage",
      coverage === "within"
        ? "Within"
        : coverage === "review"
          ? "Review"
          : coverage === "outside"
            ? "Outside"
            : "Unknown",
      coverageTone,
      "≤39 within · 40–60 review · >60 outside",
    ),
    badge(
      "duplicate",
      "Duplicate Risk",
      dup === "none" ? "None" : dup === "low" ? "Low" : "High",
      dupTone,
      "Active or signed packet risk",
    ),
    badge(
      "missing",
      "Missing Info",
      missing.length ? missing.join(", ") : "None",
      missing.length ? "warn" : "good",
      missing.length ? `Missing: ${missing.join(", ")}` : "Contact + ownership complete",
    ),
  ];

  return {
    hiringScore: row.hiringScore,
    hiringScoreReasons: row.hiringScoreReasons,
    probabilityToSign,
    probabilityToComplete,
    estimatedDaysToHire,
    distanceMiles: row.distanceMiles,
    coverageBand: coverage,
    duplicateRisk: dup,
    missingInformation: missing,
    badges,
  };
}
