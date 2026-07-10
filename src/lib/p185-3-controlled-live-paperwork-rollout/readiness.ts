import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildJobsLookupMap } from "@/lib/breezy-global-candidates";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import {
  evaluateP184Eligibility,
  buildP184IdempotencyKey,
} from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
import { loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import { freezeP1853Cohort, blockCohortMember } from "@/lib/p185-3-controlled-live-paperwork-rollout/freeze";
import { evaluateP1853LiveGatesAsync } from "@/lib/p185-3-controlled-live-paperwork-rollout/gates";
import { loadP1853State, saveP1853State } from "@/lib/p185-3-controlled-live-paperwork-rollout/store";
import type {
  P1853ReadinessReport,
  P1853RolloutPhase,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/types";
import { P185_3_SOURCE_PHASE } from "@/lib/p185-3-controlled-live-paperwork-rollout/types";
import { setP185StorageTestFlags } from "@/lib/p185-production-paperwork-automation-runner";

export type P1853DryRunCohortResult = {
  frozenSize: number;
  stillEligible: number;
  newlyBlocked: number;
  blocked: Array<{ candidateId: string; reasons: string[] }>;
  eligibleIds: string[];
  duplicateProtections: number;
  queueDepth: number;
};

/**
 * Final dry-run against the frozen cohort only — never expands beyond frozen members.
 */
export async function runP1853FinalCohortDryRun(input?: {
  forceRefreeze?: boolean;
}): Promise<P1853DryRunCohortResult> {
  setP185StorageTestFlags({ forceDurable: true });
  const cohort = await freezeP1853Cohort({ forceRefreeze: input?.forceRefreeze });
  const store = await readIngestionStore();
  const bundle = await getCandidateWorkflowBundle();
  const [pub, closed] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyJobs("closed"),
  ]);
  const jobs = [...(pub.ok ? pub.jobs : []), ...(closed.ok ? closed.jobs : [])];
  const lookup = buildJobsLookupMap(jobs);
  const byId = new Map(
    listIngestedCandidates(store).map((c) => [c.candidateId, c] as const),
  );
  const onboarding = await listAllCandidateOnboardingRecords();
  const onboardingById = new Map(onboarding.map((r) => [r.candidateId, r] as const));
  const p184 = await loadP184EngineState();
  const completed = new Set(p184.completedIdempotencyKeys);

  const eligibleIds: string[] = [];
  const blocked: Array<{ candidateId: string; reasons: string[] }> = [];
  let duplicateProtections = 0;
  let state = await loadP1853State();
  let cohortMut = cohort;

  for (const member of cohort.members) {
    if (member.removed) continue;
    const candidate = byId.get(member.candidateId);
    if (!candidate) {
      blocked.push({ candidateId: member.candidateId, reasons: ["Candidate missing from ingestion."] });
      cohortMut = blockCohortMember(cohortMut, member.candidateId, "Missing from ingestion");
      continue;
    }
    const row = buildScoredWorkflowRow(candidate, bundle.workflows[member.candidateId], {
      job: member.resolvedPositionId
        ? lookup.get(member.resolvedPositionId)
        : lookup.get(candidate.positionId),
    });
    const overlay = {
      ...row,
      positionId: member.resolvedPositionId ?? row.positionId,
      workflowStatus: "Paperwork Needed" as const,
      stage: "Paperwork Needed",
      paperworkTemplateKey: member.templateKey,
    };
    const eligibility = evaluateP184Eligibility({
      row: overlay,
      onboarding: onboardingById.get(member.candidateId) ?? null,
      job: overlay.positionId ? lookup.get(overlay.positionId) : null,
      config: { ...p184.config, mode: "dry_run", enabled: false },
      queueItems: p184.queue.filter((q) => q.candidateId !== member.candidateId),
      completedIdempotencyKeys: completed,
      verifiedOnboardingJob: member.resolvedPositionId
        ? {
            positionId: member.resolvedPositionId,
            acceptingForOnboarding: true,
            classification: "historical_valid_for_onboarding",
            detail: "P185.3 frozen cohort onboarding assignment",
          }
        : null,
    });

    // Extra freeze-time duplicate checks
    if (row.signatureRequestId || row.paperworkSentAt || row.paperworkStatus === "sent" || row.paperworkStatus === "signed") {
      duplicateProtections += 1;
      blocked.push({
        candidateId: member.candidateId,
        reasons: ["Active or completed packet appeared after freeze."],
      });
      cohortMut = blockCohortMember(
        cohortMut,
        member.candidateId,
        "Packet present after freeze",
      );
      continue;
    }

    const idem = buildP184IdempotencyKey({
      candidateId: member.candidateId,
      templateKey: (member.templateKey || "onboarding_packet") as OnboardingTemplateKey,
      positionId: member.resolvedPositionId,
    });
    if (completed.has(idem) || completed.has(member.idempotencyKey)) {
      duplicateProtections += 1;
      blocked.push({ candidateId: member.candidateId, reasons: ["Idempotency key already completed."] });
      cohortMut = blockCohortMember(cohortMut, member.candidateId, "Idempotency completed");
      continue;
    }

    if (!eligibility.eligible) {
      blocked.push({ candidateId: member.candidateId, reasons: eligibility.rejectionReasons });
      cohortMut = blockCohortMember(
        cohortMut,
        member.candidateId,
        eligibility.rejectionReasons.join("; "),
      );
      continue;
    }

    eligibleIds.push(member.candidateId);
  }

  state = await loadP1853State();
  state.cohort = cohortMut;
  state.lastDryRun = {
    at: new Date().toISOString(),
    frozenSize: cohort.approvedCount,
    stillEligible: eligibleIds.length,
    newlyBlocked: blocked.length,
    queueDepth: p184.queue.filter((q) => q.status === "queued").length,
  };
  state.totals.newlyBlocked = blocked.length;
  state.totals.duplicatesPrevented += duplicateProtections;
  state.backlog.remaining = eligibleIds.length;
  await saveP1853State(state);

  return {
    frozenSize: cohort.approvedCount,
    stillEligible: eligibleIds.length,
    newlyBlocked: blocked.length,
    blocked,
    eligibleIds,
    duplicateProtections,
    queueDepth: p184.queue.filter((q) => q.status === "queued").length,
  };
}

export async function buildP1853ReadinessReport(input?: {
  authorizeCanary?: boolean;
  forceRefreeze?: boolean;
}): Promise<P1853ReadinessReport> {
  setP185StorageTestFlags({ forceDurable: true });
  const dryRun = await runP1853FinalCohortDryRun({ forceRefreeze: input?.forceRefreeze });
  const { gates, blockers, setupInstructions } = await evaluateP1853LiveGatesAsync({
    authorizeCanary: input?.authorizeCanary,
  });
  const state = await loadP1853State();

  const configBlockers = [...blockers];
  // Readiness for *starting canary* also needs P184 live — listed as setup, not always hard-stop for dry-run report
  const liveReady =
    configBlockers.length === 0 &&
    gates.p184EnabledForLive &&
    gates.p184ModeLive &&
    dryRun.stillEligible > 0 &&
    !state.killSwitch &&
    !state.circuitOpen;

  const canaryMayExecute = liveReady && Boolean(input?.authorizeCanary);

  let phase: P1853RolloutPhase = state.phase;
  if (configBlockers.length > 0 || !gates.cronSecretConfigured) {
    phase = "awaiting_configuration";
  } else if (!liveReady) {
    phase = "awaiting_canary";
  } else if (state.canary.passed) {
    phase = state.backlog.remaining > 0 ? "backlog_releasing" : "backlog_complete";
  } else {
    phase = "awaiting_canary";
  }

  state.phase = phase;
  state.nextScheduledAction = canaryMayExecute
    ? "Execute five-candidate canary."
    : setupInstructions[0] ?? "Complete configuration gates before canary.";
  await saveP1853State(state);

  return {
    phase: P185_3_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    rolloutId: state.cohort?.rolloutId ?? null,
    frozenCohortCount: dryRun.frozenSize,
    dryRun: state.lastDryRun,
    gates,
    liveReady,
    canaryMayExecute,
    blockers: [
      ...configBlockers,
      ...(!gates.p184EnabledForLive || !gates.p184ModeLive
        ? ["P184 is not enabled in live mode (required for canary execution)."]
        : []),
      ...(dryRun.stillEligible === 0 ? ["No candidates remain eligible in frozen cohort."] : []),
    ],
    setupInstructions,
    rolloutPhase: phase,
    warnings: [
      "Live sending will not run unless all gates pass and canary is explicitly authorized.",
      "The 78 likely-selected candidates remain excluded from this frozen cohort.",
      `Final dry-run: ${dryRun.stillEligible}/${dryRun.frozenSize} still eligible; ${dryRun.newlyBlocked} newly blocked.`,
    ],
  };
}
