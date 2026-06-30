import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { findActiveOnboardingRecord } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { executeControlledLiveSend } from "@/lib/controlled-live-send";
import {
  autoRepairCandidatePaperwork,
  buildOwnershipIndex,
} from "@/lib/p106-autonomous-paperwork-engine/auto-repair-candidate-paperwork";
import { buildAutonomousPaperworkReport } from "@/lib/p106-autonomous-paperwork-engine/build-autonomous-paperwork-report";
import type {
  AutonomousPaperworkRunMode,
  AutonomousPaperworkRunResult,
} from "@/lib/p106-autonomous-paperwork-engine/types";
import { P106_DEFAULT_MODE } from "@/lib/p106-autonomous-paperwork-engine/types";

async function autoRepairRepairableCandidates(input: {
  candidateIds: string[];
  mtdOnly: boolean;
  approvedBy: string;
  approvedByUserId: string;
}): Promise<Set<string>> {
  const repaired = new Set<string>();

  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );

  const [store, bundle, jobsResult, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const onboardingByCandidateId = new Map(onboardingRecords.map((r) => [r.candidateId, r]));

  const range = currentMtdDateRange();
  const ingested =
    input.mtdOnly === false
      ? listIngestedCandidates(store)
      : filterMtdCandidates(listIngestedCandidates(store), range);
  const ownership = buildOwnershipIndex(bundle.workflows, ingested);

  const report = await buildAutonomousPaperworkReport({ mtdOnly: input.mtdOnly, mode: "dryRun" });

  for (const candidateId of input.candidateIds) {
    const entry = report.candidates.find((c) => c.candidateId === candidateId);
    if (!entry?.autoRepairable) continue;

    const candidate = store.candidates[candidateId];
    if (!candidate) continue;

    const row = buildScoredWorkflowRow(candidate, bundle.workflows[candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    });

    const result = await autoRepairCandidatePaperwork({
      candidateId,
      candidate,
      row,
      workflow: bundle.workflows[candidateId],
      jobsByPositionId,
      onboarding: onboardingByCandidateId.get(candidateId) ?? null,
      rosters: bundle.rosters,
      ownership,
      approvedBy: input.approvedBy,
      approvedByUserId: input.approvedByUserId,
    });

    if (result.repaired) {
      repaired.add(candidateId);
    }
  }

  return repaired;
}

export async function runAutonomousPaperworkEngine(input?: {
  mode?: AutonomousPaperworkRunMode;
  mtdOnly?: boolean;
  executiveApprovalFlag?: boolean;
  byUserId?: string;
  approvedBy?: string;
  approvedByUserId?: string;
}): Promise<AutonomousPaperworkRunResult> {
  const mode = input?.mode ?? P106_DEFAULT_MODE;
  const mtdOnly = input?.mtdOnly !== false;
  const warnings: string[] = [
    "P106 — no executeBatch; controlled executeOne only.",
    "No Breezy writes.",
    mode === "dryRun" ? "dryRun — no sends." : `Live mode: ${mode}.`,
  ];

  if (mode === "dryRun") {
    const report = await buildAutonomousPaperworkReport({ mtdOnly, mode });
    return {
      ok: true,
      mode,
      stoppedEarly: false,
      stopReason: null,
      sendsThisRun: 0,
      report,
      warnings,
    };
  }

  const initial = await buildAutonomousPaperworkReport({ mtdOnly, mode });
  const repairTargets = initial.candidates
    .filter((c) => c.autoRepairable && c.category === "blocked")
    .map((c) => c.candidateId);

  const autoRepairedIds = await autoRepairRepairableCandidates({
    candidateIds: repairTargets,
    mtdOnly,
    approvedBy: input?.approvedBy ?? "P106 Autonomous Paperwork Engine",
    approvedByUserId: input?.approvedByUserId ?? input?.byUserId ?? "p106-engine",
  });

  if (autoRepairedIds.size > 0) {
    warnings.push(`Auto-repaired ${autoRepairedIds.size} candidate(s) — P97 audit + rollback written.`);
  }

  let sendsThisRun = 0;
  let stoppedEarly = false;
  let stopReason: string | null = null;

  const maxSends = mode === "executeOne" ? 1 : Number.POSITIVE_INFINITY;

  while (sendsThisRun < maxSends) {
    const report = await buildAutonomousPaperworkReport({
      mtdOnly,
      mode,
      autoRepairedIds,
    });

    const next = report.readyToSend[0];
    if (!next) break;

    const dryRun = await executeControlledLiveSend({
      mode: "dryRun",
      candidateId: next.candidateId,
      mtdOnly,
    });
    const dryEntry = dryRun.executed.find((e) => e.candidateId === next.candidateId);
    if (dryEntry?.outcome !== "simulated") {
      stoppedEarly = true;
      stopReason = dryEntry?.error ?? "dryRun gate failed.";
      break;
    }

    const live = await executeControlledLiveSend({
      mode: "executeOne",
      executiveApprovalFlag: input?.executiveApprovalFlag ?? true,
      candidateId: next.candidateId,
      byUserId: input?.byUserId,
      mtdOnly,
    });

    const sent = live.executed.find(
      (e) => e.candidateId === next.candidateId && e.outcome === "sent",
    );
    if (!sent?.signatureRequestId?.trim()) {
      stoppedEarly = true;
      stopReason =
        live.executed.find((e) => e.candidateId === next.candidateId)?.error ??
        live.stopReason ??
        "Send failed — no signatureRequestId.";
      break;
    }

    const workflow = (await getCandidateWorkflowBundle()).workflows[next.candidateId];
    const onboarding = await findActiveOnboardingRecord(next.candidateId);
    if (workflow?.workflowStatus !== "Paperwork Sent" || onboarding?.status !== "sent") {
      stoppedEarly = true;
      stopReason = "Post-send verification failed — workflow or onboarding status mismatch.";
      break;
    }

    sendsThisRun += 1;
    warnings.push(
      `Sent ${next.candidateName} — sig ${sent.signatureRequestId.slice(0, 12)}…`,
    );

    if (mode === "executeOne") break;
    if (live.stoppedEarly) {
      stoppedEarly = true;
      stopReason = live.stopReason;
      break;
    }
  }

  const finalReport = await buildAutonomousPaperworkReport({
    mtdOnly,
    mode,
    autoRepairedIds,
    runSummary: stoppedEarly
      ? `Stopped: ${stopReason}`
      : `Completed ${sendsThisRun} send(s) via ${mode}.`,
  });

  return {
    ok: !stoppedEarly || sendsThisRun > 0,
    mode,
    stoppedEarly,
    stopReason,
    sendsThisRun,
    report: finalReport,
    warnings,
  };
}
