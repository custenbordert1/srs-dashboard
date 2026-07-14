import { loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import { evaluateP184Eligibility } from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
import { loadLiveP185Candidates } from "@/lib/p185-production-paperwork-automation-runner/candidateSource";
import {
  getP185StorageHealth,
  loadP185RunnerState,
  setP185StorageTestFlags,
} from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import { reconcileP185Envelopes } from "@/lib/p185-production-paperwork-automation-runner/reconciliation";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { isOnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import { evaluateP192Eligibility } from "@/lib/p192-supervised-paperwork-runner/eligibility";
import {
  applyP192ProductionDropboxEnv,
  assertProductionTestModeOff,
  readP192DropboxTestMode,
  storageHealthSummary,
} from "@/lib/p192-supervised-paperwork-runner/productionMode";
import type { P192PreflightResult } from "@/lib/p192-supervised-paperwork-runner/types";

export async function runP192Preflight(input?: {
  skipDryScan?: boolean;
}): Promise<P192PreflightResult> {
  const checkedAt = new Date().toISOString();
  applyP192ProductionDropboxEnv();
  setP185StorageTestFlags({ forceDurable: true });

  const storage = storageHealthSummary();
  const p184 = await loadP184EngineState();
  const p185 = await loadP185RunnerState();
  const testModeGate = assertProductionTestModeOff();

  const gates = [
    {
      id: "dropbox_configured",
      ok: testModeGate.testMode !== null,
      detail: testModeGate.testMode === null ? "Dropbox Sign not configured" : "configured",
    },
    {
      id: "test_mode_false",
      ok: testModeGate.ok,
      detail: testModeGate.detail,
    },
    {
      id: "storage_healthy",
      ok: storage.healthy && storage.durable,
      detail: storage.detail,
    },
    {
      id: "neon_or_durable",
      ok: storage.durable || Boolean(process.env.DATABASE_URL?.trim()),
      detail: process.env.DATABASE_URL?.trim()
        ? "DATABASE_URL present"
        : storage.detail,
    },
    {
      id: "circuit_closed",
      ok: !p185.circuit.open,
      detail: p185.circuit.open ? `open: ${p185.circuit.reason}` : "closed",
    },
    {
      id: "kill_switch_off",
      ok: !p185.safety.killSwitch,
      detail: p185.safety.killSwitch ? "kill switch on" : "off",
    },
    {
      id: "p184_rate_limits",
      ok:
        p184.config.rateLimits.maxPerMinute <= 4 &&
        p184.config.rateLimits.maxPerHour <= 40 &&
        p184.config.rateLimits.maxPerDay <= 200,
      detail: JSON.stringify(p184.config.rateLimits),
    },
  ];

  let dryRun: P192PreflightResult["dryRun"] = null;
  if (!input?.skipDryScan) {
    const source = await loadLiveP185Candidates({
      cursor: {
        watermark: null,
        continuationToken: null,
        lastFullReconciliationAt: null,
        candidatesScannedTotal: 0,
      },
      maxCandidates: 500,
      fullReconciliationIntervalMs: 10 * 60 * 1000,
    });
    const workflows = await getCandidateWorkflowState();
    const completed = new Set(p184.completedIdempotencyKeys);
    let evaluated = 0;
    let eligible = 0;
    let duplicateRisks = 0;
    let templatesReady = true;

    for (const row of source.candidates) {
      if (row.workflowStatus !== "Paperwork Needed") continue;
      evaluated += 1;
      const result = evaluateP192Eligibility({
        row,
        workflow: workflows[row.candidateId],
        onboarding: source.onboardingByCandidateId.get(row.candidateId) ?? null,
        job: row.positionId ? source.jobsByPositionId.get(row.positionId) : null,
        config: { ...p184.config, mode: "dry_run", enabled: true },
        queueItems: p184.queue,
        completedIdempotencyKeys: completed,
      });
      if (result.eligible) eligible += 1;
      if (result.blockers.some((b) => /duplicate|idempotency|envelope/i.test(b))) {
        duplicateRisks += 1;
      }
      if (result.templateKey && !isOnboardingTemplateKey(result.templateKey)) {
        templatesReady = false;
      }
    }

    // Also count pure P184 eligible overlay for template readiness check
    for (const row of source.candidates.filter((r) => r.workflowStatus === "Paperwork Needed")) {
      const e = evaluateP184Eligibility({
        row,
        onboarding: source.onboardingByCandidateId.get(row.candidateId) ?? null,
        job: row.positionId ? source.jobsByPositionId.get(row.positionId) : null,
        config: p184.config,
        queueItems: p184.queue,
        completedIdempotencyKeys: completed,
        verifiedOnboardingJob: row.positionId
          ? {
              positionId: row.positionId,
              acceptingForOnboarding: true,
              classification: "p192_preflight",
              detail: "preflight",
            }
          : null,
      });
      if (e.eligible && !e.templateKey) templatesReady = false;
    }

    const reconciliation = await reconcileP185Envelopes({ limit: 200 });
    const unresolved = reconciliation.checked; // soft
    void getP185StorageHealth;

    dryRun = {
      evaluated,
      eligible,
      duplicateRisks,
      unresolvedOperations: unresolved,
      templatesReady,
      predictedRealSends: Math.min(10, eligible),
    };

    gates.push({
      id: "dry_scan_completed",
      ok: true,
      detail: `evaluated=${evaluated} eligible=${eligible} predicted=${dryRun.predictedRealSends}`,
    });
  }

  const abortReasons = gates.filter((g) => !g.ok).map((g) => `${g.id}: ${g.detail}`);
  return {
    ok: abortReasons.length === 0,
    checkedAt,
    gates,
    abortReasons,
    testMode: readP192DropboxTestMode(),
    p184Mode: p184.config.mode,
    productionModeConfirmed: testModeGate.ok,
    dryRun,
  };
}
