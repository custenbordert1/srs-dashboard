import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import { detectLegacyPaperworkBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-legacy-paperwork-blockers";
import type { P157DecisionContext } from "@/lib/p157-recruiter-decision-engine/types";
import type { P1582BlockerCode } from "@/lib/p158-post-assignment-outcome-diagnosis/types";
import { evaluateCandidate } from "@/lib/recruiting/candidate-advancement-engine";
import { P147_INITIAL_CONFIDENCE_MIN } from "@/lib/recruiting/initial-paperwork-execution-engine";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";

function isPositionClosed(ctx: P157DecisionContext): boolean {
  if (!ctx.jobStatus) return false;
  const status = ctx.jobStatus.toLowerCase();
  return status !== "published" && status !== "open" && status !== "active";
}

function hasRecentRecruiterContact(row: ScoredCandidateWorkflowRow, referenceMs: number): boolean {
  if (!row.lastActionAt) return false;
  const daysSince = (referenceMs - new Date(row.lastActionAt).getTime()) / (24 * 60 * 60 * 1000);
  return daysSince <= 3;
}

function paperworkStageAllowsSend(
  paperworkStage: ReturnType<typeof classifyPaperworkStage>,
  row: ScoredCandidateWorkflowRow,
): boolean {
  return (
    row.workflowStatus === "Paperwork Needed" ||
    paperworkStage === "awaitingRecruiterAction" ||
    paperworkStage === "approvalQueue"
  );
}

export function diagnosePrimaryBlocker(input: {
  row: ScoredCandidateWorkflowRow;
  candidate: BreezyCandidate;
  ctx: P157DecisionContext;
  paperworkStage: ReturnType<typeof classifyPaperworkStage>;
  onboarding: CandidateOnboardingRecord | null;
  auditEvents: PaperworkAutomationAuditEvent[];
  jobsByPositionId: Map<string, BreezyJob>;
  referenceMs: number;
  decisionConfidence: number;
}): { code: P1582BlockerCode; reason: string; allBlockers: string[] } {
  const { row, candidate, ctx, paperworkStage, onboarding, auditEvents, jobsByPositionId, referenceMs, decisionConfidence } =
    input;
  const allBlockers: string[] = [];

  if (ctx.isDuplicate) {
    return {
      code: "duplicate",
      reason: ctx.duplicateReason ?? "Duplicate candidate detected.",
      allBlockers: [ctx.duplicateReason ?? "Duplicate candidate"],
    };
  }

  if (isPositionClosed(ctx)) {
    return {
      code: "project_closed",
      reason: `Position status: ${ctx.jobStatus ?? "closed"}.`,
      allBlockers: [`Position closed (${ctx.jobStatus})`],
    };
  }

  const hard = detectImmediatePaperworkHardBlockers({
    row,
    candidate,
    onboarding,
    auditEvents,
  });
  if (hard.primaryHardBlocker === "invalid_email") {
    return { code: "invalid_email", reason: hard.blockers[0] ?? "Invalid or missing email.", allBlockers: hard.blockers };
  }
  if (hard.primaryHardBlocker === "active_signature_request") {
    return {
      code: "active_signature_request",
      reason: hard.blockers[0] ?? "Active signature request exists.",
      allBlockers: hard.blockers,
    };
  }
  if (
    hard.primaryHardBlocker === "paperwork_already_sent" ||
    hard.primaryHardBlocker === "paperwork_already_completed"
  ) {
    return { code: "already_sent", reason: hard.blockers[0] ?? "Paperwork already sent.", allBlockers: hard.blockers };
  }

  const legacy = detectLegacyPaperworkBlockers({
    row,
    jobsByPositionId,
    onboarding,
    auditEvents,
    referenceMs,
  });
  allBlockers.push(...legacy.labels);

  if (!paperworkStageAllowsSend(paperworkStage, row) && !hard.blocked) {
    const stageDetail =
      row.workflowStatus !== "Paperwork Needed"
        ? `workflowStatus is "${row.workflowStatus}" (requires "Paperwork Needed")`
        : `paperwork stage is "${paperworkStage ?? "none"}" (requires awaitingRecruiterAction)`;
    return {
      code: "workflow_state_issue",
      reason: `P157 Send Paperwork gate blocked: ${stageDetail}.`,
      allBlockers: [...allBlockers, stageDetail],
    };
  }

  if (hasRecentRecruiterContact(row, referenceMs)) {
    return {
      code: "already_contacted_cooldown",
      reason: "Recent recruiter contact within 3-day cooldown window.",
      allBlockers,
    };
  }

  if (!row.hasResume || legacy.codes.includes("missing_resume")) {
    const review = evaluateApplicantReview(row);
    return {
      code: "missing_resume",
      reason: review.missingItems.find((i) => /resume/i.test(i)) ?? "Resume not uploaded.",
      allBlockers,
    };
  }

  if (!ctx.questionnaireComplete || ctx.questionnaireTechReady === false) {
    return {
      code: "missing_questionnaire",
      reason: !ctx.questionnaireComplete
        ? "Questionnaire not completed."
        : "Technology readiness unverified on questionnaire.",
      allBlockers,
    };
  }

  if (legacy.codes.includes("operational_fit") || legacy.codes.includes("published_job_required")) {
    return {
      code: "operational_fit_mismatch",
      reason: legacy.labels.find((l) => /operational|published job|fit/i.test(l)) ?? "No operational fit for active project.",
      allBlockers,
    };
  }

  const advancement = evaluateCandidate({
    row,
    jobsByPositionId,
    advancementOptions: {
      jobsByPositionId,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      requireApproval: true,
    },
    referenceMs,
  });
  if (advancement.confidence < P147_INITIAL_CONFIDENCE_MIN || decisionConfidence < P147_INITIAL_CONFIDENCE_MIN) {
    return {
      code: "low_confidence",
      reason: `Advancement confidence ${advancement.confidence}% below ${P147_INITIAL_CONFIDENCE_MIN}% threshold.`,
      allBlockers: [...allBlockers, ...advancement.blockers],
    };
  }

  if (ctx.paperworkBlockers.length > 0 && !ctx.paperworkEligible) {
    return {
      code: "other",
      reason: ctx.paperworkBlockers[0] ?? "Paperwork hard blockers remain.",
      allBlockers: [...allBlockers, ...ctx.paperworkBlockers],
    };
  }

  if (ctx.missingDocuments.length > 0) {
    return {
      code: "other",
      reason: ctx.missingDocuments[0] ?? "Missing documents.",
      allBlockers: [...allBlockers, ...ctx.missingDocuments],
    };
  }

  if (ctx.applicantVerdict === "incomplete" || ctx.applicantVerdict === "needs-review") {
    return {
      code: "other",
      reason: `Applicant review verdict: ${ctx.applicantVerdict}.`,
      allBlockers,
    };
  }

  return {
    code: "other",
    reason: "No Send Paperwork blockers detected — candidate may be paperwork-ready.",
    allBlockers,
  };
}
