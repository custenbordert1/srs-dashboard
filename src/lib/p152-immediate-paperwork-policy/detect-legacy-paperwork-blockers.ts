import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import {
  findNearestActiveOperationalNeed,
  hasOperationalFit,
} from "@/lib/candidate-first-paperwork-eligibility/match-active-operational-need";
import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import type { LegacyPaperworkBlocker } from "@/lib/p152-immediate-paperwork-policy/types";
import { evaluateCandidate } from "@/lib/recruiting/candidate-advancement-engine";
import {
  evaluateInitialPaperworkEligibility,
  P147_INITIAL_CONFIDENCE_MIN,
} from "@/lib/recruiting/initial-paperwork-execution-engine";
import { evaluatePaperworkCandidate } from "@/lib/recruiting/paperwork-automation-engine";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";

export const P152_BYPASSED_RULES = [
  "P83 requireApproval=true (human approval before shouldAdvance)",
  "workflowStatus must be Paperwork Needed",
  "actionType must be send-paperwork",
  `P144/P147 confidence threshold (${P147_INITIAL_CONFIDENCE_MIN}%)`,
  "Missing resume / incomplete applicant review verdict",
  "Manual review workflow flag (Needs Review)",
  "dmNeedsAssignment / P144 mapP83Action Assign Recruiter override",
  "Published job / operational fit requirement",
  "P145 communication cooldown (Already Contacted)",
  "P145 queue membership requirement",
] as const;

export function detectLegacyPaperworkBlockers(input: {
  row: ScoredCandidateWorkflowRow;
  jobsByPositionId: Map<string, BreezyJob>;
  onboarding: CandidateOnboardingRecord | null;
  auditEvents: PaperworkAutomationAuditEvent[];
  referenceMs: number;
}): { labels: string[]; codes: LegacyPaperworkBlocker[] } {
  const { row, jobsByPositionId, onboarding, auditEvents, referenceMs } = input;
  const labels: string[] = [];
  const codes: LegacyPaperworkBlocker[] = [];

  const advancementOptions = {
    jobsByPositionId,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    requireApproval: true,
  };
  const p83 = buildCandidateAdvancementDecision(row, advancementOptions);
  if (p83.requiresApproval) {
    labels.push("P83 requireApproval=true blocks shouldAdvance.");
    codes.push("p83_require_approval");
  }
  if (row.workflowStatus !== "Paperwork Needed") {
    labels.push(`workflowStatus is ${row.workflowStatus}, not Paperwork Needed.`);
    codes.push("workflow_not_paperwork_needed");
  }
  if ((row.actionType ?? "none") !== "send-paperwork") {
    labels.push(`actionType is ${row.actionType ?? "none"}, not send-paperwork.`);
    codes.push("action_not_send_paperwork");
  }
  if (row.dmNeedsAssignment) {
    labels.push("dmNeedsAssignment=true forces P144 Assign Recruiter.");
    codes.push("dm_needs_assignment");
  }

  const advancement = evaluateCandidate({
    row,
    jobsByPositionId,
    advancementOptions,
    referenceMs,
  });
  if (advancement.confidence < P147_INITIAL_CONFIDENCE_MIN) {
    labels.push(`P144 confidence ${advancement.confidence}% below ${P147_INITIAL_CONFIDENCE_MIN}%.`);
    codes.push("p144_confidence_threshold");
  }
  if (advancement.blockers.includes("Missing Resume")) {
    labels.push("Missing resume (P144 blocker).");
    codes.push("missing_resume");
  }
  if (advancement.blockers.includes("Manual Review Required")) {
    labels.push("Manual review required (workflow flag).");
    codes.push("manual_review_required");
  }
  if (advancement.blockers.includes("Already Contacted")) {
    labels.push("Recent contact cooldown (P144).");
    codes.push("already_contacted_cooldown");
  }

  const review = evaluateApplicantReview(row);
  if (review.verdict === "incomplete") {
    labels.push(`Incomplete profile: ${review.summary}`);
    codes.push("missing_resume");
  }
  if (review.verdict === "needs-review") {
    labels.push(`Needs review: ${review.summary}`);
    codes.push("manual_review_required");
  }

  const publishedJobs = [...jobsByPositionId.values()];
  const operationalFit = findNearestActiveOperationalNeed({
    candidateCity: row.city ?? "",
    candidateState: row.state ?? "",
    publishedJobs,
  });
  const legacyEligibility = buildPaperworkSendEligibility({
    row,
    onboarding,
    jobsByPositionId,
    candidateFirstMode: true,
    publishedJobs,
  });
  if (!legacyEligibility.eligible) {
    const softOnly = legacyEligibility.blockingReasons.filter(
      (r) =>
        !r.includes("email") &&
        !r.includes("duplicate") &&
        !r.includes("signed") &&
        !r.includes("rejected"),
    );
    if (softOnly.length > 0) {
      labels.push(...softOnly);
      if (softOnly.some((r) => r.includes("published") || r.includes("operational"))) {
        codes.push("published_job_required");
      }
      if (!hasOperationalFit(operationalFit)) {
        codes.push("operational_fit");
      }
    }
  }

  const queueItem = evaluatePaperworkCandidate({
    row,
    jobsByPositionId,
    onboarding,
    advancement,
    referenceMs,
  });
  if (!queueItem || queueItem.recommendedAction !== "Send Initial Paperwork") {
    labels.push("Not in P145 queue as Send Initial Paperwork.");
    codes.push("p145_queue_exclusion");
  }

  const p147 = evaluateInitialPaperworkEligibility({
    context: { row, jobsByPositionId, onboarding, advancement, referenceMs },
    advancement,
    auditEvents,
    referenceMs,
    candidateFirstMode: false,
  });
  if (!p147.eligible && p147.validation.reasons.length > 0) {
    for (const reason of p147.validation.reasons) {
      if (!labels.includes(reason)) labels.push(reason);
    }
    if (!codes.includes("other")) codes.push("other");
  }

  return { labels, codes };
}
