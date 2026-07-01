import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { daysSince, evaluateCandidateEligibility } from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import { loadPaperworkCandidates, type LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { buildApprovalPolicy } from "@/lib/autonomous-paperwork-approval-engine/build-approval-policy";
import {
  evaluateApprovalDecision,
} from "@/lib/autonomous-paperwork-approval-engine/evaluate-approval-decision";
import type {
  ApprovalReport,
  ApprovalSummary,
  CandidateApprovalRecord,
} from "@/lib/autonomous-paperwork-approval-engine/types";
import { P124_SOURCE_PHASE } from "@/lib/autonomous-paperwork-approval-engine/types";

function summarizeBlockers(decisions: CandidateApprovalRecord[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const decision of decisions) {
    for (const reason of [...decision.blockingReasons, ...decision.safetyReasons]) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export function buildApprovalSummary(decisions: CandidateApprovalRecord[]): ApprovalSummary {
  const autoApproved = decisions.filter((d) => d.approvalDecision === "AUTO_APPROVED");
  const needsHumanApproval = decisions.filter((d) => d.approvalDecision === "NEEDS_HUMAN_APPROVAL");
  const blocked = decisions.filter((d) => d.approvalDecision === "BLOCKED");
  const waiting = decisions.filter((d) => d.approvalDecision === "WAITING");
  const rejectedForSafety = decisions.filter((d) => d.approvalDecision === "REJECTED_FOR_SAFETY");
  const averageApprovalScore =
    decisions.length === 0
      ? 0
      : Math.round(decisions.reduce((sum, d) => sum + d.approvalScore, 0) / decisions.length);

  return {
    autoApproved: autoApproved.length,
    needsHumanApproval: needsHumanApproval.length,
    blocked: blocked.length,
    waiting: waiting.length,
    rejectedForSafety: rejectedForSafety.length,
    averageApprovalScore,
    topBlockers: summarizeBlockers(decisions),
    highestConfidenceReady: [...autoApproved]
      .sort((a, b) => b.approvalScore - a.approvalScore)
      .slice(0, 5),
  };
}

export function buildApprovalDecisionsFromContext(
  context: LoadedPaperworkCandidates,
): CandidateApprovalRecord[] {
  const policy = buildApprovalPolicy();

  return context.candidateIds.map((candidateId) => {
    const row = context.rowsByCandidateId.get(candidateId) ?? null;
    const approvedMapping = context.approvedMappingsByCandidate.get(candidateId) ?? null;
    const p109Record = context.p109ByCandidate.get(candidateId) ?? null;
    const eligibility = evaluateCandidateEligibility({
      candidateId,
      row,
      context,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      approvedMapping,
    });

    const nativePublishedJob = Boolean(
      row?.positionId && context.jobsByPositionId.has(row.positionId),
    );
    const alreadySent =
      eligibility.status === "ALREADY_SENT" ||
      context.p100SentIds.has(candidateId) ||
      context.pilotSentIds.has(candidateId);
    const duplicateRisk = eligibility.status === "DUPLICATE";

    return evaluateApprovalDecision({
      candidateId,
      candidateName: row
        ? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || candidateId
        : candidateId,
      row,
      eligibilityStatus: eligibility.status,
      templateKey: eligibility.templateKey,
      mappingConfidence: eligibility.mappingConfidence,
      approvedMapping,
      p109Record,
      nativePublishedJob,
      alreadySent,
      duplicateRisk,
      candidateAgeDays: daysSince(row?.createdDate ?? null),
      policy,
    });
  });
}

export async function buildApprovalReport(input?: {
  contextOverride?: LoadedPaperworkCandidates;
}): Promise<ApprovalReport> {
  const context = input?.contextOverride ?? (await loadPaperworkCandidates({ mtdOnly: false }));
  const policy = buildApprovalPolicy();
  const decisions = buildApprovalDecisionsFromContext(context);
  const summary = buildApprovalSummary(decisions);

  const autoApproved = decisions.filter((d) => d.approvalDecision === "AUTO_APPROVED");
  const humanReview = decisions.filter((d) => d.approvalDecision === "NEEDS_HUMAN_APPROVAL");
  const blocked = decisions.filter((d) => d.approvalDecision === "BLOCKED");
  const safetyRejected = decisions.filter((d) => d.approvalDecision === "REJECTED_FOR_SAFETY");
  const blockers = summarizeBlockers(decisions);

  const goNoGo = autoApproved.length > 0 ? "GO" : "NO-GO";
  const goNoGoReason =
    autoApproved.length > 0
      ? `${autoApproved.length} candidate(s) AUTO_APPROVED for orchestrator queue (P122/P123 gates still required).`
      : "No AUTO_APPROVED candidates — autonomous send queue empty.";

  return {
    sourcePhase: P124_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    policy,
    summary,
    decisions,
    autoApproved,
    humanReview,
    blocked,
    safetyRejected,
    topCandidates: summary.highestConfidenceReady,
    blockers,
    goNoGo,
    goNoGoReason,
  };
}
