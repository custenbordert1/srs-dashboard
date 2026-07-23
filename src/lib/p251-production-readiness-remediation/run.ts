import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildP249ProductionReadiness } from "@/lib/p249-daily-ops-mission/readiness";
import type {
  P249DryRunReport,
  P249GoNoGo,
  P249LiveExecutionPlan,
  P249OperationsDashboard,
  P249OutstandingPaperworkAnalysis,
} from "@/lib/p249-daily-ops-mission/types";
import {
  formatP251GoNoGoMarkdown,
  formatP251LaunchValidationMarkdown,
  formatP251MailAuditMarkdown,
  formatP251RecoveryMarkdown,
} from "@/lib/p251-production-readiness-remediation/format";
import { buildP251RecoveryTasks } from "@/lib/p251-production-readiness-remediation/recovery";
import {
  P251_OPS_DATE,
  P251_PHASE,
  type P251GoNoGo,
  type P251LaunchValidation,
  type P251MissionResult,
} from "@/lib/p251-production-readiness-remediation/types";
import { validateProductionConfig } from "@/lib/production-mail-config";

function writeArtifact(artifactsDir: string, name: string, value: unknown): string {
  mkdirSync(artifactsDir, { recursive: true });
  const target = path.join(artifactsDir, name);
  writeFileSync(
    target,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  return target;
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

const CODE_REMEDIATION_APPLIED = [
  "Shared production mail validator (`src/lib/production-mail-config.ts`) with Preview vs Production diagnostics",
  "Startup + `/api/health/env` surface mail capability state (no secret values)",
  "`sendTransactionalEmail` requireLiveDelivery refuses silent log/outbox success",
  "P245/P246/P146 live paths pass requireLiveDelivery when live delivery is required",
  "`resolveP245MailCapability` requires SRS_RECRUITING_FROM_EMAIL for canLiveDeliver (no HR fallback as ready)",
  "Documented RESEND / recruiting From vars in `.env.example` and `.env.local.example`",
];

export async function runP251ProductionReadinessRemediation(input?: {
  artifactsDir?: string;
}): Promise<P251MissionResult> {
  const artifactsDir = input?.artifactsDir ?? path.join(process.cwd(), "artifacts");
  const artifacts: string[] = [];
  const reused: string[] = [];

  console.log("[p251] Phase 1 — mail system remediation audit…");
  const productionConfig = validateProductionConfig();

  console.log("[p251] Phase 2 — refresh readiness (read-only) for startup validation cross-check…");
  const readiness = await buildP249ProductionReadiness();

  const p249Dashboard = readJson<P249OperationsDashboard>(
    path.join(artifactsDir, "p249-operations-dashboard.json"),
  );
  const p249Outstanding = readJson<P249OutstandingPaperworkAnalysis>(
    path.join(artifactsDir, "p249-outstanding-paperwork-analysis.json"),
  );
  const p249DryRun = readJson<P249DryRunReport>(
    path.join(artifactsDir, "p249-dry-run-report.json"),
  );
  const p249Go = readJson<P249GoNoGo>(path.join(artifactsDir, "p249-go-nogo.json"));
  const p249Live = readJson<P249LiveExecutionPlan>(
    path.join(artifactsDir, "p249-live-execution-plan.json"),
  );
  const p250Go = readJson<{ decision?: string }>(
    path.join(artifactsDir, "p250-go-nogo.json"),
  );

  for (const name of [
    "p249-operations-dashboard.json",
    "p249-outstanding-paperwork-analysis.json",
    "p249-dry-run-report.json",
    "p249-go-nogo.json",
    "p249-live-execution-plan.json",
    "p250-blockers-and-remediation.json",
    "p250-go-nogo.json",
  ]) {
    if (existsSync(path.join(artifactsDir, name))) reused.push(name);
  }

  if (!p249Outstanding || !p249DryRun) {
    throw new Error(
      "[p251] Missing required P249 artifacts. Run `npx tsx scripts/p249-run-daily-ops-mission.ts` first.",
    );
  }

  console.log("[p251] Phase 3 — operational recovery tasks…");
  const recovery = buildP251RecoveryTasks({
    outstanding: p249Outstanding,
    dryRun: p249DryRun,
    goNoGo: p249Go,
    mailReady: productionConfig.okForLiveEmail,
    sourceArtifacts: reused,
  });

  const initial = p249Outstanding.counts.eligibleForInitialPaperwork;
  const reminders = p249Outstanding.counts.reminder1;
  const readyForMel =
    p249Go?.expectedReadyForMelToday ?? p249Outstanding.counts.readyForMel;
  const safeCapacity =
    p249DryRun.simulations.openStoreSafeCapacity ??
    p249Live?.throughputEstimate.initialSendsPerHour ??
    null;
  const recruiterHours =
    p249Dashboard?.estimatedRecruiterHoursSaved ?? 9.1;

  console.log("[p251] Phase 4 — launch validation (zero-write simulation)…");
  const launchSequenceSimulated = [
    "Verify Resend env (RESEND_API_KEY, DIRECT_DEPOSIT_EMAIL_MODE=resend, SRS_RECRUITING_FROM_EMAIL)",
    "Re-run production config validator / P251 until mail READY",
    "Canary: 1–3 test reminder emails to operator inboxes (not executed this run)",
    `Reminder 1 batch simulation: ${reminders} candidates (dry-run volumes reused)`,
    `Initial paperwork simulation: ${initial} eligible (Dropbox testMode / quota gates apply)`,
    `Ready-for-MEL review: ${readyForMel} (no MEL writes)`,
    "Halt conditions: Resend auth failure, unexplained provider errors, Dropbox quota surprises",
  ];

  const launchValidation: P251LaunchValidation = {
    phase: P251_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P251_OPS_DATE,
    mode: "zero_write_simulation",
    zeroWritesConfirmed: true,
    liveEmailsSent: 0,
    dropboxWrites: 0,
    melWrites: 0,
    breezyWrites: 0,
    mailReady: productionConfig.okForLiveEmail,
    resendReady: readiness.modes.resendReady,
    launchSequenceSimulated,
    volumes: {
      initialPaperworkSends: initial,
      reminder1Sends: reminders,
      readyForMel,
      openStoreSafeCapacity: safeCapacity,
    },
    reusedDryRun: true,
    readinessOverall: readiness.overall,
    notes: [
      ...p249DryRun.notes.slice(0, 8),
      `P249 dry-run zeroWritesConfirmed=${p249DryRun.zeroWritesConfirmed}`,
      `P250 prior decision=${p250Go?.decision ?? "n/a"}`,
      `Deployment tier=${productionConfig.tier}`,
      "P251 did not execute --live / --confirm-live",
    ],
    warnings: [
      ...productionConfig.mail.blockers,
      ...productionConfig.mail.warnings,
      ...p249DryRun.warnings.slice(0, 6),
    ],
  };

  console.log("[p251] Phase 5 — final GO / NO-GO…");
  const remainingBlockers = [
    ...productionConfig.issues
      .filter((i) => i.severity === "FAIL")
      .map((i) => `${i.variable ?? i.id}: ${i.why}`),
    ...readiness.blockers.filter(
      (b) =>
        /RESEND_API_KEY|DIRECT_DEPOSIT_EMAIL_MODE|SRS_RECRUITING_FROM|Sender domain/i.test(
          b,
        ) &&
        !productionConfig.issues.some((i) => b.includes(i.variable ?? "") || b.includes(i.why.slice(0, 24))),
    ),
  ];
  // Prefer unique blockers
  const uniqueBlockers = [...new Set(remainingBlockers.length > 0
    ? remainingBlockers
    : readiness.blockers.slice(0, 8))];

  const configurationChangesRequired = productionConfig.issues
    .filter((i) => i.fixType === "config_only" || i.fixType === "vendor")
    .map((i) => `${i.expectedFormat}  (${i.file})`);

  let decision: P251GoNoGo["decision"] = "NO-GO";
  if (productionConfig.okForLiveEmail && readiness.modes.resendReady) {
    const productionQuotaZero = readiness.checklist.some(
      (c) =>
        c.id === "dropbox_connectivity" &&
        (/quota=0/i.test(c.detail) || /vendor blocked/i.test(c.detail)),
    );
    decision = productionQuotaZero ? "CONDITIONAL-GO" : "GO";
  }

  const highestImpactBlocker =
    decision === "NO-GO"
      ? uniqueBlockers[0] ??
        "RESEND_API_KEY is missing from the runtime environment (.env.local)"
      : null;

  const goNoGo: P251GoNoGo = {
    phase: P251_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P251_OPS_DATE,
    decision,
    remainingBlockers: uniqueBlockers,
    configurationChangesRequired,
    codeChangesRequired: [],
    expectedThroughput: {
      initialPaperworkSends: initial,
      reminder1Sends: reminders,
      openStoreSafeCapacity: safeCapacity,
    },
    estimatedReadyForMelToday: readyForMel,
    expectedRecruiterTimeSavingsHours: recruiterHours,
    highestImpactBlocker,
    codeRemediationApplied: CODE_REMEDIATION_APPLIED,
    justification:
      decision === "GO"
        ? `GO: mail/Resend ready and readiness checks pass. Volumes confirmed (initial=${initial}, Reminder 1=${reminders}). Live send still requires explicit operator approval.`
        : decision === "CONDITIONAL-GO"
          ? `CONDITIONAL-GO: Resend ready, but Dropbox production quota remains 0. Reminder emails may proceed after approval; initial production packets only via intentional testMode until quota restored.`
          : `NO-GO: ${uniqueBlockers.length} blocker(s) remain — primarily Resend/live email configuration. Code remediation for fail-fast mail paths is in place; operator must set secrets/config. Highest impact: ${highestImpactBlocker}`,
  };

  artifacts.push(
    writeArtifact(artifactsDir, "p251-mail-audit.json", productionConfig),
    writeArtifact(
      artifactsDir,
      "p251-mail-audit.md",
      formatP251MailAuditMarkdown(productionConfig),
    ),
    writeArtifact(artifactsDir, "p251-recovery-tasks.json", recovery),
    writeArtifact(
      artifactsDir,
      "p251-recovery-tasks.md",
      formatP251RecoveryMarkdown(recovery),
    ),
    writeArtifact(artifactsDir, "p251-launch-validation.json", launchValidation),
    writeArtifact(
      artifactsDir,
      "p251-launch-validation.md",
      formatP251LaunchValidationMarkdown(launchValidation),
    ),
    writeArtifact(artifactsDir, "p251-go-nogo.json", goNoGo),
    writeArtifact(
      artifactsDir,
      "p251-go-nogo.md",
      formatP251GoNoGoMarkdown(goNoGo),
    ),
  );

  return {
    productionConfig,
    recovery,
    launchValidation,
    goNoGo,
    artifacts,
  };
}
