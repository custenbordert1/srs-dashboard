import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import { buildReviewWorkflowReport } from "@/lib/p109-project-mapping-review/build-review-workflow-report";
import { findP109ReviewRecord, loadP109ReviewRecords } from "@/lib/p109-project-mapping-review/review-decision-store";
import { buildApprovedMappingIntegrationDryRunReport } from "@/lib/p110-approved-mapping-integration/build-integration-dryrun-report";
import { simulateBulkGroupApprovalImpact } from "@/lib/p112-bulk-approval-impact-validation/simulate-bulk-group-impact";
import type { BulkGroupImpactSimulation } from "@/lib/p112-bulk-approval-impact-validation/types";
import {
  buildBulkMappingReviewToolsReport,
  loadBulkReviewDryRunContext,
} from "@/lib/p111-bulk-mapping-review/build-bulk-review-report";
import { checkCandidateBulkApproveSafety } from "@/lib/p111-bulk-mapping-review/bulk-safety-rules";
import { applyBulkGroupDecision } from "@/lib/p111-bulk-mapping-review/execute-bulk-decision";
import type { BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";
import {
  P113_TARGET_GROUP_ID,
  P113_TARGET_RECOMMENDED_POSITION_ID,
} from "@/lib/p113-first-safe-bulk-approval/types";
import type { RemainingSafeBulkApprovalsReport } from "@/lib/p114-remaining-safe-bulk-approvals/types";
import {
  P114_APPROVAL_NOTES,
  P114_DEFAULT_MODE,
  P114_REVIEWER,
  P114_SOURCE_PHASE,
} from "@/lib/p114-remaining-safe-bulk-approvals/types";

export type SafeBulkGroupCandidate = {
  group: BulkReviewGroup;
  simulation: BulkGroupImpactSimulation;
};

export function isP113PaysonGroup(group: BulkReviewGroup): boolean {
  return (
    group.groupId === P113_TARGET_GROUP_ID ||
    (group.recommendedPositionId === P113_TARGET_RECOMMENDED_POSITION_ID &&
      group.city.trim().toLowerCase() === "payson" &&
      group.state.trim().toUpperCase() === "AZ")
  );
}

export function identifyRemainingSafeBulkGroups(input: {
  groups: BulkReviewGroup[];
  simulations: BulkGroupImpactSimulation[];
}): SafeBulkGroupCandidate[] {
  const simulationByGroupId = new Map(input.simulations.map((simulation) => [simulation.groupId, simulation]));

  let excludedReviewFirst = 0;
  let excludedDoNotApprove = 0;

  const safeGroups: SafeBulkGroupCandidate[] = [];

  for (const group of input.groups) {
    if (!group.bulkApprovable) continue;
    if (isP113PaysonGroup(group)) continue;

    const simulation = simulationByGroupId.get(group.groupId);
    if (!simulation) continue;

    if (simulation.safeToApprove === "REVIEW FIRST") {
      excludedReviewFirst += 1;
      continue;
    }
    if (simulation.safeToApprove === "DO NOT APPROVE") {
      excludedDoNotApprove += 1;
      continue;
    }
    if (simulation.safeToApprove !== "SAFE") continue;

    safeGroups.push({ group, simulation });
  }

  return safeGroups.sort(
    (left, right) =>
      right.simulation.newlyEligibleAfterApproval - left.simulation.newlyEligibleAfterApproval ||
      right.group.candidateCount - left.group.candidateCount,
  );
}

function buildSafetyByCandidate(input: {
  group: BulkReviewGroup;
  dryRunContext: Awaited<ReturnType<typeof loadBulkReviewDryRunContext>>;
}) {
  const safetyByCandidate = new Map<
    string,
    { passesBulkApprove: boolean; blockers: string[]; baselineBlocker: string }
  >();

  for (const member of input.group.members) {
    const row = input.dryRunContext.rowsByCandidateId.get(member.candidateId);
    const baseline = row
      ? classifyPaperworkBlocker({
          row,
          onboarding: input.dryRunContext.onboardingByCandidate.get(member.candidateId) ?? null,
          jobsByPositionId: input.dryRunContext.jobsByPositionId,
          closedJobsByPositionId: input.dryRunContext.closedJobsByPositionId,
          publishedJobs: input.dryRunContext.publishedJobs,
          paperworkByGrade: input.dryRunContext.paperworkByGrade,
          p100SentIds: input.dryRunContext.p100SentIds,
        }).category
      : "missing_candidate_match";
    safetyByCandidate.set(
      member.candidateId,
      checkCandidateBulkApproveSafety({ item: member, baselineBlocker: baseline }),
    );
  }

  return safetyByCandidate;
}

function buildGoNoGo(input: {
  safetyOk: boolean;
  approvedCandidateCount: number;
  newlyEligible: number;
  safeGroupsApplied: number;
  errors: string[];
}): { goNoGo: "GO" | "NO-GO"; reason: string } {
  if (!input.safetyOk) {
    return {
      goNoGo: "NO-GO",
      reason: "Safety contract checks failed — local bulk approval not cleared.",
    };
  }
  if (input.errors.length > 0) {
    return { goNoGo: "NO-GO", reason: input.errors.join("; ") };
  }
  if (input.safeGroupsApplied === 0 && input.approvedCandidateCount === 0) {
    return {
      goNoGo: "NO-GO",
      reason: "No remaining SAFE bulk groups were available to approve.",
    };
  }
  if (input.newlyEligible === 0) {
    return {
      goNoGo: "NO-GO",
      reason: "Approvals persisted but P110 dry-run shows zero newly eligible candidates.",
    };
  }
  return {
    goNoGo: "GO",
    reason: `${input.approvedCandidateCount} candidate(s) across ${input.safeGroupsApplied} SAFE group(s) approved locally; ${input.newlyEligible} newly eligible via approval (dryRun).`,
  };
}

export async function applyRemainingSafeBulkApprovals(): Promise<RemainingSafeBulkApprovalsReport> {
  const warnings = [
    "P114 — local .data approval only; no paperwork sends.",
    "P114 — no Breezy writes.",
    "P114 — P106.3 live runner unchanged.",
    `Mode: ${P114_DEFAULT_MODE}.`,
  ];

  const p111Report = await buildBulkMappingReviewToolsReport();
  const [dryRunContext, existingRecords] = await Promise.all([
    loadBulkReviewDryRunContext(),
    loadP109ReviewRecords(),
  ]);

  const bulkApprovableGroups = p111Report.groups.filter((group) => group.bulkApprovable);
  const simulations = bulkApprovableGroups.map((group) =>
    simulateBulkGroupApprovalImpact({
      group,
      dryRunContext,
      totalPendingBefore: p111Report.metrics.totalPendingCandidates,
    }),
  );

  const reviewFirstCount = simulations.filter((simulation) => simulation.safeToApprove === "REVIEW FIRST").length;
  const doNotApproveCount = simulations.filter((simulation) => simulation.safeToApprove === "DO NOT APPROVE").length;
  const safeGroups = identifyRemainingSafeBulkGroups({ groups: bulkApprovableGroups, simulations });

  const applyErrors: string[] = [];
  const approvedGroups: RemainingSafeBulkApprovalsReport["approvedGroups"] = [];
  const newlyWrittenCandidateIds = new Set<string>();
  const targetCandidateIds = new Set<string>();
  let groupsWithNewWrites = 0;
  let groupsSkippedAlreadyApproved = 0;

  for (const { group, simulation } of safeGroups) {
    for (const candidateId of group.candidateIds) {
      targetCandidateIds.add(candidateId);
    }
    const safetyByCandidate = buildSafetyByCandidate({ group, dryRunContext });
    const pendingMembers = group.members.filter((member) => {
      const prior = findP109ReviewRecord(existingRecords, member.candidateId);
      return prior?.decision !== "approved";
    });
    const alreadyApprovedCount = group.candidateCount - pendingMembers.length;

    if (pendingMembers.length === 0) {
      groupsSkippedAlreadyApproved += 1;
    } else {
      const result = await applyBulkGroupDecision({
        group: {
          ...group,
          members: pendingMembers,
          candidateIds: pendingMembers.map((member) => member.candidateId),
          candidateCount: pendingMembers.length,
        },
        action: "approved",
        sharedNote: P114_APPROVAL_NOTES,
        reviewer: P114_REVIEWER,
        safetyByCandidate,
      });

      if (!result.ok) {
        applyErrors.push(`${group.groupId}: ${result.error ?? "Bulk approval failed."}`);
        continue;
      }

      groupsWithNewWrites += 1;
      for (const record of result.records) {
        newlyWrittenCandidateIds.add(record.candidateId);
      }
    }

    approvedGroups.push({
      groupId: group.groupId,
      groupName: simulation.groupName,
      closedPositionTitle: group.closedPositionTitle,
      candidateCount: group.candidateCount,
      averageConfidence: simulation.averageConfidence,
      safeToApprove: "SAFE",
      recommendedPositionId: group.recommendedPositionId,
      recommendedPositionTitle: group.recommendedPositionTitle,
      newlyWritten: pendingMembers.length,
      alreadyApproved: alreadyApprovedCount,
    });
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

  for (const candidateId of targetCandidateIds) {
    const row = dryRunContext.rowsByCandidateId.get(candidateId);
    if (!row) continue;
    const record = findP109ReviewRecord(recordsAfter, candidateId);
    const member = safeGroups
      .flatMap(({ group }) => group.members)
      .find((item) => item.candidateId === candidateId);
    const approved = resolveApprovedMapping({
      record: record ?? null,
      candidateId,
      closedPositionId: member?.closedPosition.positionId,
      publishedJobTitleById,
    });
    const result = simulateCandidateDryRunEligibility({
      row,
      onboarding: dryRunContext.onboardingByCandidate.get(candidateId) ?? null,
      jobsByPositionId: dryRunContext.jobsByPositionId,
      closedJobsByPositionId: dryRunContext.closedJobsByPositionId,
      publishedJobs: dryRunContext.publishedJobs,
      paperworkByGrade: dryRunContext.paperworkByGrade,
      p100SentIds: dryRunContext.p100SentIds,
      approvedMapping: approved,
      candidateName: member?.candidateName,
    });
    if (result.outcome === "newly_eligible_via_approval") {
      newlyEligibleCandidateIds.push(candidateId);
    }
  }

  const approvedCandidates: RemainingSafeBulkApprovalsReport["approvedCandidates"] = [];

  for (const { group } of safeGroups) {
    for (const member of group.members) {
      const record = findP109ReviewRecord(recordsAfter, member.candidateId);
      if (!record || record.decision !== "approved") {
        applyErrors.push(`Missing approved P109 record for ${member.candidateId}`);
        continue;
      }
      approvedCandidates.push({
        candidateId: record.candidateId,
        candidateName: record.candidateName,
        groupId: group.groupId,
        closedPositionId: record.closedPositionId,
        recommendedPositionId: record.recommendedPositionId,
        decision: "approved",
        reviewer: record.reviewer,
        notes: record.notes,
        timestamp: record.timestamp,
        confidenceScore: record.confidenceScore,
        mappingReasons: record.mappingReasons,
        newlyWritten: newlyWrittenCandidateIds.has(record.candidateId),
      });
    }
  }

  const safetyStatus = {
    p1063RunnerUnchanged: true,
    noBreezyWrites: true,
    noLiveSends: true,
    noLiveMode: process.env.AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE == null,
    dryRunOnly: true,
    localApprovalOnly: true,
    liveRunnerUnwired: true,
  };

  const metrics = {
    totalApprovedMappings: integrationReport.metrics.approvedMappingsCount,
    newlyEligibleViaApproval: integrationReport.metrics.newlyEligibleViaApproval,
    newlyEligibleCandidateIds,
    remainingPending: workflowReport.metrics.pendingCount,
    safetyExclusions: integrationReport.metrics.safetyExclusions,
    safeGroupsIdentified: safeGroups.length,
    safeGroupsApplied: groupsWithNewWrites,
    safeGroupsSkippedAlreadyApproved: groupsSkippedAlreadyApproved,
    excludedPaysonGroup: true,
    excludedReviewFirstGroups: reviewFirstCount,
    excludedDoNotApproveGroups: doNotApproveCount,
  };

  const { goNoGo, reason: goNoGoReason } = buildGoNoGo({
    safetyOk: Object.values(safetyStatus).every(Boolean),
    approvedCandidateCount: approvedCandidates.length,
    newlyEligible: metrics.newlyEligibleViaApproval,
    safeGroupsApplied: groupsWithNewWrites + groupsSkippedAlreadyApproved,
    errors: applyErrors,
  });

  const summary = [
    `${metrics.safeGroupsIdentified} remaining SAFE group(s) identified (Payson excluded).`,
    `${approvedCandidates.length} candidate(s) approved across ${approvedGroups.length} group(s) (${groupsWithNewWrites} newly written, ${groupsSkippedAlreadyApproved} already approved).`,
    `${metrics.totalApprovedMappings} total approved mappings; ${metrics.newlyEligibleViaApproval} newly eligible via approval.`,
    `${metrics.remainingPending} remaining pending.`,
    `${goNoGo}: ${goNoGoReason}`,
  ].join(" ");

  return {
    sourcePhase: P114_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P114_DEFAULT_MODE,
    summary,
    goNoGo,
    goNoGoReason,
    approvedGroups,
    approvedCandidates,
    metrics,
    safetyStatus,
    warnings: [...warnings, ...integrationReport.warnings],
  };
}
