import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { applyCandidateAdvancements } from "@/lib/candidate-advancement-engine/apply-candidate-advancements";
import { buildCandidateAdvancementDecisions } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { applyTerritoryDmAssignments } from "@/lib/p151-workflow-bottleneck-resolution/apply-territory-dm-assignments";
import {
  countPipelineStages,
  evaluateCandidatePipelineStage,
} from "@/lib/p151-workflow-bottleneck-resolution/evaluate-candidate-pipeline-stage";
import type { BottleneckResolutionReport } from "@/lib/p151-workflow-bottleneck-resolution/types";
import { P151_5_SOURCE_PHASE } from "@/lib/p151-workflow-bottleneck-resolution/types";
import { buildWorkflowGateAssessments } from "@/lib/p151-workflow-bottleneck-resolution/workflow-gate-assessments";

export async function buildBottleneckResolutionReport(input: {
  session: AuthSession;
  candidateIds: string[];
  dryRun?: boolean;
  applyLive?: boolean;
  userId?: string;
}): Promise<BottleneckResolutionReport> {
  const generatedAt = new Date().toISOString();
  const referenceMs = Date.parse(generatedAt);
  const dryRun = input.dryRun ?? true;
  const applyLive = input.applyLive === true && !dryRun;

  const [candidatesResult, jobsResult, bundle, auditEvents] = await Promise.all([
    resolveCandidatesForRead({ scanMode: "preview" }),
    fetchBreezyJobs("published").catch(() => ({
      ok: false as const,
      error: "Jobs unavailable",
      fetchedAt: generatedAt,
    })),
    getCandidateWorkflowBundle(),
    loadPaperworkAutomationAuditLog().catch(() => []),
  ]);

  const allCandidates = candidatesResult.ok
    ? applyTerritoryToCandidates(input.session, candidatesResult.candidates)
    : [];
  const jobs = jobsResult.ok ? applyTerritoryToJobs(input.session, jobsResult.jobs) : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const candidates = allCandidates.filter((c) => input.candidateIds.includes(c.candidateId));
  const workflows = { ...bundle.workflows };

  const beforeCandidates = candidates.map((candidate) =>
    evaluateCandidatePipelineStage({
      candidate,
      workflow: workflows[candidate.candidateId],
      jobsByPositionId,
      referenceMs,
      requireApproval: true,
      auditEvents,
    }),
  );

  if (applyLive) {
    await applyTerritoryDmAssignments({
      candidates,
      workflows,
      jobsByPositionId,
      candidateIds: input.candidateIds,
      byUserId: input.userId ?? input.session.userId,
    });

    const rows = candidates.map((candidate) =>
      buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId ?? ""),
      }),
    );
    const decisions = buildCandidateAdvancementDecisions(rows, {
      jobsByPositionId,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      requireApproval: false,
    });
    await applyCandidateAdvancements({
      decisions: decisions.filter((d) => d.action === "send-paperwork" && d.shouldAdvance),
      workflows,
      byUserId: input.userId ?? input.session.userId,
    });
  }

  const afterCandidates = candidates.map((candidate) =>
    evaluateCandidatePipelineStage({
      candidate,
      workflow: applyLive ? workflows[candidate.candidateId] : workflows[candidate.candidateId],
      jobsByPositionId,
      referenceMs,
      requireApproval: false,
      auditEvents,
      mechanicalPatches: applyLive
        ? undefined
        : {
            assignTerritoryDm: true,
            advanceToPaperworkNeeded: true,
          },
    }),
  );

  const before = {
    ...countPipelineStages(beforeCandidates),
    candidates: beforeCandidates,
  };
  const afterMechanicalResolution = {
    ...countPipelineStages(afterCandidates),
    candidates: afterCandidates,
  };

  return {
    sourcePhase: P151_5_SOURCE_PHASE,
    generatedAt,
    dryRun: !applyLive,
    mechanicalStepsApplied: applyLive,
    gateAssessments: buildWorkflowGateAssessments(),
    before,
    afterMechanicalResolution,
    assignedCandidateIds: input.candidateIds,
    automationRecommendation:
      "Mechanical: auto-assign territory DM on recruiter assignment; run P151 advancement phase for P83-qualified candidates. Business: keep resume/incomplete and manual-review gates. Next automation target: resume ingestion reminders (not bypass).",
  };
}
