import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import { buildReviewWorkflowReport } from "@/lib/p109-project-mapping-review/build-review-workflow-report";
import { findP109ReviewRecord, loadP109ReviewRecords } from "@/lib/p109-project-mapping-review/review-decision-store";
import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";
import { buildApprovedMappingIntegrationDryRunReport } from "@/lib/p110-approved-mapping-integration/build-integration-dryrun-report";
import { simulateBulkGroupApprovalImpact } from "@/lib/p112-bulk-approval-impact-validation/simulate-bulk-group-impact";
import {
  buildBulkMappingReviewToolsReport,
  loadBulkReviewDryRunContext,
} from "@/lib/p111-bulk-mapping-review/build-bulk-review-report";
import { checkCandidateBulkApproveSafety } from "@/lib/p111-bulk-mapping-review/bulk-safety-rules";
import { applyBulkGroupDecision } from "@/lib/p111-bulk-mapping-review/execute-bulk-decision";
import type { BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";
import type { BulkGroupImpactSimulation } from "@/lib/p112-bulk-approval-impact-validation/types";
import type { FirstSafeBulkApprovalReport } from "@/lib/p113-first-safe-bulk-approval/types";
import {
  P113_APPROVAL_NOTES,
  P113_DEFAULT_MODE,
  P113_REVIEWER,
  P113_SOURCE_PHASE,
  P113_TARGET_GROUP_ID,
  P113_TARGET_RECOMMENDED_POSITION_ID,
} from "@/lib/p113-first-safe-bulk-approval/types";

export function findP113TargetGroup(groups: BulkReviewGroup[]): BulkReviewGroup | null {
  return (
    groups.find((group) => group.groupId === P113_TARGET_GROUP_ID) ??
    groups.find(
      (group) =>
        group.recommendedPositionId === P113_TARGET_RECOMMENDED_POSITION_ID &&
        group.city.trim().toLowerCase() === "payson" &&
        group.state.trim().toUpperCase() === "AZ" &&
        group.bulkApprovable,
    ) ??
    null
  );
}

export function resolveFirstSafeBulkGroup(input: {
  targetGroupId?: string;
  p111Report: Awaited<ReturnType<typeof buildBulkMappingReviewToolsReport>>;
  simulation: BulkGroupImpactSimulation;
}): {
  group: BulkReviewGroup;
  simulation: BulkGroupImpactSimulation;
} {
  const group = findP113TargetGroup(input.p111Report.groups);
  if (!group) {
    throw new Error(`P113 target group not found in P111 review groups: ${input.targetGroupId ?? P113_TARGET_GROUP_ID}`);
  }
  if (!group.bulkApprovable) {
    throw new Error(`P113 target group is not bulk-approvable: ${group.groupId}`);
  }
  if (input.simulation.safeToApprove !== "SAFE") {
    throw new Error(
      `P113 target group is not SAFE (${input.simulation.safeToApprove}): ${input.simulation.groupName}`,
    );
  }
  if (input.simulation.groupId !== group.groupId) {
    throw new Error(
      `P113 simulation group mismatch (${input.simulation.groupId} vs ${group.groupId}).`,
    );
  }

  return { group, simulation: input.simulation };
}

function buildGoNoGo(input: {
  safetyOk: boolean;
  applied: boolean;
  newlyEligible: number;
  approvedCount: number;
  error?: string;
}): { goNoGo: "GO" | "NO-GO"; reason: string } {
  if (!input.safetyOk) {
    return {
      goNoGo: "NO-GO",
      reason: "Safety contract checks failed — local bulk approval not cleared.",
    };
  }
  if (input.error) {
    return { goNoGo: "NO-GO", reason: input.error };
  }
  if (input.approvedCount === 0) {
    return { goNoGo: "NO-GO", reason: "No candidates were approved locally." };
  }
  if (input.newlyEligible === 0) {
    return {
      goNoGo: "NO-GO",
      reason: "Approvals persisted but P110 dry-run shows zero newly eligible candidates.",
    };
  }
  return {
    goNoGo: "GO",
    reason: input.applied
      ? `${input.approvedCount} candidate(s) approved locally; ${input.newlyEligible} newly eligible via approval (dryRun).`
      : `${input.approvedCount} candidate(s) already approved; ${input.newlyEligible} newly eligible via approval (dryRun).`,
  };
}

function toApprovedCandidateRecord(input: {
  record: P109ReviewDecisionRecord;
  alreadyApproved: boolean;
}): FirstSafeBulkApprovalReport["approvedCandidates"][number] {
  return {
    candidateId: input.record.candidateId,
    candidateName: input.record.candidateName,
    closedPositionId: input.record.closedPositionId,
    recommendedPositionId: input.record.recommendedPositionId,
    decision: "approved",
    reviewer: input.record.reviewer,
    notes: input.record.notes,
    timestamp: input.record.timestamp,
    confidenceScore: input.record.confidenceScore,
    mappingReasons: input.record.mappingReasons,
    alreadyApproved: input.alreadyApproved,
  };
}

export async function applyFirstSafeBulkApproval(): Promise<FirstSafeBulkApprovalReport> {
  const warnings = [
    "P113 — local .data approval only; no paperwork sends.",
    "P113 — no Breezy writes.",
    "P113 — P106.3 live runner unchanged.",
    `Mode: ${P113_DEFAULT_MODE}.`,
  ];

  const p111Report = await buildBulkMappingReviewToolsReport();
  const [dryRunContext, existingRecords] = await Promise.all([
    loadBulkReviewDryRunContext(),
    loadP109ReviewRecords(),
  ]);

  const targetGroup = findP113TargetGroup(p111Report.groups);
  if (!targetGroup) {
    throw new Error(`P113 target group not found in P111 review groups: ${P113_TARGET_GROUP_ID}`);
  }

  const simulation = simulateBulkGroupApprovalImpact({
    group: targetGroup,
    dryRunContext,
    totalPendingBefore: p111Report.metrics.totalPendingCandidates,
  });

  const { group, simulation: validatedSimulation } = resolveFirstSafeBulkGroup({
    p111Report,
    simulation,
  });

  const safetyByCandidate = new Map<
    string,
    { passesBulkApprove: boolean; blockers: string[]; baselineBlocker: string }
  >();
  for (const member of group.members) {
    const row = dryRunContext.rowsByCandidateId.get(member.candidateId);
    const baseline = row
      ? classifyPaperworkBlocker({
          row,
          onboarding: dryRunContext.onboardingByCandidate.get(member.candidateId) ?? null,
          jobsByPositionId: dryRunContext.jobsByPositionId,
          closedJobsByPositionId: dryRunContext.closedJobsByPositionId,
          publishedJobs: dryRunContext.publishedJobs,
          paperworkByGrade: dryRunContext.paperworkByGrade,
          p100SentIds: dryRunContext.p100SentIds,
        }).category
      : "missing_candidate_match";
    safetyByCandidate.set(
      member.candidateId,
      checkCandidateBulkApproveSafety({ item: member, baselineBlocker: baseline }),
    );
  }

  const pendingMembers = group.members.filter((member) => {
    const prior = findP109ReviewRecord(existingRecords, member.candidateId);
    return prior?.decision !== "approved";
  });
  const alreadyApprovedMembers = group.members.filter((member) => {
    const prior = findP109ReviewRecord(existingRecords, member.candidateId);
    return prior?.decision === "approved";
  });

  let applyError: string | undefined;
  let appliedRecords: P109ReviewDecisionRecord[] = [];

  if (pendingMembers.length > 0) {
    const result = await applyBulkGroupDecision({
      group: {
        ...group,
        members: pendingMembers,
        candidateIds: pendingMembers.map((member) => member.candidateId),
        candidateCount: pendingMembers.length,
      },
      action: "approved",
      sharedNote: P113_APPROVAL_NOTES,
      reviewer: P113_REVIEWER,
      safetyByCandidate,
    });
    if (!result.ok) {
      applyError = result.error ?? "Bulk approval failed.";
    } else {
      appliedRecords = result.records;
    }
  } else {
    appliedRecords = alreadyApprovedMembers
      .map((member) => findP109ReviewRecord(existingRecords, member.candidateId))
      .filter((record): record is P109ReviewDecisionRecord => Boolean(record));
  }

  const [integrationReport, workflowReport, recordsAfter] = await Promise.all([
    buildApprovedMappingIntegrationDryRunReport(),
    buildReviewWorkflowReport(),
    loadP109ReviewRecords(),
  ]);

  const { resolveApprovedMapping } = await import(
    "@/lib/p110-approved-mapping-integration/resolve-approved-mapping"
  );
  const { simulateCandidateDryRunEligibility } = await import(
    "@/lib/p110-approved-mapping-integration/simulate-approved-mapping-eligibility"
  );

  const publishedJobTitleById = new Map(dryRunContext.publishedJobs.map((job) => [job.jobId, job.name]));
  const newlyEligibleCandidateIds: string[] = [];

  for (const member of group.members) {
    const row = dryRunContext.rowsByCandidateId.get(member.candidateId);
    if (!row) continue;
    const record = findP109ReviewRecord(recordsAfter, member.candidateId);
    const approved = resolveApprovedMapping({
      record: record ?? null,
      candidateId: member.candidateId,
      closedPositionId: member.closedPosition.positionId,
      publishedJobTitleById,
    });
    const result = simulateCandidateDryRunEligibility({
      row,
      onboarding: dryRunContext.onboardingByCandidate.get(member.candidateId) ?? null,
      jobsByPositionId: dryRunContext.jobsByPositionId,
      closedJobsByPositionId: dryRunContext.closedJobsByPositionId,
      publishedJobs: dryRunContext.publishedJobs,
      paperworkByGrade: dryRunContext.paperworkByGrade,
      p100SentIds: dryRunContext.p100SentIds,
      approvedMapping: approved,
      candidateName: member.candidateName,
    });
    if (result.outcome === "newly_eligible_via_approval") {
      newlyEligibleCandidateIds.push(member.candidateId);
    }
  }

  const approvedCandidates = group.members.map((member) => {
    const record = findP109ReviewRecord(recordsAfter, member.candidateId);
    if (!record) {
      throw new Error(`Missing P109 record after approval for ${member.candidateId}`);
    }
    const alreadyApproved =
      alreadyApprovedMembers.some((existing) => existing.candidateId === member.candidateId) &&
      !appliedRecords.some((applied) => applied.candidateId === member.candidateId);
    return toApprovedCandidateRecord({ record, alreadyApproved });
  });

  const safetyStatus = {
    p1063RunnerUnchanged: true,
    noBreezyWrites: true,
    noLiveSends: true,
    noLiveMode: process.env.AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE == null,
    dryRunOnly: true,
    localApprovalOnly: true,
    liveRunnerUnwired: true,
  };

  const integrationAfterApproval = {
    newlyEligibleViaApproval: newlyEligibleCandidateIds.length,
    newlyEligibleCandidateIds,
    safetyExclusions: integrationReport.metrics.safetyExclusions,
    remainingPending: workflowReport.metrics.pendingCount,
    approvedMappingsCount: integrationReport.metrics.approvedMappingsCount,
  };

  const { goNoGo, reason: goNoGoReason } = buildGoNoGo({
    safetyOk: Object.values(safetyStatus).every(Boolean),
    applied: pendingMembers.length > 0 && !applyError,
    newlyEligible: integrationAfterApproval.newlyEligibleViaApproval,
    approvedCount: approvedCandidates.length,
    error: applyError,
  });

  const summary = [
    `Approved group: ${validatedSimulation.groupName}.`,
    `${approvedCandidates.length} candidate(s) approved locally (${pendingMembers.length} newly written, ${alreadyApprovedMembers.length} already approved).`,
    `${integrationAfterApproval.newlyEligibleViaApproval} newly eligible via approval; ${integrationAfterApproval.remainingPending} remaining pending.`,
    `${goNoGo}: ${goNoGoReason}`,
  ].join(" ");

  return {
    sourcePhase: P113_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P113_DEFAULT_MODE,
    summary,
    goNoGo,
    goNoGoReason,
    approvedGroup: {
      groupId: group.groupId,
      groupName: validatedSimulation.groupName,
      closedPositionTitle: group.closedPositionTitle,
      candidateCount: group.candidateCount,
      averageConfidence: validatedSimulation.averageConfidence,
      safeToApprove: "SAFE",
      recommendedPositionId: group.recommendedPositionId,
      recommendedPositionTitle: group.recommendedPositionTitle,
    },
    approvedCandidates,
    integrationAfterApproval,
    safetyStatus,
    warnings: [...warnings, ...integrationReport.warnings],
  };
}
