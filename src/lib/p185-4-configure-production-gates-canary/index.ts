/**
 * P185.4 — Production gate configuration + authorized five-candidate canary.
 * Never invents or logs secrets. Fail-closed when any gate is missing.
 */
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import {
  loadP184EngineState,
  updateP184Config,
} from "@/lib/p184-autonomous-paperwork-send-engine/store";
import type { P184EngineConfig } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import {
  authenticateP185CronRequest,
  getP185StorageHealth,
  isP185SchedulerAuthConfigured,
  loadP185RunnerState,
  p185DataDir,
} from "@/lib/p185-production-paperwork-automation-runner";
import { executeP1853Canary } from "@/lib/p185-3-controlled-live-paperwork-rollout/canary";
import {
  buildP1853ReadinessReport,
  runP1853FinalCohortDryRun,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/readiness";
import { formatP1853ReadinessMarkdown } from "@/lib/p185-3-controlled-live-paperwork-rollout/report";
import { loadP1853State, saveP1853State } from "@/lib/p185-3-controlled-live-paperwork-rollout/store";
import {
  writeP1853OperatorLocalReport,
  writeP1853PublicArtifacts,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/artifacts";
import type { P1853ReadinessReport } from "@/lib/p185-3-controlled-live-paperwork-rollout/types";
import {
  evaluateProductionStorageGate,
  isProductionStorageConfirmedEnv,
  isVercelRuntimeEnv,
  type ProductionStoragePathClassification,
} from "@/lib/p185-4-configure-production-gates-canary/storageGate";

export {
  evaluateProductionStorageGate,
  isProductionStorageConfirmedEnv,
  isVercelRuntimeEnv,
} from "@/lib/p185-4-configure-production-gates-canary/storageGate";

export const P185_4_SOURCE_PHASE = "P185.4";
export const P185_4_OPERATOR = "P185.4 Configure Gates + Canary";

export type P1854ConfigAudit = {
  actor: string;
  timestamp: string;
  previous: { enabled: boolean; mode: string };
  next: { enabled: boolean; mode: string };
  rolloutId: string | null;
  authorizationSource: string;
};

export type P1854ProductionGateReport = {
  phase: typeof P185_4_SOURCE_PHASE;
  generatedAt: string;
  rolloutId: string | null;
  environment: {
    vercel: boolean;
    vercelEnv: string | null;
    nodeEnv: string | null;
    intendedProduction: boolean;
  };
  storage: {
    adapter: string;
    durable: boolean;
    healthy: boolean;
    dataDir: string;
    pathClassification: ProductionStoragePathClassification;
    productionStorageConfirmed: boolean;
    approvedForLiveSend: boolean;
    detail: string;
  };
  cronSecretConfigured: boolean;
  cronAuthProbePassed: boolean | null;
  productionAutomationEnabled: boolean;
  dropboxSignConfigured: boolean;
  templateConfigured: boolean;
  p184: { enabled: boolean; mode: string };
  killSwitchOff: boolean;
  circuitClosed: boolean;
  leaseAcquirable: boolean;
  schedulerConfigured: boolean;
  liveReady: boolean;
  canaryMayExecute: boolean;
  blockers: string[];
  setupInstructions: string[];
  configAudits: P1854ConfigAudit[];
};

export function probeCronAuthentication(): boolean | null {
  if (!isP185SchedulerAuthConfigured()) return null;
  const secret = process.env.P185_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) return null;
  const result = authenticateP185CronRequest(
    new Request("http://localhost/api/cron/p185-paperwork-automation", {
      headers: { Authorization: `Bearer ${secret}` },
    }),
  );
  return result.ok;
}

export async function buildP1854ProductionGateReport(input?: {
  authorizeCanary?: boolean;
}): Promise<P1854ProductionGateReport> {
  const state = await loadP1853State();
  const p184 = await loadP184EngineState();
  const p185 = await loadP185RunnerState();
  const storage = getP185StorageHealth();
  const storageGate = evaluateProductionStorageGate({ storage });
  const cronConfigured = isP185SchedulerAuthConfigured();
  const cronAuth = probeCronAuthentication();
  const prodFlag = process.env.P185_PRODUCTION_AUTOMATION_ENABLED === "1";
  const dropbox = Boolean(readDropboxSignConfig());
  const template = Boolean(process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET?.trim());
  const vercel = isVercelRuntimeEnv();

  const blockers: string[] = [...storageGate.blockers];
  const setup: string[] = [...storageGate.setup];

  if (!cronConfigured) {
    blockers.push("CRON_SECRET / P185_CRON_SECRET is not configured.");
    setup.push(
      "Add CRON_SECRET (or P185_CRON_SECRET) via deployment secrets — never commit it.",
      "Vercel: Project → Settings → Environment Variables → Production → add CRON_SECRET = <operator-supplied-secret> (Encrypt).",
      'Local: CRON_SECRET="<operator-supplied-secret>" in .env.local (operator supplies the value; do not use an example in production).',
      "Cron auth header: Authorization: Bearer <secret> (never a query parameter).",
    );
  } else if (cronAuth === false) {
    blockers.push("Cron authentication probe failed with the configured secret.");
  }

  if (!prodFlag) {
    blockers.push("P185_PRODUCTION_AUTOMATION_ENABLED is not set to 1.");
    setup.push(
      "Set P185_PRODUCTION_AUTOMATION_ENABLED=1 in the same environment that will run the canary (Vercel Production env or .env.local for intentional local canary).",
    );
  }

  if (!dropbox) {
    blockers.push("Dropbox Sign credentials are missing.");
    setup.push("Configure DROPBOX_SIGN_API_KEY in deployment secrets.");
  }
  if (!template) {
    blockers.push("Required Dropbox Sign template env is missing.");
    setup.push("Configure DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET.");
  }
  if (p185.safety.killSwitch) blockers.push("Kill switch is active.");
  if (p185.circuit.open || state.circuitOpen) blockers.push("Circuit breaker is open.");
  if (state.killSwitch) blockers.push("P185.3 kill switch is active.");

  const leaseHeld = Boolean(p185.lease && Date.parse(p185.lease.expiresAt) > Date.now());
  if (leaseHeld) {
    blockers.push("Execution lease is currently held by another runner.");
  }

  const p184Live = p184.config.enabled && p184.config.mode === "live";
  const configReady =
    blockers.length === 0 &&
    storageGate.approvedForLiveSend &&
    cronConfigured &&
    cronAuth !== false &&
    prodFlag &&
    dropbox &&
    template;

  const liveReady = configReady && p184Live && !state.killSwitch && !state.circuitOpen;
  const canaryMayExecute = liveReady && Boolean(input?.authorizeCanary);

  return {
    phase: P185_4_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    rolloutId: state.cohort?.rolloutId ?? null,
    environment: {
      vercel,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      nodeEnv: process.env.NODE_ENV ?? null,
      intendedProduction: vercel || isProductionStorageConfirmedEnv(),
    },
    storage: {
      adapter: storage.adapter,
      durable: storage.durable,
      healthy: storage.healthy,
      dataDir: storage.dataDir || p185DataDir(),
      pathClassification: storageGate.pathClassification,
      productionStorageConfirmed: isProductionStorageConfirmedEnv(),
      approvedForLiveSend: storageGate.approvedForLiveSend,
      detail: storage.detail,
    },
    cronSecretConfigured: cronConfigured,
    cronAuthProbePassed: cronAuth,
    productionAutomationEnabled: prodFlag,
    dropboxSignConfigured: dropbox,
    templateConfigured: template,
    p184: { enabled: p184.config.enabled, mode: p184.config.mode },
    killSwitchOff: !p185.safety.killSwitch && !state.killSwitch,
    circuitClosed: !p185.circuit.open && !state.circuitOpen,
    leaseAcquirable: !leaseHeld,
    schedulerConfigured: cronConfigured && prodFlag,
    liveReady,
    canaryMayExecute,
    blockers: [
      ...blockers,
      ...(!p184Live
        ? [
            "P184 is not enabled in live mode (set only after final dry-run passes and gates are complete).",
          ]
        : []),
    ],
    setupInstructions: setup,
    configAudits: [],
  };
}

export async function enableP184Authorized(input: {
  enabled: boolean;
  mode: "dry_run" | "live";
  actor: string;
  authorizationSource: string;
}): Promise<{ config: P184EngineConfig; audit: P1854ConfigAudit }> {
  const before = await loadP184EngineState();
  const state1853 = await loadP1853State();
  const saved = await updateP184Config({
    enabled: input.enabled,
    mode: input.mode,
  });
  const audit: P1854ConfigAudit = {
    actor: input.actor,
    timestamp: new Date().toISOString(),
    previous: { enabled: before.config.enabled, mode: before.config.mode },
    next: { enabled: saved.config.enabled, mode: saved.config.mode },
    rolloutId: state1853.cohort?.rolloutId ?? null,
    authorizationSource: input.authorizationSource,
  };
  return { config: saved.config, audit };
}

export type P1854RunResult = {
  stoppedBeforeSend: boolean;
  gateReport: P1854ProductionGateReport;
  readiness: P1853ReadinessReport | null;
  dryRun: {
    frozenSize: number;
    stillEligible: number;
    newlyBlocked: number;
    queueDepth: number;
  } | null;
  configAudits: P1854ConfigAudit[];
  canary: {
    authorized: boolean;
    actor: string | null;
    attempted: number;
    confirmed: number;
    sentUnverified: number;
    failed: number;
    passed: boolean;
    paused: boolean;
    skippedReason: string | null;
  };
  remainingQueue: number;
  rolloutState: string;
  nextAction: string;
  artifactPaths: string[];
};

/**
 * P185.4 orchestration:
 * 1) validate gates
 * 2) enable P184 dry_run via authorized config path
 * 3) final cohort dry-run
 * 4) if gates + authorizeCanary: flip P184 live and run ≤5 canary sends
 * 5) never release remaining backlog
 */
export async function runP1854ConfigureAndCanary(input: {
  authorizeCanary: boolean;
  actor: string;
  authorizationSource: string;
}): Promise<P1854RunResult> {
  const audits: P1854ConfigAudit[] = [];
  const artifactPaths: string[] = [];

  const dryEnable = await enableP184Authorized({
    enabled: true,
    mode: "dry_run",
    actor: input.actor,
    authorizationSource: input.authorizationSource,
  });
  audits.push(dryEnable.audit);

  const dry = await runP1853FinalCohortDryRun({ forceRefreeze: false });
  const readiness = await buildP1853ReadinessReport({
    authorizeCanary: input.authorizeCanary,
  });
  const gateReport = await buildP1854ProductionGateReport({
    authorizeCanary: input.authorizeCanary,
  });
  gateReport.configAudits = audits;

  const markdown = formatP1853ReadinessMarkdown(readiness);
  const written = await writeP1853PublicArtifacts({ readiness, markdown });
  artifactPaths.push(
    written.readinessJson,
    written.readinessMd,
    written.summaryJson,
    written.reconciliationJson,
  );
  const op = await writeP1853OperatorLocalReport({
    readiness,
    dryRunBlocked: [],
  });
  artifactPaths.push(op);

  const dryPass =
    dry.frozenSize === 25 &&
    dry.stillEligible > 0 &&
    dry.stillEligible === 25 - dry.newlyBlocked;

  const configBlockers = gateReport.blockers.filter(
    (b) => !b.includes("P184 is not enabled in live mode"),
  );

  if (configBlockers.length > 0 || !dryPass) {
    const state = await loadP1853State();
    state.phase = "awaiting_configuration";
    state.nextScheduledAction = configBlockers[0] ?? "Fix dry-run blockers before canary.";
    await saveP1853State(state);

    return {
      stoppedBeforeSend: true,
      gateReport,
      readiness,
      dryRun: {
        frozenSize: dry.frozenSize,
        stillEligible: dry.stillEligible,
        newlyBlocked: dry.newlyBlocked,
        queueDepth: dry.queueDepth,
      },
      configAudits: audits,
      canary: {
        authorized: false,
        actor: null,
        attempted: 0,
        confirmed: 0,
        sentUnverified: 0,
        failed: 0,
        passed: false,
        paused: false,
        skippedReason: configBlockers.join(" ") || "Final dry-run did not pass.",
      },
      remainingQueue: dry.stillEligible,
      rolloutState: "awaiting_configuration",
      nextAction: gateReport.setupInstructions[0] ?? "Complete missing production gates.",
      artifactPaths,
    };
  }

  if (!input.authorizeCanary) {
    const state = await loadP1853State();
    state.phase = "awaiting_canary";
    state.nextScheduledAction =
      "Gates ready for canary — re-run with --authorize-canary or use dashboard Start five-candidate canary.";
    await saveP1853State(state);

    return {
      stoppedBeforeSend: true,
      gateReport,
      readiness,
      dryRun: {
        frozenSize: dry.frozenSize,
        stillEligible: dry.stillEligible,
        newlyBlocked: dry.newlyBlocked,
        queueDepth: dry.queueDepth,
      },
      configAudits: audits,
      canary: {
        authorized: false,
        actor: null,
        attempted: 0,
        confirmed: 0,
        sentUnverified: 0,
        failed: 0,
        passed: false,
        paused: false,
        skippedReason: "Explicit canary authorization required.",
      },
      remainingQueue: dry.stillEligible,
      rolloutState: "awaiting_canary",
      nextAction:
        "Authorize canary: npx tsx scripts/p185-4-configure-and-canary.ts --authorize-canary",
      artifactPaths,
    };
  }

  const liveEnable = await enableP184Authorized({
    enabled: true,
    mode: "live",
    actor: input.actor,
    authorizationSource: `${input.authorizationSource}:post-dry-run-live`,
  });
  audits.push(liveEnable.audit);

  const canary = await executeP1853Canary({
    authorizeCanary: true,
    confirmed: true,
    maxSends: 5,
  });

  const state = await loadP1853State();
  if (canary.passed) {
    state.phase = "canary_passed_awaiting_backlog";
    state.nextScheduledAction =
      "Canary Passed — Awaiting Backlog Authorization. Do not release remaining 20 without separate operator decision.";
  } else if (canary.executed && (canary.paused || canary.failed > 0)) {
    state.phase = "canary_failed_paused";
    state.nextScheduledAction =
      "Canary Failed — Rollout Paused. Investigate before any further sends.";
  } else if (!canary.executed) {
    const revert = await enableP184Authorized({
      enabled: true,
      mode: "dry_run",
      actor: input.actor,
      authorizationSource: `${input.authorizationSource}:canary-skipped-revert`,
    });
    audits.push(revert.audit);
    state.phase = "awaiting_configuration";
    state.nextScheduledAction = canary.skippedReason ?? "Canary did not execute.";
  }
  await saveP1853State(state);

  const postReadiness = await buildP1853ReadinessReport({ authorizeCanary: false });
  const postWritten = await writeP1853PublicArtifacts({
    readiness: postReadiness,
    markdown: formatP1853ReadinessMarkdown(postReadiness),
  });
  artifactPaths.push(
    postWritten.readinessJson,
    postWritten.summaryJson,
    postWritten.reconciliationJson,
  );

  return {
    stoppedBeforeSend: !canary.executed,
    gateReport: await buildP1854ProductionGateReport({ authorizeCanary: true }),
    readiness: postReadiness,
    dryRun: {
      frozenSize: dry.frozenSize,
      stillEligible: dry.stillEligible,
      newlyBlocked: dry.newlyBlocked,
      queueDepth: dry.queueDepth,
    },
    configAudits: audits,
    canary: {
      authorized: true,
      actor: input.actor,
      attempted: canary.attempted,
      confirmed: canary.confirmed,
      sentUnverified: canary.sentUnverified,
      failed: canary.failed,
      passed: canary.passed,
      paused: canary.paused,
      skippedReason: canary.skippedReason,
    },
    remainingQueue: canary.remainingEligible,
    rolloutState: state.phase,
    nextAction: state.nextScheduledAction ?? "Review canary results.",
    artifactPaths,
  };
}
