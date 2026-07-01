import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import { findP109ReviewRecord, loadP109ReviewRecords } from "@/lib/p109-project-mapping-review/review-decision-store";
import {
  buildBulkMappingReviewToolsReport,
  loadBulkReviewDryRunContext,
} from "@/lib/p111-bulk-mapping-review/build-bulk-review-report";
import { checkCandidateBulkApproveSafety } from "@/lib/p111-bulk-mapping-review/bulk-safety-rules";
import { simulateBulkGroupApprovalImpact } from "@/lib/p112-bulk-approval-impact-validation/simulate-bulk-group-impact";
import {
  buildWhatWouldMakeItSafe,
  collectMissingConfidenceFactors,
  explainWhyNotSafe,
  previewGroupRecovery,
  proposeGroupSplits,
  recommendReviewFirstAction,
  summarizePrimaryRiskFromFactors,
} from "@/lib/p115-review-first-risk-breakdown/analyze-review-first-group";
import type {
  ReviewFirstGroupBreakdown,
  ReviewFirstRiskBreakdownReport,
} from "@/lib/p115-review-first-risk-breakdown/types";
import { P115_DEFAULT_MODE, P115_SOURCE_PHASE } from "@/lib/p115-review-first-risk-breakdown/types";

function buildBulkApprovalGoNoGo(input: {
  reviewFirstGroups: ReviewFirstGroupBreakdown[];
  safestNextGroup: ReviewFirstRiskBreakdownReport["safestNextGroup"];
}): { goNoGo: "GO" | "NO-GO"; reason: string } {
  if (input.reviewFirstGroups.length === 0) {
    return {
      goNoGo: "GO",
      reason: "No remaining REVIEW FIRST bulk groups — bulk approval risk review cleared.",
    };
  }

  if (input.safestNextGroup) {
    return {
      goNoGo: "NO-GO",
      reason: `${input.reviewFirstGroups.length} REVIEW FIRST group(s) remain. Bulk approval is NO-GO; safest path is ${input.safestNextGroup.action} for ${input.safestNextGroup.groupName}.`,
    };
  }

  return {
    goNoGo: "NO-GO",
    reason: `${input.reviewFirstGroups.length} REVIEW FIRST group(s) remain with no SAFE bulk path — recruiter review required before bulk approval.`,
  };
}

function pickSafestNextGroup(
  groups: ReviewFirstGroupBreakdown[],
): ReviewFirstRiskBreakdownReport["safestNextGroup"] {
  const candidates: Array<{
    group: ReviewFirstGroupBreakdown;
    split: ReviewFirstGroupBreakdown["splitRecommendations"][number] | null;
    score: number;
  }> = [];

  for (const group of groups) {
    const safeSplit = group.splitRecommendations.find((split) => split.wouldBecomeSafe);
    if (safeSplit) {
      candidates.push({
        group,
        split: safeSplit,
        score: safeSplit.averageConfidence * 100 + safeSplit.candidateCount,
      });
      continue;
    }

    if (group.recommendedAction === "approve_individually" && group.averageConfidence >= 70) {
      candidates.push({
        group,
        split: null,
        score: group.averageConfidence * 10 + group.candidateCount,
      });
    }
  }

  const best = candidates.sort((left, right) => right.score - left.score)[0];
  if (!best) return null;

  return {
    groupId: best.group.groupId,
    groupName: best.group.groupName,
    action: best.split ? "split_group" : best.group.recommendedAction,
    splitBy: best.split?.splitBy ?? null,
    candidateCount: best.split?.candidateCount ?? best.group.candidateCount,
    averageConfidence: best.split?.averageConfidence ?? best.group.averageConfidence,
    reason: best.split
      ? best.split.reason
      : best.group.recommendedActionReason,
  };
}

export async function buildReviewFirstRiskBreakdownReport(): Promise<ReviewFirstRiskBreakdownReport> {
  const warnings = [
    "P115 — analysis only; no approvals persisted.",
    "P115 — no paperwork sends.",
    "P115 — no Breezy writes.",
    "P115 — P106.3 live runner unchanged.",
    `Mode: ${P115_DEFAULT_MODE}.`,
  ];

  const [p111Report, dryRunContext, existingRecords] = await Promise.all([
    buildBulkMappingReviewToolsReport(),
    loadBulkReviewDryRunContext(),
    loadP109ReviewRecords(),
  ]);

  const safetyByCandidate = new Map<
    string,
    { passesBulkApprove: boolean; blockers: string[]; baselineBlocker: string }
  >();

  for (const item of p111Report.groups.flatMap((group) => group.members)) {
    const row = dryRunContext.rowsByCandidateId.get(item.candidateId);
    const baseline = row
      ? classifyPaperworkBlocker({
          row,
          onboarding: dryRunContext.onboardingByCandidate.get(item.candidateId) ?? null,
          jobsByPositionId: dryRunContext.jobsByPositionId,
          closedJobsByPositionId: dryRunContext.closedJobsByPositionId,
          publishedJobs: dryRunContext.publishedJobs,
          paperworkByGrade: dryRunContext.paperworkByGrade,
          p100SentIds: dryRunContext.p100SentIds,
        }).category
      : "missing_candidate_match";
    safetyByCandidate.set(
      item.candidateId,
      checkCandidateBulkApproveSafety({ item, baselineBlocker: baseline }),
    );
  }

  const bulkApprovableGroups = p111Report.groups.filter((group) => group.bulkApprovable);
  const reviewFirstGroups: ReviewFirstGroupBreakdown[] = [];

  for (const group of bulkApprovableGroups) {
    const pendingMembers = group.members.filter((member) => {
      const prior = findP109ReviewRecord(existingRecords, member.candidateId);
      return prior?.decision !== "approved";
    });
    if (pendingMembers.length === 0) continue;

    const pendingGroup = {
      ...group,
      members: pendingMembers,
      candidateIds: pendingMembers.map((member) => member.candidateId),
      candidateCount: pendingMembers.length,
      averageConfidence: Math.round(
        pendingMembers.reduce((sum, member) => sum + member.confidenceScore, 0) / pendingMembers.length,
      ),
      minConfidence: Math.min(...pendingMembers.map((member) => member.confidenceScore)),
    };

    const simulation = simulateBulkGroupApprovalImpact({
      group: pendingGroup,
      dryRunContext,
      totalPendingBefore: p111Report.metrics.totalPendingCandidates,
    });

    if (simulation.safeToApprove !== "REVIEW FIRST") continue;

    const missingConfidenceFactors = collectMissingConfidenceFactors(pendingMembers);
    const { riskNotes, remainingBlocked } = previewGroupRecovery({
      group: pendingGroup,
      dryRunContext,
      totalPendingBefore: p111Report.metrics.totalPendingCandidates,
    });

    const explained = explainWhyNotSafe({ group: pendingGroup, riskNotes });
    const factorRisk = summarizePrimaryRiskFromFactors(missingConfidenceFactors);
    const splitRecommendations = proposeGroupSplits({
      group: pendingGroup,
      dryRunContext,
      totalPendingBefore: p111Report.metrics.totalPendingCandidates,
      safetyByCandidate,
    });
    const { action, reason } = recommendReviewFirstAction({
      group: pendingGroup,
      simulation,
      missingFactors: missingConfidenceFactors,
      splitRecommendations,
    });

    reviewFirstGroups.push({
      groupId: pendingGroup.groupId,
      groupName: simulation.groupName,
      closedPositionTitle: pendingGroup.closedPositionTitle,
      candidateCount: pendingGroup.candidateCount,
      averageConfidence: pendingGroup.averageConfidence,
      minConfidence: pendingGroup.minConfidence,
      confidenceBand: pendingGroup.confidenceBand,
      recommendedActivePosition: {
        positionId: pendingGroup.recommendedPositionId,
        title: pendingGroup.recommendedPositionTitle,
        city: pendingGroup.city,
        state: pendingGroup.state,
      },
      missingConfidenceFactors,
      riskReason: factorRisk ?? explained.primaryRiskReason,
      riskNotes,
      whyNotSafe: explained.whyNotSafe,
      whatWouldMakeItSafe: buildWhatWouldMakeItSafe({
        group: pendingGroup,
        missingFactors: missingConfidenceFactors,
        riskNotes,
        remainingBlocked,
      }),
      recommendedAction: action,
      recommendedActionReason: reason,
      splitRecommendations,
      candidateIds: pendingGroup.candidateIds,
    });
  }

  reviewFirstGroups.sort(
    (left, right) => right.candidateCount - left.candidateCount || right.averageConfidence - left.averageConfidence,
  );

  const safestNextGroup = pickSafestNextGroup(reviewFirstGroups);
  const { goNoGo, reason: goNoGoReason } = buildBulkApprovalGoNoGo({
    reviewFirstGroups,
    safestNextGroup,
  });

  const splitRecommendationsCount = reviewFirstGroups.reduce(
    (sum, group) => sum + group.splitRecommendations.length,
    0,
  );
  const splittableSafeSubgroups = reviewFirstGroups.reduce(
    (sum, group) => sum + group.splitRecommendations.filter((split) => split.wouldBecomeSafe).length,
    0,
  );

  const metrics = {
    remainingReviewFirstGroups: reviewFirstGroups.length,
    candidatesAffected: reviewFirstGroups.reduce((sum, group) => sum + group.candidateCount, 0),
    splitRecommendationsCount,
    splittableSafeSubgroups,
    approveIndividuallyCount: reviewFirstGroups.filter((group) => group.recommendedAction === "approve_individually")
      .length,
    splitGroupCount: reviewFirstGroups.filter((group) => group.recommendedAction === "split_group").length,
    requestRecruiterReviewCount: reviewFirstGroups.filter(
      (group) => group.recommendedAction === "request_recruiter_review",
    ).length,
    rejectGroupCount: reviewFirstGroups.filter((group) => group.recommendedAction === "reject_group").length,
  };

  const summary = [
    `${metrics.remainingReviewFirstGroups} REVIEW FIRST group(s), ${metrics.candidatesAffected} candidate(s).`,
    `${metrics.splittableSafeSubgroups} splittable SAFE subgroup(s) identified.`,
    safestNextGroup
      ? `Safest next path: ${safestNextGroup.action} for ${safestNextGroup.groupName}.`
      : "No SAFE bulk path without recruiter review.",
    `Bulk approval ${goNoGo}: ${goNoGoReason}`,
  ].join(" ");

  return {
    sourcePhase: P115_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P115_DEFAULT_MODE,
    summary,
    bulkApprovalGoNoGo: goNoGo,
    bulkApprovalGoNoGoReason: goNoGoReason,
    metrics,
    safestNextGroup,
    groups: reviewFirstGroups,
    safetyStatus: {
      analysisOnly: true,
      noApprovalsPersisted: true,
      noBreezyWrites: true,
      noLiveSends: true,
      noLiveMode: process.env.AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE == null,
      p1063RunnerUnchanged: true,
      liveRunnerUnwired: true,
    },
    warnings: [...warnings, ...p111Report.warnings],
  };
}
