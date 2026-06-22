import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { getSendPaperworkBlockReason } from "@/lib/onboarding-send-eligibility";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import type { NextStepRecommendation } from "@/lib/hiring-automation-engine/types";
import { isPaperworkPendingStatus } from "@/lib/candidate-action-sla";

const DEFAULT_TEMPLATES = [
  { key: "onboarding_packet" as const, label: "Onboarding packet", configured: true },
];

function hasContributor(row: ScoredCandidateWorkflowRow, fragment: string): boolean {
  return row.candidateGrade.gradeContributors.some((item) =>
    item.label.toLowerCase().includes(fragment.toLowerCase()),
  );
}

export function recommendNextStep(
  row: ScoredCandidateWorkflowRow,
  options?: { onboardingConfigured?: boolean },
): NextStepRecommendation {
  const review = evaluateApplicantReview(row);
  const dataUsed = [
    `Grade ${review.grade}`,
    `${review.confidence} confidence`,
    row.workflowStatus,
  ];

  if (review.verdict === "disqualified") {
    return {
      action: "none",
      reason: "Low fit or disqualified — no automation per safety rules.",
      dataUsed,
      expectedOutcome: "Recruiter handles manually if needed.",
      requiresApproval: false,
      undoPath: "N/A — no action taken.",
    };
  }

  if (row.workflowStatus === "Ready for MEL" || row.workflowStatus === "Active Rep" || row.workflowStatus === "Loaded in MEL") {
    return {
      action: "none",
      reason: "Candidate already Ready for MEL or hired.",
      dataUsed,
      expectedOutcome: "No further automation needed.",
      requiresApproval: false,
      undoPath: "N/A",
    };
  }

  if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") {
    return {
      action: "mark-ready-for-mel",
      reason: "Paperwork signed — advance to Ready for MEL.",
      dataUsed: [...dataUsed, "paperworkStatus: signed"],
      expectedOutcome: "Candidate moves to Ready for MEL with ops handoff task.",
      requiresApproval: true,
      undoPath: "Revert workflow status to Signed in Candidate Workspace.",
    };
  }

  if (isPaperworkPendingStatus(row.workflowStatus) || row.paperworkStatus === "sent" || row.paperworkStatus === "viewed") {
    return {
      action: "follow-up-paperwork",
      reason: "Paperwork outstanding — follow up required.",
      dataUsed: [...dataUsed, `paperworkStatus: ${row.paperworkStatus}`],
      expectedOutcome: "Recruiter contacts candidate to complete paperwork.",
      requiresApproval: false,
      undoPath: "Mark follow-up complete in workspace.",
    };
  }

  if (row.questionnaireIntelligence.techReady === false || hasContributor(row, "Transportation not confirmed")) {
    const gaps = [
      row.questionnaireIntelligence.techReady === false ? "technology" : null,
      hasContributor(row, "Transportation not confirmed") ? "transportation" : null,
    ].filter(Boolean);
    return {
      action: "escalate-recruiter-task",
      reason: `Verification needed: ${gaps.join(" and ")}.`,
      dataUsed: [...dataUsed, ...gaps.map((g) => `missing: ${g}`)],
      expectedOutcome: "Recruiter verifies before advancing.",
      requiresApproval: false,
      undoPath: "Complete verification in workspace and re-run automation.",
    };
  }

  if (review.confidence === "low") {
    return {
      action: "escalate-recruiter-task",
      reason: "Low confidence grade — recruiter review required before paperwork.",
      dataUsed: [...dataUsed, "confidence: low"],
      expectedOutcome: "Recruiter validates profile before send.",
      requiresApproval: false,
      undoPath: "Recruiter completes review; automation can be re-planned.",
    };
  }

  if (
    (review.grade === "A" || review.grade === "B") &&
    (review.confidence === "high" || review.confidence === "medium")
  ) {
    const blockReason = getSendPaperworkBlockReason({
      candidate: row,
      templateKey: "onboarding_packet",
      onboardingConfigured: options?.onboardingConfigured ?? true,
      onboardingConfigLoaded: true,
      onboardingConfigError: null,
      paperworkTemplates: DEFAULT_TEMPLATES,
      sendBusy: false,
    });

    if (blockReason === "pending_signature" || blockReason === "already_signed") {
      return {
        action: "none",
        reason: "Paperwork already sent or signed — no duplicate send.",
        dataUsed: [...dataUsed, `block: ${blockReason}`],
        expectedOutcome: "Await signature or refresh status.",
        requiresApproval: false,
        undoPath: "Use Refresh paperwork status in workspace.",
      };
    }

    if (blockReason) {
      return {
        action: "escalate-recruiter-task",
        reason: `Paperwork blocked: ${blockReason}.`,
        dataUsed: [...dataUsed, `block: ${blockReason}`],
        expectedOutcome: "Recruiter resolves blocker before send.",
        requiresApproval: false,
        undoPath: "Fix blocker and re-plan automation.",
      };
    }

    return {
      action: "send-paperwork",
      reason: `Grade ${review.grade} with ${review.confidence} confidence — eligible for paperwork.`,
      dataUsed: [...dataUsed, ...review.strengths.slice(0, 2)],
      expectedOutcome: "Onboarding packet sent via Dropbox Sign; timestamp recorded.",
      requiresApproval: true,
      undoPath: "Cannot unsend packet — contact candidate if sent in error.",
    };
  }

  return {
    action: "escalate-recruiter-task",
    reason: review.summary,
    dataUsed,
    expectedOutcome: "Recruiter reviews and advances manually.",
    requiresApproval: false,
    undoPath: "Complete recruiter review in workspace.",
  };
}
