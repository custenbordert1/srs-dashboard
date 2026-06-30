import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { PaperworkBlockerCategory } from "@/lib/p106-autonomous-paperwork-engine/types";
import { resolveClosedAdProjectMapping } from "@/lib/closed-ad-project-mapping/resolve-closed-ad-project-mapping";
import type { ClosedAdProjectMappingResult } from "@/lib/closed-ad-project-mapping/types";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";

const TERMINAL_STATUSES = new Set([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Ready for MEL",
  "Signed",
]);

function isAlreadySent(row: ScoredCandidateWorkflowRow, p100SentIds: Set<string>): boolean {
  return (
    p100SentIds.has(row.candidateId) ||
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.paperworkStatus === "signed" ||
    row.workflowStatus === "Paperwork Sent" ||
    row.workflowStatus === "Signed" ||
    Boolean(row.signatureRequestId?.trim())
  );
}

export function classifyPaperworkBlocker(input: {
  row: ScoredCandidateWorkflowRow | null;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
  closedJobsByPositionId?: Map<string, BreezyJob>;
  publishedJobs?: BreezyJob[];
  paperworkByGrade: PaperworkByGrade;
  p100SentIds: Set<string>;
}): {
  category: PaperworkBlockerCategory;
  reason: string;
  recommendedFix: string;
  autoRepairable: boolean;
} {
  if (!input.row) {
    return {
      category: "missing_candidate_match",
      reason: "Candidate row not found in ingestion store.",
      recommendedFix: "Verify Breezy sync and ingestion.",
      autoRepairable: false,
    };
  }

  const row = input.row;

  if (isAlreadySent(row, input.p100SentIds)) {
    return {
      category: "already_sent",
      reason: "Paperwork already sent or in flight.",
      recommendedFix: "No action — monitor signature status.",
      autoRepairable: false,
    };
  }

  if (TERMINAL_STATUSES.has(row.workflowStatus)) {
    return {
      category: "terminal_status",
      reason: `Terminal workflow status: ${row.workflowStatus}.`,
      recommendedFix: "Exclude from paperwork automation.",
      autoRepairable: false,
    };
  }

  const emailCheck = validateCohortEmail(row.email ?? "");
  if (!emailCheck.valid) {
    return {
      category: "invalid_email",
      reason: emailCheck.reason ?? "Invalid email.",
      recommendedFix: "Correct candidate email before send.",
      autoRepairable: false,
    };
  }

  const dup = duplicatePaperworkSendBlockReason({
    workflow: {
      candidateId: row.candidateId,
      paperworkStatus: row.paperworkStatus,
      workflowStatus: row.workflowStatus,
      signatureRequestId: row.signatureRequestId,
    } as CandidateWorkflowRecord,
    activeOnboarding: input.onboarding,
  });
  if (dup) {
    return {
      category: "duplicate_risk",
      reason: dup,
      recommendedFix: "Resolve duplicate protection before resend.",
      autoRepairable: false,
    };
  }

  const published = Boolean(row.positionId?.trim() && input.jobsByPositionId.has(row.positionId));
  const projectMapping: ClosedAdProjectMappingResult = published
    ? {
        status: "published",
        confidence: "high",
        passesPublishedJobGate: true,
        sourcePositionId: row.positionId,
        mappedPublishedJobId: row.positionId,
        mappedProjectName: input.jobsByPositionId.get(row.positionId!)?.name ?? null,
        mappedCity: input.jobsByPositionId.get(row.positionId!)?.city ?? null,
        mappedState: input.jobsByPositionId.get(row.positionId!)?.state ?? null,
        reason: "Published Breezy position.",
      }
    : resolveClosedAdProjectMapping({
        row,
        positionTitle: row.positionName,
        candidateCity: row.city,
        candidateState: row.state,
        jobsByPositionId: input.jobsByPositionId,
        closedJobsByPositionId: input.closedJobsByPositionId,
        publishedJobs: input.publishedJobs ?? [...input.jobsByPositionId.values()],
      });

  if (!projectMapping.passesPublishedJobGate) {
    if (projectMapping.status === "project_mapping_review") {
      return {
        category: "project_mapping_review",
        reason: projectMapping.reason,
        recommendedFix: "Recruiter review — confirm project mapping before paperwork send.",
        autoRepairable: false,
      };
    }
    return {
      category: "project_not_mappable",
      reason: projectMapping.reason,
      recommendedFix: "Confirm active project mapping or equivalent published position.",
      autoRepairable: false,
    };
  }

  if (projectMapping.status === "closed_ad_mapped_project") {
    // Not a blocker — closed ad successfully mapped to active project; continue evaluation.
  }

  const jobsForAdvancement = new Map(input.jobsByPositionId);
  if (
    projectMapping.status === "closed_ad_mapped_project" &&
    projectMapping.mappedPublishedJobId &&
    row.positionId
  ) {
    const mappedJob =
      input.publishedJobs?.find((j) => j.jobId === projectMapping.mappedPublishedJobId) ??
      [...input.jobsByPositionId.values()].find((j) => j.jobId === projectMapping.mappedPublishedJobId);
    if (mappedJob) jobsForAdvancement.set(row.positionId, mappedJob);
  }

  const p83 = buildCandidateAdvancementDecision(row, {
    jobsByPositionId: jobsForAdvancement,
    paperworkByGrade: input.paperworkByGrade,
    requireApproval: false,
  });
  if (p83.action === "call-first") {
    return {
      category: "call_first_required",
      reason: p83.reason,
      recommendedFix: "Recruiter call-first before paperwork.",
      autoRepairable: false,
    };
  }

  if (!row.hasResume && row.candidateGrade?.paperworkReady === false) {
    return {
      category: "missing_resume",
      reason: "Resume or paperwork readiness data missing.",
      recommendedFix: "Collect resume or complete questionnaire.",
      autoRepairable: false,
    };
  }

  const p84 = buildPaperworkSendEligibility({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
    projectMapping,
  });

  if (!p84.eligible) {
    const operationalOnly = p84.blockingReasons.every((r) =>
      /recruiter|Paperwork Needed|send-paperwork|DM/i.test(r),
    );
    if (operationalOnly) {
      return {
        category: "p84_gate_failed",
        reason: p84.blockingReasons.join("; "),
        recommendedFix: "Auto-repair recruiter/DM assignment and advance workflow.",
        autoRepairable: true,
      };
    }
    return {
      category: "p84_gate_failed",
      reason: p84.blockingReasons[0] ?? "P84 gates not satisfied.",
      recommendedFix: "Resolve P84 blockers manually.",
      autoRepairable: false,
    };
  }

  return {
    category: "unknown_manual_review",
    reason: "Ready for controlled send.",
    recommendedFix: "Execute controlled executeOne when approved.",
    autoRepairable: false,
  };
}
