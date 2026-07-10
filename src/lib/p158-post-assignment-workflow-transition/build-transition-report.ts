import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { listCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { buildPrioritizedQueueFromCohort } from "@/lib/p156-candidate-prioritization/build-prioritized-queue";
import {
  buildScoringContextForRow,
  loadPrioritizationCohort,
} from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { buildP158AssignmentQueue } from "@/lib/p158-autonomous-recruiter-assignment/assignment-engine";
import { loadP158AssignmentAuditLog } from "@/lib/p158-autonomous-recruiter-assignment/assignment-audit-store";
import { getP158MaxAssignmentsPerRun } from "@/lib/p158-autonomous-recruiter-assignment/assignment-config";
import { sortAssignmentQueue } from "@/lib/p158-autonomous-recruiter-assignment/recommendation-builder";
import {
  loadP1583TransitionAuditLog,
  loadP1583TransitionRollbackRecords,
} from "@/lib/p158-post-assignment-workflow-transition/transition-audit-store";
import {
  isP158WorkflowTransitionEnabled,
} from "@/lib/p158-post-assignment-workflow-transition/transition-config";
import { evaluateTransitionEligibility } from "@/lib/p158-post-assignment-workflow-transition/transition-rules";
import { runPostAssignmentTransitionCycle } from "@/lib/p158-post-assignment-workflow-transition/transition-engine";
import type { P1583TransitionReport } from "@/lib/p158-post-assignment-workflow-transition/types";
import { P158_3_SOURCE_PHASE } from "@/lib/p158-post-assignment-workflow-transition/transition-config";
import type { AuthSession } from "@/lib/auth/types";

const MOCK_SESSION: AuthSession = {
  userId: "p1583-report",
  role: "executive",
  email: "report@example.com",
  name: "P158.3 Report",
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

export async function buildTransitionReport(input?: {
  simulateAssignedCandidateIds?: string[];
}): Promise<P1583TransitionReport> {
  const [
    cohortBase,
    bundle,
    store,
    p158Audit,
    paperworkAudit,
    transitionAudit,
    rollbacks,
    onboardingRecords,
  ] = await Promise.all([
    loadPrioritizationCohort(),
    getCandidateWorkflowBundle(),
    readIngestionStore(),
    loadP158AssignmentAuditLog(),
    loadPaperworkAutomationAuditLog(),
    loadP1583TransitionAuditLog(),
    loadP1583TransitionRollbackRecords(),
    listCandidateOnboardingRecords(500),
  ]);

  const candidatesById = new Map(
    listIngestedCandidates(store).map((candidate) => [candidate.candidateId, candidate]),
  );
  const cohort = { ...cohortBase, candidatesById };
  const jobs = [...cohort.jobsByPositionId.values()];
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const referenceMs = Date.parse(cohort.fetchedAt);
  const workflows = structuredClone(bundle.workflows) as Record<string, CandidateWorkflowRecord>;

  const queue = sortAssignmentQueue(
    buildP158AssignmentQueue({
      cohort,
      workflows: bundle.workflows,
      rosters: bundle.rosters,
      jobs,
      onboardingByCandidate,
      auditEvents: p158Audit,
      referenceMs,
    }),
  );

  const maxCap = getP158MaxAssignmentsPerRun();
  const queued = queue.filter((q) => q.status === "queued").slice(0, maxCap);

  for (const item of queued) {
    if (!item.recommendedRecruiter) continue;
    const wf = workflows[item.candidateId];
    if (!wf) continue;
    workflows[item.candidateId] = {
      ...wf,
      assignedRecruiter: item.recommendedRecruiter,
      assignedDM: item.dm?.trim() || wf.assignedDM || "Unassigned",
    };
  }

  const candidateIds =
    input?.simulateAssignedCandidateIds ??
    queued.map((q) => q.candidateId).filter((id) => workflows[id]);

  const priorityQueue = buildPrioritizedQueueFromCohort(cohort);
  const priorityById = new Map(priorityQueue.candidates.map((c) => [c.candidateId, c]));

  const scoringMetaByCandidate = new Map<
    string,
    {
      openDemand: number;
      coverageStatus: string;
      daysUntilProjectStart: number | null;
      projectName: string | null;
      jobStatus: string | null;
      jobPublished: boolean;
    }
  >();

  for (const row of cohort.candidates) {
    const meta = buildScoringContextForRow({
      row,
      coverageNeeds: cohort.coverageNeeds,
      opportunities: cohort.opportunities,
      jobsByPositionId: cohort.jobsByPositionId,
      referenceMs,
    });
    const job = cohort.jobsByPositionId.get(row.positionId);
    scoringMetaByCandidate.set(row.candidateId, {
      openDemand: meta.openDemand,
      coverageStatus: meta.coverageStatus,
      daysUntilProjectStart: meta.daysUntilProjectStart,
      projectName: meta.projectName,
      jobStatus: job?.status ?? null,
      jobPublished: job?.status === "published",
    });
  }

  let transitionEligible = 0;
  let transitionBlocked = 0;

  for (const candidateId of candidateIds) {
    const workflow = workflows[candidateId];
    const candidate = candidatesById.get(candidateId);
    if (!workflow || !candidate) continue;
    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: cohort.jobsByPositionId.get(candidate.positionId ?? ""),
    });
    const eligibility = evaluateTransitionEligibility({
      row,
      candidate,
      workflow,
      onboarding: onboardingByCandidate.get(candidateId) ?? null,
      auditEvents: paperworkAudit,
    });
    if (eligibility.eligible) transitionEligible += 1;
    else if (eligibility.blocked && !eligibility.alreadyTransitioned) transitionBlocked += 1;
  }

  const dryRunResult = await runPostAssignmentTransitionCycle({
    session: MOCK_SESSION,
    candidateIds,
    workflows,
    candidatesById,
    priorityById,
    onboardingByCandidate,
    auditEvents: paperworkAudit,
    jobsByPositionId: cohort.jobsByPositionId,
    scoringMetaByCandidate,
    referenceMs,
    dryRun: true,
  });

  const remainingBlockers = dryRunResult.candidates
    .filter((c) => c.blocked && c.blockers.length > 0)
    .map((c) => ({ candidateId: c.candidateId, candidateName: c.candidateName, blockers: c.blockers }));

  return {
    generatedAt: cohort.fetchedAt,
    readOnly: true,
    sourcePhase: P158_3_SOURCE_PHASE,
    transitionEnabled: isP158WorkflowTransitionEnabled(),
    summary: {
      transitionEligible,
      transitionBlocked,
      dryRunTransitionCount: dryRunResult.transitionsCompleted,
      projectedSendPaperwork: dryRunResult.projectedSendPaperwork,
      transitionsSkipped: dryRunResult.transitionsSkipped,
      transitionsFailed: dryRunResult.transitionsFailed,
    },
    sections: {
      eligibleCandidates: dryRunResult.candidates.filter((c) => c.eligible || c.transitioned),
      blockedCandidates: dryRunResult.candidates.filter((c) => c.blocked),
      postTransitionDecisions: dryRunResult.candidates.filter((c) => c.postTransitionP157Action),
      transitionAudit: transitionAudit.slice(0, 50),
      rollbackAvailable: rollbacks.filter((r) => !r.rolledBackAt).slice(0, 25),
    },
    remainingBlockers,
    dryRunResult,
    warnings: cohort.warnings,
  };
}

export function formatP1583TransitionMarkdown(report: P1583TransitionReport): string {
  const s = report.summary;
  const lines = [
    "# P158.3 — Post-Assignment Workflow Transition",
    "",
    `Generated: ${report.generatedAt}`,
    `Transition enabled on server: ${report.transitionEnabled}`,
    "",
    "## Summary",
    "",
    `- Transition eligible: **${s.transitionEligible}**`,
    `- Transition blocked: **${s.transitionBlocked}**`,
    `- Dry-run transitions: **${s.dryRunTransitionCount}**`,
    `- Projected Send Paperwork after transition: **${s.projectedSendPaperwork}**`,
    "",
    "## Post-Transition P157 Decisions",
    "",
    "| Candidate | Before | After | P157 Action | Confidence |",
    "| --- | --- | --- | --- | ---: |",
  ];

  for (const row of report.sections.postTransitionDecisions.slice(0, 30)) {
    lines.push(
      `| ${row.candidateName} | ${row.beforeWorkflowStatus} | ${row.afterWorkflowStatus ?? "—"} | ${row.postTransitionP157Action ?? "—"} | ${row.postTransitionConfidence ?? "—"} |`,
    );
  }

  lines.push("", "## Remaining Blockers", "");
  if (report.remainingBlockers.length === 0) {
    lines.push("- None");
  } else {
    for (const b of report.remainingBlockers.slice(0, 20)) {
      lines.push(`- **${b.candidateName}**: ${b.blockers.join("; ")}`);
    }
  }

  lines.push("", "## Recommendation Before Production", "");
  lines.push(
    "Enable `P158_WORKFLOW_TRANSITION_ENABLED=true` only after reviewing dry-run projected Send Paperwork count. Production requires `confirmAssignment=true`, `confirmTransition=true`, and `transitionAfterAssignment=true`. No paperwork is sent in this phase — workflow overlay only.",
  );

  return lines.join("\n");
}
