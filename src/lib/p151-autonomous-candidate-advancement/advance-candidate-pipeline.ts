import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  applyCandidateAdvancements,
} from "@/lib/candidate-advancement-engine/apply-candidate-advancements";
import { buildCandidateAdvancementDecisions } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { hoursSince } from "@/lib/candidate-action-sla";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import {
  analyzePipelineCandidate,
  buildPipelineDashboardMetrics,
  computeReadinessScore,
  isEligibleForAutonomousAdvancement,
  isEligibleForAutonomousAssignment,
} from "@/lib/p151-autonomous-candidate-advancement/analyze-candidate-pipeline";
import {
  appendPipelineAdvancementAuditEvent,
  countAuditEventsToday,
  loadPipelineAdvancementAuditLog,
} from "@/lib/p151-autonomous-candidate-advancement/p151-advancement-audit-store";
import type {
  PipelineAdvancementExecutionItem,
  PipelineAdvancementSummary,
  PipelineCandidateAnalysis,
} from "@/lib/p151-autonomous-candidate-advancement/types";
import {
  P151_DEFAULT_MAX_ADVANCES,
  P151_DEFAULT_MAX_ASSIGNMENTS,
  P151_SOURCE_PHASE,
} from "@/lib/p151-autonomous-candidate-advancement/types";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import { applyRecruiterAssignments } from "@/lib/recruiter-assignment-engine/apply-recruiter-assignments";
import { applyTerritoryDmAssignments } from "@/lib/p151-workflow-bottleneck-resolution/apply-territory-dm-assignments";

export function isP151AutonomousAdvancementEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P151_AUTONOMOUS_ADVANCEMENT_ENABLED === "true";
}

export function getP151MaxAssignmentsPerCycle(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P151_MAX_ASSIGNMENTS_PER_CYCLE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P151_DEFAULT_MAX_ASSIGNMENTS;
}

export function getP151MaxAdvancesPerCycle(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P151_MAX_ADVANCES_PER_CYCLE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P151_DEFAULT_MAX_ADVANCES;
}

function buildRollbackRecommendation(summary: PipelineAdvancementSummary): string {
  if (summary.failures > 0 || summary.stoppedOnError) {
    return "Set P151_AUTONOMOUS_ADVANCEMENT_ENABLED=false and review executionItems failures before re-enabling.";
  }
  if (summary.recruitersAssigned > 0 || summary.candidatesAdvanced > 0) {
    return "Monitor p151-candidate-advancement-audit.json for 24h before increasing P151_MAX_* limits.";
  }
  if (summary.dashboard.candidatesWaitingAssignment > 0) {
    return "Enable P151 after confirming published jobs and recruiter roster — dry-run first.";
  }
  return "Dry run complete — no live movement. Enable P151_AUTONOMOUS_ADVANCEMENT_ENABLED only after executive review.";
}

export async function advanceCandidatePipeline(input: {
  session: AuthSession;
  dryRun?: boolean;
  userId?: string;
}): Promise<PipelineAdvancementSummary> {
  const started = Date.now();
  const generatedAt = new Date().toISOString();
  const referenceMs = Date.parse(generatedAt);
  const p151Enabled = isP151AutonomousAdvancementEnabled();
  const dryRun = input.dryRun ?? !p151Enabled;
  const liveExecution = p151Enabled && !dryRun;
  const executionMode: "dry_run" | "live" = liveExecution ? "live" : "dry_run";
  const maxAssignments = getP151MaxAssignmentsPerCycle();
  const maxAdvances = getP151MaxAdvancesPerCycle();

  const [candidatesResult, jobsResult, bundle, onboardingPolicy, priorAudit] = await Promise.all([
    resolveCandidatesForRead({ scanMode: "preview" }),
    fetchBreezyJobs("published").catch(() => ({
      ok: false as const,
      error: "Jobs unavailable",
      fetchedAt: generatedAt,
    })),
    getCandidateWorkflowBundle(),
    loadCandidateOnboardingPolicy().catch(() => null),
    loadPipelineAdvancementAuditLog().catch(() => []),
  ]);

  const candidates = candidatesResult.ok
    ? applyTerritoryToCandidates(input.session, candidatesResult.candidates)
    : [];
  const jobs = jobsResult.ok ? applyTerritoryToJobs(input.session, jobsResult.jobs) : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const paperworkByGrade = onboardingPolicy?.paperworkByGrade ?? DEFAULT_PAPERWORK_BY_GRADE;
  const workflows = { ...bundle.workflows };
  const candidatesById = new Map(candidates.map((c) => [c.candidateId, c]));

  const advancementOptions = {
    jobsByPositionId,
    paperworkByGrade,
    requireApproval: !liveExecution,
  };

  function buildAnalysisList(): PipelineCandidateAnalysis[] {
    return candidates.map((candidate) => {
      const row = buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId ?? ""),
      });
      return analyzePipelineCandidate({
        row,
        candidate,
        jobsByPositionId,
        advancementOptions,
        referenceMs,
      });
    });
  }

  let analysis = buildAnalysisList();
  const assignmentDecisions = buildRecruiterAssignmentDecisions({
    candidates,
    workflows,
    rosters: bundle.rosters,
    jobsByPositionId,
  });
  const assignmentById = new Map(assignmentDecisions.map((d) => [d.candidateId, d]));

  const executionItems: PipelineAdvancementExecutionItem[] = [];
  let recruitersAssigned = 0;
  let candidatesAdvanced = 0;
  let candidatesBlocked = 0;
  let candidatesSkipped = 0;
  let failures = 0;
  let duplicateAssignmentsPrevented = 0;
  let capReached = false;
  let stoppedOnError = false;
  let auditEvents = [...priorAudit];

  const eligibleForAssignment = analysis.filter((a) =>
    isEligibleForAutonomousAssignment(a, assignmentById.get(a.candidateId)),
  ).length;
  const eligibleForAdvancement = analysis.filter((a) =>
    isEligibleForAutonomousAdvancement(a, !liveExecution),
  ).length;

  if (liveExecution) {
    for (const item of analysis) {
      if (recruitersAssigned >= maxAssignments) {
        capReached = true;
        break;
      }
      const decision = assignmentById.get(item.candidateId);
      if (!isEligibleForAutonomousAssignment(item, decision)) {
        if (item.dashboardNextAction === "Assign Recruiter" && decision && !decision.shouldAssign) {
          candidatesBlocked += 1;
          executionItems.push({
            candidateId: item.candidateId,
            candidateName: item.candidateName,
            phase: "recruiter_assignment",
            result: "blocked",
            reason: decision.reason,
            executionMode,
          });
          auditEvents = await appendPipelineAdvancementAuditEvent({
            type: "assignment_blocked",
            candidateId: item.candidateId,
            candidateName: item.candidateName,
            executed: false,
            simulated: false,
            reason: decision.reason,
            metadata: { confidence: decision.confidence, territoryState: decision.territoryState },
          });
        }
        continue;
      }
      if (!decision) continue;

      try {
        const records = await applyRecruiterAssignments({
          decisions: [decision],
          candidatesById,
          workflows,
          byUserId: input.userId ?? input.session.userId,
        });
        if (records.length > 0) {
          recruitersAssigned += 1;
          executionItems.push({
            candidateId: item.candidateId,
            candidateName: item.candidateName,
            phase: "recruiter_assignment",
            result: "assigned",
            reason: decision.reason,
            recruiter: decision.recruiter,
            executionMode,
          });
          auditEvents = await appendPipelineAdvancementAuditEvent({
            type: "recruiter_assigned",
            candidateId: item.candidateId,
            candidateName: item.candidateName,
            executed: true,
            simulated: false,
            reason: decision.reason,
            metadata: {
              recruiter: decision.recruiter,
              confidence: decision.confidence,
              territoryState: decision.territoryState,
            },
          });
        } else {
          duplicateAssignmentsPrevented += 1;
          candidatesSkipped += 1;
        }
      } catch (error) {
        failures += 1;
        stoppedOnError = true;
        executionItems.push({
          candidateId: item.candidateId,
          candidateName: item.candidateName,
          phase: "recruiter_assignment",
          result: "failed",
          reason: error instanceof Error ? error.message : "Assignment failed.",
          executionMode,
        });
        break;
      }
    }

    analysis = buildAnalysisList();

    await applyTerritoryDmAssignments({
      candidates,
      workflows,
      jobsByPositionId,
      byUserId: input.userId ?? input.session.userId,
    });
    analysis = buildAnalysisList();

    const rows = candidates.map((candidate) =>
      buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId ?? ""),
      }),
    );
    const advancementDecisions = buildCandidateAdvancementDecisions(rows, {
      ...advancementOptions,
      requireApproval: false,
    });

    for (const decision of advancementDecisions) {
      if (stoppedOnError || candidatesAdvanced >= maxAdvances) {
        if (candidatesAdvanced >= maxAdvances) capReached = true;
        break;
      }
      const item = analysis.find((a) => a.candidateId === decision.candidateId);
      if (!item) continue;
      if (!isEligibleForAutonomousAdvancement(item, false)) continue;
      if (!decision.shouldAdvance || decision.action !== "send-paperwork") {
        candidatesSkipped += 1;
        continue;
      }

      try {
        const result = await applyCandidateAdvancements({
          decisions: [decision],
          workflows,
          byUserId: input.userId ?? input.session.userId,
        });
        if (result.advanced > 0) {
          candidatesAdvanced += 1;
          const record = result.records[0];
          executionItems.push({
            candidateId: item.candidateId,
            candidateName: item.candidateName,
            phase: "workflow_advancement",
            result: "advanced",
            reason: decision.reason,
            newWorkflowStatus: record?.workflowStatus,
            executionMode,
          });
          auditEvents = await appendPipelineAdvancementAuditEvent({
            type: "candidate_advanced",
            candidateId: item.candidateId,
            candidateName: item.candidateName,
            executed: true,
            simulated: false,
            reason: decision.reason,
            metadata: {
              action: decision.action,
              workflowStatus: record?.workflowStatus,
              confidence: decision.confidence,
            },
          });
        } else {
          candidatesBlocked += 1;
          executionItems.push({
            candidateId: item.candidateId,
            candidateName: item.candidateName,
            phase: "workflow_advancement",
            result: "blocked",
            reason: decision.reason,
            executionMode,
          });
        }
      } catch (error) {
        failures += 1;
        stoppedOnError = true;
        executionItems.push({
          candidateId: item.candidateId,
          candidateName: item.candidateName,
          phase: "workflow_advancement",
          result: "failed",
          reason: error instanceof Error ? error.message : "Advancement failed.",
          executionMode,
        });
        break;
      }
    }
  } else {
    for (const item of analysis) {
      const decision = assignmentById.get(item.candidateId);
      if (isEligibleForAutonomousAssignment(item, decision)) {
        candidatesSkipped += 1;
        executionItems.push({
          candidateId: item.candidateId,
          candidateName: item.candidateName,
          phase: "recruiter_assignment",
          result: "skipped",
          reason: `Dry run — would assign ${decision?.recruiter ?? "recruiter"} (${decision?.confidence ?? 0}% confidence).`,
          recruiter: decision?.recruiter,
          executionMode,
        });
      }
      if (isEligibleForAutonomousAdvancement(item, true)) {
        candidatesSkipped += 1;
        executionItems.push({
          candidateId: item.candidateId,
          candidateName: item.candidateName,
          phase: "workflow_advancement",
          result: "skipped",
          reason: "Dry run — would advance to Paperwork Needed (requireApproval bypass only when live).",
          executionMode,
        });
      }
    }
  }

  const stageAgeHoursByStatus: Record<string, number[]> = {};
  for (const candidate of candidates) {
    const row = workflows[candidate.candidateId];
    const status = row?.workflowStatus ?? candidate.stage ?? "Applied";
    const applied = candidate.appliedDate;
    const hours = applied ? hoursSince(applied, referenceMs) : null;
    if (hours == null) continue;
    const bucket = stageAgeHoursByStatus[status] ?? [];
    bucket.push(hours);
    stageAgeHoursByStatus[status] = bucket;
  }

  const todayCounts = countAuditEventsToday(auditEvents);
  const dashboard = buildPipelineDashboardMetrics({
    analysis,
    auditAssignmentsToday: todayCounts.assignments,
    auditAdvancementsToday: todayCounts.advancements,
    stageAgeHoursByStatus,
  });

  const topBlockerCounts = dashboard.topBlockers;

  const summary: PipelineAdvancementSummary = {
    sourcePhase: P151_SOURCE_PHASE,
    generatedAt,
    dryRun: !liveExecution,
    autonomousAdvancementEnabled: liveExecution,
    candidatesEvaluated: analysis.length,
    candidatesEligibleForAssignment: eligibleForAssignment,
    candidatesEligibleForAdvancement: eligibleForAdvancement,
    recruitersAssigned,
    candidatesAdvanced,
    candidatesBlocked,
    candidatesSkipped,
    failures,
    duplicateAssignmentsPrevented,
    topBlockerCounts,
    nextActionCounts: dashboard.nextActionCounts,
    executionTimeMs: Date.now() - started,
    safetyFlags: {
      breezyWrites: false,
      executeBatchCalled: false,
      p151Enabled: liveExecution,
      requireApprovalBypassed: liveExecution,
    },
    readinessScore: computeReadinessScore(analysis),
    rollbackRecommendation: "",
    analysis: analysis.sort((a, b) => a.candidateName.localeCompare(b.candidateName)),
    dashboard,
    executionItems,
    capReached,
    stoppedOnError,
  };
  summary.rollbackRecommendation = buildRollbackRecommendation(summary);
  return summary;
}
