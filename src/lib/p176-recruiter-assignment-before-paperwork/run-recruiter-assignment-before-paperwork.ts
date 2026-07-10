import { randomUUID } from "node:crypto";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle, getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { pickActiveOnboardingRecord } from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { buildDecisionDashboardFromCohort } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import type { P157CandidateDecision } from "@/lib/p157-recruiter-decision-engine/types";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import { mapP157ToP169Outcome } from "@/lib/p169-autonomous-recruiting-orchestrator/map-candidate-outcome";
import { resolveP169EnvConfig } from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config";
import { evaluateRecruiterAssignmentCandidate } from "@/lib/p151-autonomous-recruiter-assignment/evaluate-recruiter-assignment-candidate";
import { projectDropboxUsage } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import {
  passesP176AssignmentGates,
  shouldApplyRecruiterAssignment,
} from "@/lib/p176-recruiter-assignment-before-paperwork/evaluate-assignment-eligibility";
import { writeP176WorkflowRollback } from "@/lib/p176-recruiter-assignment-before-paperwork/rollback";
import type {
  P176CandidateSnapshot,
  P176RecruiterAssignmentReport,
} from "@/lib/p176-recruiter-assignment-before-paperwork/types";
import { P176_SOURCE_PHASE } from "@/lib/p176-recruiter-assignment-before-paperwork/types";
import { applyRecruiterAssignments } from "@/lib/recruiter-assignment-engine/apply-recruiter-assignments";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";

function displayName(candidate: BreezyCandidate): string {
  const name = `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim();
  return name || candidate.email || candidate.candidateId;
}

function pickNewestCandidates(candidates: BreezyCandidate[], count: number): BreezyCandidate[] {
  return [...candidates]
    .sort((a, b) => (b.appliedDate || b.addedDate).localeCompare(a.appliedDate || a.addedDate))
    .slice(0, count);
}

function buildSnapshot(input: {
  rank: number;
  candidate: BreezyCandidate;
  workflow: Awaited<ReturnType<typeof getCandidateWorkflowState>>[string] | undefined;
  decision: P157CandidateDecision | null;
  auditEvents: Awaited<ReturnType<typeof loadDecisionCohort>>["auditEvents"];
  onboarding: ReturnType<typeof pickActiveOnboardingRecord>;
  assignedInThisRun?: boolean;
}): P176CandidateSnapshot {
  const workflow = input.workflow;
  const row = buildScoredWorkflowRow(input.candidate, workflow, { job: undefined });
  const hard = detectImmediatePaperworkHardBlockers({
    row,
    candidate: input.candidate,
    onboarding: input.onboarding,
    auditEvents: input.auditEvents,
  });

  return {
    rank: input.rank,
    candidateId: input.candidate.candidateId,
    name: displayName(input.candidate),
    email: input.candidate.email?.trim() ?? "",
    appliedAt: input.candidate.appliedDate || input.candidate.addedDate,
    assignedRecruiter: workflow?.assignedRecruiter?.trim() || "Unassigned",
    p157Recommendation: input.decision?.action ?? null,
    p157Confidence: input.decision?.confidence ?? null,
    paperworkEligible: !hard.blocked,
    blockers: hard.blockers,
    duplicateBlocked: hard.primaryHardBlocker === "duplicate_candidate",
    assignedInThisRun: input.assignedInThisRun ?? false,
  };
}

export async function runP176RecruiterAssignmentBeforePaperwork(input?: {
  dryRun?: boolean;
  newestCount?: number;
  byUserId?: string;
}): Promise<P176RecruiterAssignmentReport> {
  const generatedAt = new Date().toISOString();
  const dryRun = input?.dryRun === true;
  const newestCount = input?.newestCount ?? 25;
  const runId = randomUUID();

  const store = await readIngestionStore();
  const newestCandidates = pickNewestCandidates(listIngestedCandidates(store), newestCount);
  const newestIds = new Set(newestCandidates.map((c) => c.candidateId));

  const [cohort, bundle, onboardingRecords, jobsResult] = await Promise.all([
    loadDecisionCohort(),
    getCandidateWorkflowBundle(),
    listAllCandidateOnboardingRecords(),
    fetchBreezyJobs("published"),
  ]);

  const publishedJobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(publishedJobs.map((job) => [job.jobId, job]));
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const workflows = { ...bundle.workflows };
  const candidatesById = new Map(newestCandidates.map((c) => [c.candidateId, c]));

  const dashboard = buildDecisionDashboardFromCohort(cohort);
  const decisionsById = new Map(dashboard.decisions.map((d) => [d.candidateId, d]));

  const assignmentDecisions = buildRecruiterAssignmentDecisions({
    candidates: newestCandidates,
    workflows,
    rosters: bundle.rosters,
    jobsByPositionId,
  });
  const assignmentById = new Map(assignmentDecisions.map((d) => [d.candidateId, d]));

  const before: P176CandidateSnapshot[] = newestCandidates.map((candidate, index) =>
    buildSnapshot({
      rank: index + 1,
      candidate,
      workflow: workflows[candidate.candidateId],
      decision: decisionsById.get(candidate.candidateId) ?? null,
      auditEvents: cohort.auditEvents,
      onboarding: pickActiveOnboardingRecord(onboardingRecords, candidate.candidateId),
    }),
  );

  const assignments: P176RecruiterAssignmentReport["assignments"] = [];
  const toApply: typeof assignmentDecisions = [];

  for (const candidate of newestCandidates) {
    const workflow = workflows[candidate.candidateId];
    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: jobsByPositionId.get(candidate.positionId ?? ""),
    });
    const onboarding = onboardingByCandidate.get(candidate.candidateId) ?? null;
    const p157 = decisionsById.get(candidate.candidateId) ?? null;
    const p152 = detectImmediatePaperworkHardBlockers({
      row,
      candidate,
      onboarding,
      auditEvents: cohort.auditEvents,
    });
    const assignment = assignmentById.get(candidate.candidateId);
    if (!assignment) continue;

    const assignmentEval = evaluateRecruiterAssignmentCandidate({
      row,
      candidate,
      assignment,
      jobsByPositionId,
      publishedJobs,
      onboarding,
    });

    const gates = passesP176AssignmentGates({ row, candidate, onboarding, p157, p152 });
    const applyDecision = shouldApplyRecruiterAssignment({ gates, assignmentEval });

    if (applyDecision.apply && assignment.shouldAssign) {
      toApply.push(assignment);
      assignments.push({
        candidateId: candidate.candidateId,
        name: displayName(candidate),
        email: candidate.email,
        recruiter: assignment.recruiter,
        confidence: assignment.confidence,
        reason: applyDecision.reason,
      });
    } else {
      assignments.push({
        candidateId: candidate.candidateId,
        name: displayName(candidate),
        email: candidate.email,
        recruiter: assignment.recruiter,
        confidence: assignment.confidence,
        reason: assignmentEval.reason,
        skippedReason: applyDecision.reason,
      });
    }
  }

  let rollbackPath: string | null = null;
  const assignedIds = new Set<string>();

  if (!dryRun && toApply.length > 0) {
    rollbackPath = await writeP176WorkflowRollback({ runId, workflows: { ...workflows } });
    const applied = await applyRecruiterAssignments({
      decisions: toApply,
      candidatesById,
      workflows,
      byUserId: input?.byUserId ?? "p176-recruiter-assignment",
    });
    for (const record of applied) {
      assignedIds.add(record.candidateId);
    }
  }

  const workflowsAfter = dryRun ? workflows : await getCandidateWorkflowState();

  let decisionsAfter = decisionsById;
  if (!dryRun && assignedIds.size > 0) {
    const cohortAfter = await loadDecisionCohort();
    const dashboardAfter = buildDecisionDashboardFromCohort(cohortAfter);
    decisionsAfter = new Map(dashboardAfter.decisions.map((d) => [d.candidateId, d]));
  }

  const after: P176CandidateSnapshot[] = newestCandidates.map((candidate, index) =>
    buildSnapshot({
      rank: index + 1,
      candidate,
      workflow: workflowsAfter[candidate.candidateId],
      decision: decisionsById.get(candidate.candidateId) ?? null,
      auditEvents: cohort.auditEvents,
      onboarding: pickActiveOnboardingRecord(onboardingRecords, candidate.candidateId),
      assignedInThisRun: assignedIds.has(candidate.candidateId),
    }),
  );

  const paperworkEligibleBefore = before.filter((r) => r.paperworkEligible).length;
  const paperworkEligibleAfter = after.filter((r) => r.paperworkEligible).length;
  const newlyEligible = after.filter((r, i) => r.paperworkEligible && !before[i]!.paperworkEligible);

  const p169Config = resolveP169EnvConfig();
  const expectedPaperworkSendCount = newlyEligible.filter((row) => {
    const decision = decisionsAfter.get(row.candidateId);
    if (!decision) return false;
    return (
      mapP157ToP169Outcome(decision, p169Config.minimumConfidence, null).outcome ===
      "AUTO_SEND_PAPERWORK"
    );
  }).length;

  const duplicateBlockedCount = after.filter((r) => r.duplicateBlocked).length;
  const stillBlockedCount = after.filter((r) => !r.paperworkEligible).length;
  const noDuplicatePaperworkRisk = !after.some(
    (r) => r.duplicateBlocked && r.paperworkEligible,
  );

  let conclusion: string;
  if (dryRun) {
    conclusion = `Dry run: ${toApply.length} recruiter assignments would be applied; ${newlyEligible.length} candidates would become P152 paperwork eligible.`;
  } else if (assignedIds.size > 0) {
    conclusion = `Assigned ${assignedIds.size} recruiters locally. ${newlyEligible.length} newest candidates became paperwork eligible without sending paperwork.`;
  } else {
    conclusion = "No recruiter assignments applied — review skipped reasons in assignment rows.";
  }

  return {
    sourcePhase: P176_SOURCE_PHASE,
    generatedAt,
    dryRun,
    readOnlyPaperwork: true,
    noBreezyWrites: true,
    noDropboxWrites: true,
    summary: {
      newest25Count: newestCandidates.length,
      recruitersAssigned: assignedIds.size,
      stillBlockedCount,
      duplicateBlockedCount,
      paperworkEligibleBefore,
      paperworkEligibleAfter,
      newlyPaperworkEligible: newlyEligible.length,
      expectedPaperworkSendCount,
      dropboxApiProjection: projectDropboxUsage(expectedPaperworkSendCount),
      noDuplicatePaperworkRisk,
      paperworkSent: false,
    },
    before,
    after,
    assignments: assignments.filter((a) => newestIds.has(a.candidateId)),
    rollbackPath,
    conclusion,
  };
}
