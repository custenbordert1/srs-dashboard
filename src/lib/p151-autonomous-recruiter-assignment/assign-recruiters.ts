import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { evaluateRecruiterAssignmentCandidate } from "@/lib/p151-autonomous-recruiter-assignment/evaluate-recruiter-assignment-candidate";
import type {
  AutonomousRecruiterAssignmentSummary,
  RecruiterAssignmentExecutionItem,
  RecruiterAssignmentRecommendation,
} from "@/lib/p151-autonomous-recruiter-assignment/types";
import { P151_2_SOURCE_PHASE } from "@/lib/p151-autonomous-recruiter-assignment/types";
import {
  getP151MaxAssignmentsPerCycle,
  isP151AutonomousAdvancementEnabled,
} from "@/lib/p151-autonomous-candidate-advancement/advance-candidate-pipeline";
import { appendPipelineAdvancementAuditEvent } from "@/lib/p151-autonomous-candidate-advancement/p151-advancement-audit-store";
import { applyRecruiterAssignments } from "@/lib/recruiter-assignment-engine/apply-recruiter-assignments";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";

const RECOMMENDATIONS: RecruiterAssignmentRecommendation[] = [
  "Assign Recruiter",
  "Manual Review",
  "Hold",
  "Do Not Assign",
];

function emptyRecommendationCounts(): Record<RecruiterAssignmentRecommendation, number> {
  return Object.fromEntries(RECOMMENDATIONS.map((key) => [key, 0])) as Record<
    RecruiterAssignmentRecommendation,
    number
  >;
}

function buildRollbackRecommendation(summary: AutonomousRecruiterAssignmentSummary): string {
  if (summary.assignmentsFailed > 0 || summary.stoppedOnError) {
    return "Set P151_AUTONOMOUS_ADVANCEMENT_ENABLED=false and review assignment failures.";
  }
  if (summary.assignmentsCompleted > 0) {
    return "Monitor recruiter workload and audit log before increasing P151_MAX_ASSIGNMENTS_PER_CYCLE.";
  }
  if (summary.recommendationCounts["Assign Recruiter"] > 0) {
    return "Dry run shows assignable candidates — enable P151_AUTONOMOUS_ADVANCEMENT_ENABLED after review.";
  }
  return "No autonomous assignments recommended this cycle.";
}

export async function assignRecruiters(input: {
  session: AuthSession;
  dryRun?: boolean;
  userId?: string;
}): Promise<AutonomousRecruiterAssignmentSummary> {
  const started = Date.now();
  const generatedAt = new Date().toISOString();
  const referenceMs = Date.parse(generatedAt);
  const enabled = isP151AutonomousAdvancementEnabled();
  const dryRun = input.dryRun ?? !enabled;
  const liveExecution = enabled && !dryRun;
  const executionMode: "dry_run" | "live" = liveExecution ? "live" : "dry_run";
  const maxAssignments = getP151MaxAssignmentsPerCycle();

  const [candidatesResult, jobsResult, bundle, onboardingRecords] = await Promise.all([
    resolveCandidatesForRead({ scanMode: "preview" }),
    fetchBreezyJobs("published").catch(() => ({
      ok: false as const,
      error: "Jobs unavailable",
      fetchedAt: generatedAt,
    })),
    getCandidateWorkflowBundle(),
    listAllCandidateOnboardingRecords().catch(() => []),
  ]);

  const candidates = candidatesResult.ok
    ? applyTerritoryToCandidates(input.session, candidatesResult.candidates)
    : [];
  const publishedJobs = jobsResult.ok ? applyTerritoryToJobs(input.session, jobsResult.jobs) : [];
  const jobsByPositionId = new Map(publishedJobs.map((job) => [job.jobId, job]));
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const workflows = { ...bundle.workflows };
  const candidatesById = new Map(candidates.map((c) => [c.candidateId, c]));

  function evaluateAll() {
    const decisions = buildRecruiterAssignmentDecisions({
      candidates,
      workflows,
      rosters: bundle.rosters,
      jobsByPositionId,
    });
    const decisionById = new Map(decisions.map((d) => [d.candidateId, d]));
    return candidates.map((candidate) => {
      const row = buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId ?? ""),
      });
      return evaluateRecruiterAssignmentCandidate({
        row,
        candidate,
        assignment: decisionById.get(candidate.candidateId)!,
        jobsByPositionId,
        publishedJobs,
        onboarding: onboardingByCandidate.get(candidate.candidateId) ?? null,
        referenceMs,
      });
    });
  }

  let rows = evaluateAll();
  const recommendationCounts = emptyRecommendationCounts();
  const blockerCounts = new Map<string, number>();
  const territoryCounts = new Map<string, number>();

  for (const row of rows) {
    recommendationCounts[row.recommendation] += 1;
    if (row.blockers.length > 0) {
      for (const blocker of row.blockers) {
        blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
      }
    }
    if (row.recruiterTerritory) {
      territoryCounts.set(row.recruiterTerritory, (territoryCounts.get(row.recruiterTerritory) ?? 0) + 1);
    }
    if (row.recommendation !== "Assign Recruiter" && row.reason) {
      blockerCounts.set(row.reason, (blockerCounts.get(row.reason) ?? 0) + 1);
    }
  }

  const executionItems: RecruiterAssignmentExecutionItem[] = [];
  let assignmentsCompleted = 0;
  let assignmentsSkipped = 0;
  let assignmentsBlocked = 0;
  let assignmentsFailed = 0;
  let capReached = false;
  let stoppedOnError = false;

  if (liveExecution) {
    while (assignmentsCompleted < maxAssignments && !stoppedOnError) {
      rows = evaluateAll();
      const next = rows.find((r) => r.autoAssignEligible && r.recommendation === "Assign Recruiter");
      if (!next) break;

      const decisions = buildRecruiterAssignmentDecisions({
        candidates,
        workflows,
        rosters: bundle.rosters,
        jobsByPositionId,
      });
      const decision = decisions.find((d) => d.candidateId === next.candidateId);
      if (!decision?.shouldAssign) {
        assignmentsBlocked += 1;
        break;
      }

      try {
        const records = await applyRecruiterAssignments({
          decisions: [decision],
          candidatesById,
          workflows,
          byUserId: input.userId ?? input.session.userId,
        });
        if (records.length > 0) {
          assignmentsCompleted += 1;
          executionItems.push({
            candidateId: next.candidateId,
            candidateName: next.candidateName,
            result: "assigned",
            recruiter: decision.recruiter,
            reason: decision.reason,
            executionMode,
          });
          await appendPipelineAdvancementAuditEvent({
            type: "recruiter_assigned",
            candidateId: next.candidateId,
            candidateName: next.candidateName,
            executed: true,
            simulated: false,
            reason: decision.reason,
            metadata: {
              sourcePhase: P151_2_SOURCE_PHASE,
              recruiter: decision.recruiter,
              confidence: decision.confidence,
              territoryState: decision.territoryState,
            },
          });
        } else {
          assignmentsSkipped += 1;
        }
      } catch (error) {
        assignmentsFailed += 1;
        stoppedOnError = true;
        executionItems.push({
          candidateId: next.candidateId,
          candidateName: next.candidateName,
          result: "failed",
          recruiter: decision.recruiter,
          reason: error instanceof Error ? error.message : "Assignment failed.",
          executionMode,
        });
        await appendPipelineAdvancementAuditEvent({
          type: "assignment_blocked",
          candidateId: next.candidateId,
          candidateName: next.candidateName,
          executed: false,
          simulated: false,
          reason: error instanceof Error ? error.message : "Assignment failed.",
          metadata: { sourcePhase: P151_2_SOURCE_PHASE },
        });
        break;
      }

      if (assignmentsCompleted >= maxAssignments) capReached = true;
    }
    rows = evaluateAll();
  } else {
    for (const row of rows) {
      if (!row.autoAssignEligible) continue;
      assignmentsSkipped += 1;
      executionItems.push({
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        result: "skipped",
        recruiter: row.recommendedRecruiter,
        reason: `Dry run — would assign ${row.recommendedRecruiter} (${row.assignmentConfidence}% confidence).`,
        executionMode,
      });
    }
  }

  const recruiterWorkloadByName: Record<string, number> = {};
  for (const record of Object.values(workflows)) {
    const recruiter = record.assignedRecruiter?.trim();
    if (!recruiter || isUnassignedRecruiter(recruiter)) continue;
    recruiterWorkloadByName[recruiter] = (recruiterWorkloadByName[recruiter] ?? 0) + 1;
  }
  const workloadValues = Object.values(recruiterWorkloadByName);
  const averageRecruiterWorkload =
    workloadValues.length > 0
      ? Math.round((workloadValues.reduce((sum, n) => sum + n, 0) / workloadValues.length) * 10) / 10
      : 0;

  const recruiterDistribution = Object.entries(recruiterWorkloadByName)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const territoryDistribution = [...territoryCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const topBlockerReasons = [...blockerCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const candidatesRemaining = rows.filter(
    (r) => r.recommendation === "Assign Recruiter" && isUnassignedRecruiter(r.assignedRecruiter),
  ).length;

  const summary: AutonomousRecruiterAssignmentSummary = {
    sourcePhase: P151_2_SOURCE_PHASE,
    generatedAt,
    dryRun: !liveExecution,
    autonomousAdvancementEnabled: liveExecution,
    candidatesEvaluated: rows.length,
    assignmentsCompleted,
    assignmentsSkipped,
    assignmentsBlocked,
    assignmentsFailed,
    candidatesRemaining,
    recommendationCounts,
    recruiterDistribution,
    territoryDistribution,
    topBlockerReasons,
    averageRecruiterWorkload,
    recruiterWorkloadByName,
    executionTimeMs: Date.now() - started,
    capReached,
    stoppedOnError,
    safetyFlags: {
      breezyWrites: false,
      breezyCandidateMovement: false,
      executeBatchCalled: false,
    },
    rollbackRecommendation: "",
    candidates: rows.sort((a, b) => a.candidateName.localeCompare(b.candidateName)),
    executionItems,
  };
  summary.rollbackRecommendation = buildRollbackRecommendation(summary);
  return summary;
}
