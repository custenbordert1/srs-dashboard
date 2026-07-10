import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { buildExecutiveDashboard } from "@/lib/dm-dashboard/build-executive-dashboard";
import {
  runHiringDecisionSimulation,
  loadP87FeatureFlags,
} from "@/lib/autonomous-hiring-decision-engine";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/executive/dashboard";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "executive_dashboard",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, "/api/executive/dashboard");

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const [jobsResult, candidatesLive, melResult] = await Promise.all([
    fetchBreezyJobs("published"),
    resolveCandidatesForRead({ scanMode: "preview" }),
    fetchMelProjectsSheet(),
  ]);

  let candidatesResult = candidatesLive;
  let candidatesFromCache = candidatesResult.ok ? candidatesResult.fromIngestionStore : false;

  if (!jobsResult.ok) {
    const status = breezyFailureHttpStatus(jobsResult.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false, phase: "jobs" });
    return NextResponse.json(breezyFailureBody(jobsResult), { status });
  }
  if (!candidatesResult.ok) {
    const candidateError = candidatesResult.error;
    logBreezyRouteResult(ROUTE, 200, {
      role: session.role,
      breezyOk: false,
      phase: "candidates-fallback-empty",
    });
    candidatesResult = {
      ok: true,
      candidates: [],
      fetchedAt: new Date().toISOString(),
      companyId: jobsResult.companyId,
      truncated: true,
      warnings: [candidateError],
      fromIngestionStore: false,
    };
    candidatesFromCache = false;
  }

  const melOpportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const dashboard = buildExecutiveDashboard(
    jobsResult.jobs,
    candidatesResult.candidates,
    candidatesResult.fetchedAt,
    melOpportunities,
  );

  let hiringDecisionEngine: ReturnType<typeof runHiringDecisionSimulation> | null = null;
  const p87Flags = await loadP87FeatureFlags();
  if (p87Flags.enabled) {
    const [ingestionStore, workflowBundle, onboardingRecords] = await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowBundle(),
      listAllCandidateOnboardingRecords(),
    ]);
    const jobsByPositionId = new Map(jobsResult.jobs.map((job) => [job.jobId, job]));
    const mtdCandidates = filterMtdCandidates(listIngestedCandidates(ingestionStore));
    const rows = mtdCandidates.map((candidate) =>
      buildScoredWorkflowRow(candidate, workflowBundle.workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId),
      }),
    );
    hiringDecisionEngine = runHiringDecisionSimulation({
      rows,
      jobsByPositionId,
      onboardingByCandidateId: new Map(
        onboardingRecords.map((record) => [record.candidateId, record]),
      ),
    });
  }

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    totalJobs: jobsResult.jobs.length,
    totalCandidates: candidatesResult.candidates.length,
  });

  return NextResponse.json(
    {
      ok: true,
      dashboard,
      hiringDecisionEngine: hiringDecisionEngine
        ? {
            previewMode: true,
            executiveMetrics: hiringDecisionEngine.executiveMetrics,
            queueCounts: {
              fastTrack: hiringDecisionEngine.fastTrackCount,
              needsReview: hiringDecisionEngine.recruiterReviewCount,
              hold: hiringDecisionEngine.holdCount,
              reject: hiringDecisionEngine.rejectCount,
              missingInformation: hiringDecisionEngine.missingInformationCount,
            },
            readinessMetrics: {
              labels: hiringDecisionEngine.readinessLabels,
              questionnaireReady: hiringDecisionEngine.questionnaireReadyCount,
              workflowReady: hiringDecisionEngine.workflowReadyCount,
              p84SendEligible: hiringDecisionEngine.p84SendEligibleCount,
              paperworkAlreadySent: hiringDecisionEngine.paperworkAlreadySentCount,
            },
            recruiterHoursSaved: hiringDecisionEngine.estimatedRecruiterHoursSaved,
          }
        : null,
      meta: {
        partialSync: candidatesResult.truncated ?? false,
        candidatesFromCache,
        candidatesFromIngestionStore: candidatesResult.ok ? candidatesResult.fromIngestionStore : false,
        totalJobs: jobsResult.jobs.length,
        totalCandidates: candidatesResult.candidates.length,
        refreshedAt: candidatesResult.fetchedAt ?? new Date().toISOString(),
        candidatesUnavailable: candidatesResult.candidates.length === 0,
        jobsAvailable: jobsResult.jobs.length > 0,
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
