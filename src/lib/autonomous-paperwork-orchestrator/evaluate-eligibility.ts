import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import type { PaperworkBlockerCategory } from "@/lib/p106-autonomous-paperwork-engine/types";
import {
  buildApprovedMappingOverlayJobs,
  simulateCandidateDryRunEligibility,
} from "@/lib/p110-approved-mapping-integration/simulate-approved-mapping-eligibility";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";
import { isReadyForSendBlocker } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import type { LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import type { PaperworkEligibilityStatus } from "@/lib/autonomous-paperwork-orchestrator/types";

const WAITING_SIGNATURE_STATUSES = new Set(["sent", "viewed", "Paperwork Sent"]);

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

function mapBlockerToStatus(
  category: PaperworkBlockerCategory,
  reason: string,
  row: ScoredCandidateWorkflowRow,
): PaperworkEligibilityStatus {
  if (WAITING_SIGNATURE_STATUSES.has(row.paperworkStatus) || row.workflowStatus === "Paperwork Sent") {
    return "WAITING_SIGNATURE";
  }
  switch (category) {
    case "already_sent":
      return "ALREADY_SENT";
    case "invalid_email":
      return "INVALID_EMAIL";
    case "duplicate_risk":
      return "DUPLICATE";
    case "project_mapping_review":
      return "WAITING_MAPPING";
    case "unpublished_job":
    case "closed_job":
      return "WAITING_JOB_POST";
    case "project_not_mappable":
    case "missing_candidate_match":
      return "NO_PROJECT";
    case "call_first_required":
      return "WAITING_RECRUITER";
    case "p84_gate_failed":
      return /dm|district/i.test(reason) ? "WAITING_DM" : "WAITING_RECRUITER";
    case "missing_resume":
    case "missing_questionnaire":
    case "terminal_status":
      return "BLOCKED";
    case "unknown_manual_review":
      return "READY_TO_SEND";
    default:
      return "BLOCKED";
  }
}

export function evaluateCandidateEligibility(input: {
  candidateId: string;
  row: ScoredCandidateWorkflowRow | null;
  context: LoadedPaperworkCandidates;
  paperworkByGrade: PaperworkByGrade;
  approvedMapping: ApprovedMappingResolution | null;
}): {
  status: PaperworkEligibilityStatus;
  requiredAction: string;
  blockingReasons: string[];
  templateKey: string | null;
  mappingConfidence: number;
  approvedMappingReady: boolean;
} {
  if (!input.row) {
    return {
      status: "BLOCKED",
      requiredAction: "Restore candidate ingestion row.",
      blockingReasons: ["Candidate row not found."],
      templateKey: null,
      mappingConfidence: 0,
      approvedMappingReady: false,
    };
  }

  const baseline = classifyPaperworkBlocker({
    row: input.row,
    onboarding: input.context.onboardingByCandidateId.get(input.candidateId) ?? null,
    jobsByPositionId: input.context.jobsByPositionId,
    closedJobsByPositionId: input.context.closedJobsByPositionId,
    publishedJobs: input.context.publishedJobs,
    paperworkByGrade: input.paperworkByGrade,
    p100SentIds: input.context.p100SentIds,
  });

  let status = mapBlockerToStatus(baseline.category, baseline.reason, input.row);
  const dryRun = simulateCandidateDryRunEligibility({
    row: input.row,
    onboarding: input.context.onboardingByCandidateId.get(input.candidateId) ?? null,
    jobsByPositionId: input.context.jobsByPositionId,
    closedJobsByPositionId: input.context.closedJobsByPositionId,
    publishedJobs: input.context.publishedJobs,
    paperworkByGrade: input.paperworkByGrade,
    p100SentIds: input.context.p100SentIds,
    approvedMapping: input.approvedMapping,
  });

  const overlayJobs =
    input.approvedMapping && input.row.positionId
      ? buildApprovedMappingOverlayJobs({
          jobsByPositionId: input.context.jobsByPositionId,
          closedPositionId: input.row.positionId,
          approved: input.approvedMapping,
          publishedJobs: input.context.publishedJobs,
        })
      : null;

  const p84 = overlayJobs
    ? buildPaperworkSendEligibility({
        row: input.row,
        onboarding: input.context.onboardingByCandidateId.get(input.candidateId) ?? null,
        jobsByPositionId: overlayJobs,
      })
    : buildPaperworkSendEligibility({
        row: input.row,
        onboarding: input.context.onboardingByCandidateId.get(input.candidateId) ?? null,
        jobsByPositionId: input.context.jobsByPositionId,
      });

  if (!p84.templateKey && status === "READY_TO_SEND") {
    status = "NO_TEMPLATE";
  }

  if (dryRun.outcome === "newly_eligible_via_approval") {
    status = "READY_AFTER_APPROVAL";
  } else if (
    status === "WAITING_MAPPING" &&
    input.approvedMapping?.qualifies &&
    overlayJobs &&
    isReadyForSendBlocker(
      classifyPaperworkBlocker({
        row: input.row,
        onboarding: input.context.onboardingByCandidateId.get(input.candidateId) ?? null,
        jobsByPositionId: overlayJobs,
        closedJobsByPositionId: input.context.closedJobsByPositionId,
        publishedJobs: input.context.publishedJobs,
        paperworkByGrade: input.paperworkByGrade,
        p100SentIds: input.context.p100SentIds,
      }).category,
    )
  ) {
    status = "READY_AFTER_APPROVAL";
  }

  const requiredAction =
    status === "READY_TO_SEND" || status === "READY_AFTER_APPROVAL"
      ? "Execute executeOne when all safety gates pass."
      : baseline.recommendedFix;

  return {
    status,
    requiredAction,
    blockingReasons: status === "READY_TO_SEND" || status === "READY_AFTER_APPROVAL" ? [] : [baseline.reason],
    templateKey: p84.templateKey,
    mappingConfidence: input.approvedMapping?.confidenceScore ?? (input.row.positionId ? 80 : 0),
    approvedMappingReady: Boolean(input.approvedMapping?.qualifies),
  };
}

export function evaluateEligibilityForCandidates(input: {
  context: LoadedPaperworkCandidates;
  paperworkByGrade: PaperworkByGrade;
}): Array<ReturnType<typeof evaluateCandidateEligibility> & { candidateId: string; row: ScoredCandidateWorkflowRow | null }> {
  return input.context.candidateIds.map((candidateId) => {
    const row = input.context.rowsByCandidateId.get(candidateId) ?? null;
    const approvedMapping = input.context.approvedMappingsByCandidate.get(candidateId) ?? null;
    return {
      candidateId,
      row,
      ...evaluateCandidateEligibility({
        candidateId,
        row,
        context: input.context,
        paperworkByGrade: input.paperworkByGrade,
        approvedMapping,
      }),
    };
  });
}

export { daysSince };
