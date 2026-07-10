import type { P62AssignmentPreviewEntry } from "@/lib/p62-assignment-preview/types";
import type {
  ApprovalExclusionReason,
  ApprovalRiskLevel,
  P62P83ApprovalPreviewMetrics,
  P62P83ApprovalPreviewReport,
  P62P83ApprovalQueueEntry,
  P62P83ExcludedEntry,
  PostApprovalSimulation,
} from "@/lib/p62-p83-approval-preview/types";
import {
  P95_EXCLUDED_CALL_FIRST_CANDIDATE_ID,
  P95_EXCLUDED_CALL_FIRST_CANDIDATE_NAME,
  P95_PREVIEW_MODE,
  P95_SOURCE_PHASE,
} from "@/lib/p62-p83-approval-preview/types";

const EXCLUSION_LABELS: Record<ApprovalExclusionReason, string> = {
  call_first_technology_gap: "Call-first — technology readiness gap",
  p94_simulation_failed: "P94 simulation did not reach P84 eligible",
  not_assignable: "P62 assignment not auto-assignable",
  monitor_only: "Monitor-only — paperwork already in flight",
  closed_job_cohort: "Closed-job cohort (outside published-job scope)",
};

function classifyExclusion(entry: P62AssignmentPreviewEntry): {
  reason: ApprovalExclusionReason;
  detail: string;
} {
  if (entry.candidateId === P95_EXCLUDED_CALL_FIRST_CANDIDATE_ID) {
    return {
      reason: "call_first_technology_gap",
      detail: `P83 call-first — ${entry.downstream.remainingBlocker ?? "technology readiness verification required"}.`,
    };
  }
  if (entry.downstream.p83Action === "call-first") {
    return {
      reason: "call_first_technology_gap",
      detail: entry.downstream.remainingBlocker ?? "Recruiter contact required before advancement.",
    };
  }
  if (entry.outcome === "human_review") {
    return {
      reason: "not_assignable",
      detail: entry.humanReviewReason ?? "Human recruiter review required.",
    };
  }
  return {
    reason: "p94_simulation_failed",
    detail: entry.downstream.remainingBlocker ?? "Downstream simulation did not reach P84 eligible.",
  };
}

function buildPostApprovalSimulation(entry: P62AssignmentPreviewEntry): PostApprovalSimulation {
  return {
    approvalSimulated: true,
    workflowStatus: "Paperwork Needed",
    actionType: "send-paperwork",
    recruiterAssigned: entry.recommendedRecruiter,
    dmAssigned: entry.suggestedDm,
    p84Eligible: true,
    liveSend: false,
    p83Action: entry.downstream.p83Action,
    simulationDetail:
      "Manual P62 approval simulated → P83 advanced to Paperwork Needed → P84 preview eligible (liveSend off).",
  };
}

function isQueueEligible(entry: P62AssignmentPreviewEntry): boolean {
  return (
    entry.outcome === "assignable" &&
    entry.downstream.p84EligibleAfterSimulation &&
    entry.downstream.expectedWorkflowStatus === "Paperwork Needed" &&
    entry.downstream.expectedActionType === "send-paperwork" &&
    !entry.downstream.stillBlockedAfterAssignment
  );
}

function buildQueueEntry(entry: P62AssignmentPreviewEntry): P62P83ApprovalQueueEntry {
  return {
    candidateId: entry.candidateId,
    candidateName: entry.candidateName,
    positionId: entry.positionId,
    jobTitle: entry.jobTitle,
    city: entry.city,
    state: entry.state,
    dmTerritory: entry.dmTerritory,
    suggestedDm: entry.suggestedDm,
    assignedRecruiter: entry.recommendedRecruiter,
    confidence: entry.confidence,
    approvalStatus: "pending",
    riskLevel: entry.riskLevel as ApprovalRiskLevel,
    safeToApprove: true,
    assignmentReason: entry.assignmentReason,
    postApprovalSimulation: buildPostApprovalSimulation(entry),
    manualApprovalRequired: true,
    autoApproveBlocked: true,
  };
}

function buildExcludedEntry(entry: P62AssignmentPreviewEntry): P62P83ExcludedEntry {
  const { reason, detail } = classifyExclusion(entry);
  return {
    candidateId: entry.candidateId,
    candidateName: entry.candidateName,
    exclusionReason: reason,
    exclusionLabel: EXCLUSION_LABELS[reason],
    detail,
  };
}

function buildMetrics(
  queue: P62P83ApprovalQueueEntry[],
  excluded: P62P83ExcludedEntry[],
): P62P83ApprovalPreviewMetrics {
  return {
    approvalQueueCount: queue.length,
    safeToApprove: queue.filter((e) => e.safeToApprove).length,
    excludedCallFirst: excluded.filter((e) => e.exclusionReason === "call_first_technology_gap").length,
    expectedPaperworkNeeded: queue.length,
    expectedP84Eligible: queue.length,
    liveSendsBlocked: queue.length,
    excludedTotal: excluded.length,
  };
}

export function buildP62P83ApprovalPreview(input: {
  p94Entries: P62AssignmentPreviewEntry[];
  mtdRangeLabel?: string;
  generatedAt?: string;
}): P62P83ApprovalPreviewReport {
  const approvalQueue: P62P83ApprovalQueueEntry[] = [];
  const excluded: P62P83ExcludedEntry[] = [];

  for (const entry of input.p94Entries) {
    if (isQueueEligible(entry)) {
      approvalQueue.push(buildQueueEntry(entry));
    } else {
      excluded.push(buildExcludedEntry(entry));
    }
  }

  const metrics = buildMetrics(approvalQueue, excluded);

  return {
    sourcePhase: P95_SOURCE_PHASE,
    previewMode: P95_PREVIEW_MODE,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mtdRangeLabel: input.mtdRangeLabel ?? "MTD",
    sectionTitle: "P62/P83 Approval Preview",
    cohortLabel: "P94 candidates with successful P62+P83+P84 simulation on published jobs",
    metrics,
    approvalQueue,
    excluded,
    sampleApprovalTraces: approvalQueue.slice(0, 5),
    remainingBlockersBeforeLivePaperwork: [
      "P95 is preview-only — no workflow persistence and no live P84 sends",
      `${metrics.approvalQueueCount} candidate(s) in manual P62 approval queue`,
      `${metrics.excludedCallFirst} candidate(s) excluded for call-first technology gap (${P95_EXCLUDED_CALL_FIRST_CANDIDATE_NAME})`,
      "Executive must approve each P62 assignment before any persistence",
      "After approved persistence: run P83 advancement, then P84 preview recheck",
      "14 closed Breezy jobs still need reactivation for remaining unlock cohort",
      "P84 liveSend must remain disabled until executive sign-off",
    ],
  };
}

export async function buildP62P83ApprovalPreviewFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<P62P83ApprovalPreviewReport> {
  const { buildP62AssignmentPreviewFromStores } = await import("@/lib/p62-assignment-preview");
  const p94 = await buildP62AssignmentPreviewFromStores(input);
  return buildP62P83ApprovalPreview({
    p94Entries: p94.entries,
    mtdRangeLabel: p94.mtdRangeLabel,
  });
}
