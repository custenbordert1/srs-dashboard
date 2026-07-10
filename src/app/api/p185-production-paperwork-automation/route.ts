import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildP185HealthReport } from "@/lib/p185-production-paperwork-automation-runner/health";
import {
  todayConfirmedCount,
  todayFailedCount,
  todaySentUnverifiedCount,
} from "@/lib/p185-production-paperwork-automation-runner/metrics";
import { executeP185OperatorAction } from "@/lib/p185-production-paperwork-automation-runner/operator";
import type { P185OperatorAction } from "@/lib/p185-production-paperwork-automation-runner/operator";
import { loadP185RunnerState } from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import { getP184DashboardSnapshot } from "@/lib/p184-autonomous-paperwork-send-engine/dashboard";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadP1851RecoveryState } from "@/lib/p185-1-paperwork-eligibility-recovery/store";
import { loadP1852State } from "@/lib/p185-2-selected-hire-recovery/store";
import {
  executeP1853OperatorAction,
  getP1853DashboardSnapshot,
  type P1853OperatorAction,
} from "@/lib/p185-3-controlled-live-paperwork-rollout";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function loadP184Context() {
  const store = await readIngestionStore();
  const bundle = await getCandidateWorkflowBundle();
  const jobsResult = await fetchBreezyJobs("published");
  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const candidates = listIngestedCandidates(store).map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );
  const onboardingRecords = await listAllCandidateOnboardingRecords();
  const onboardingByCandidateId = new Map(
    onboardingRecords.map((record) => [record.candidateId, record] as const),
  );
  return { candidates, jobsByPositionId, onboardingByCandidateId, breezyOk: jobsResult.ok };
}

/**
 * GET — P185 health + dashboard fields for the Paperwork Automation panel.
 * POST — authorized operator controls (confirmation required for live-impacting).
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const ctx = await loadP184Context();
  const health = await buildP185HealthReport({
    breezyHealthy: ctx.breezyOk,
    breezyDetail: ctx.breezyOk ? "Breezy jobs reachable." : "Breezy jobs fetch failed.",
  });
  const state = await loadP185RunnerState();
  const snapshot = await getP184DashboardSnapshot({
    candidates: ctx.candidates,
    onboardingByCandidateId: ctx.onboardingByCandidateId,
    jobsByPositionId: ctx.jobsByPositionId,
  });
  const nowMs = Date.now();
  const recovery = await loadP1851RecoveryState();
  const recoveryStats = recovery.stats;
  const p1852 = await loadP1852State();
  const mappingCoveragePct =
    recoveryStats.evaluated > 0
      ? Math.round(
          ((recoveryStats.evaluated - recoveryStats.unresolvedJobs) / recoveryStats.evaluated) *
            1000,
        ) / 10
      : null;
  const estClearanceMinutes =
    p1852.stats.eligibleNewPackets > 0
      ? Math.ceil(p1852.stats.eligibleNewPackets / 10) * 10
      : Math.ceil(recoveryStats.eligibleNew / 10) * 10;

  return NextResponse.json({
    ok: true,
    health,
    dashboard: {
      scheduler: health.schedulerStatus,
      automationMode: health.automationMode,
      lastCycle: health.lastAttemptedCycle,
      lastSuccessfulLiveSend: health.lastLiveSendAt,
      nextExpectedRun: health.nextScheduledRunAt,
      leaseStatus: health.lease,
      queueDepth: snapshot.metrics.queueDepth,
      eligibleNow: snapshot.metrics.eligibleNow,
      sentToday: snapshot.metrics.completedToday,
      confirmedToday: todayConfirmedCount(state, nowMs),
      failedToday: Math.max(snapshot.metrics.failedToday, todayFailedCount(state, nowMs)),
      unverifiedSends: state.envelopes.filter((e) => e.state === "sent_unverified").length,
      retryBacklog: snapshot.metrics.retries,
      circuitBreaker: health.circuitBreaker,
      storageHealth: health.storage,
      breezyHealth: health.breezySource,
      dropboxSignHealth: health.dropboxSign,
      sentUnverifiedToday: todaySentUnverifiedCount(state, nowMs),
      killSwitch: health.killSwitch,
      pauseUntil: health.pauseUntil,
      existingPacketsActive: recoveryStats.activePackets,
      awaitingSignature: recoveryStats.activePackets,
      signedCompleted: recoveryStats.completedPackets,
      eligibleNewPackets: recoveryStats.eligibleNew,
      replacementReview: recoveryStats.eligibleReplacement,
      awaitingHiringApproval: recoveryStats.awaitingApproval,
      unresolvedJobMappings: recoveryStats.unresolvedJobs,
      jobMappingCoveragePct: mappingCoveragePct,
      appliedNotSelected: recoveryStats.appliedNotSelected,
      estimatedBacklogClearanceMinutes: estClearanceMinutes,
      recoveryLastRunAt: recovery.lastRecoveryAt,
      selectionEvidenceFound: p1852.stats.withAuthoritativeEvidence,
      verifiedSelectedCandidates: p1852.stats.withAuthoritativeEvidence,
      readyForPaperwork: p1852.stats.eligibleNewPackets,
      templateBlocked: p1852.stats.templateBlocked,
      selectedUnresolvedJobs: p1852.stats.unresolvedSelectedJobs,
      needsOperatorConfirmation: p1852.stats.needsOperatorConfirmation,
      p1852QueueDepth: p1852.stats.queueDepth,
      p1852ProjectedClearanceMinutes: estClearanceMinutes,
      p1852LastRunAt: p1852.lastRunAt,
      p1853: await getP1853DashboardSnapshot(),
    },
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action as string;
  const p1853Actions: P1853OperatorAction[] = [
    "final_dry_run",
    "start_canary",
    "pause_rollout",
    "resume_after_canary",
    "release_backlog_cycle",
    "kill_switch_on",
    "kill_switch_off",
    "reset_circuit",
    "reconcile_envelopes",
    "cancel_remaining_unsent",
  ];
  if (p1853Actions.includes(action as P1853OperatorAction) && body.scope === "p1853") {
    const result = await executeP1853OperatorAction({
      action: action as P1853OperatorAction,
      byUserId: guard.session.userId,
      confirmed: body.confirmed === true,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  const allowed: P185OperatorAction[] = [
    "pause",
    "resume",
    "kill_switch_on",
    "kill_switch_off",
    "circuit_open",
    "circuit_reset",
    "dry_run_cycle",
    "live_cycle",
    "reconcile",
  ];
  if (!allowed.includes(action as P185OperatorAction)) {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  const result = await executeP185OperatorAction({
    action: action as P185OperatorAction,
    byUserId: guard.session.userId,
    confirmed: body.confirmed === true,
    pauseUntil: typeof body.pauseUntil === "string" ? body.pauseUntil : null,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
