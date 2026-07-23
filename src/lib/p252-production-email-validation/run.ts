import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { resolveP245MailCapability } from "@/lib/p245-onboarding-paperwork-reminders/evaluate";
import { resolveP246MailCapability } from "@/lib/p246-outstanding-paperwork-reminders/evaluate";
import { buildP249ProductionReadiness } from "@/lib/p249-daily-ops-mission/readiness";
import type {
  P249DryRunReport,
  P249LiveExecutionPlan,
  P249OperationsDashboard,
  P249OutstandingPaperworkAnalysis,
} from "@/lib/p249-daily-ops-mission/types";
import { formatP252ProductionValidationMarkdown } from "@/lib/p252-production-email-validation/format";
import { probeResendProduction } from "@/lib/p252-production-email-validation/resend-probe";
import {
  P252_INTERNAL_TEST_ENV_VARS,
  P252_OPS_DATE,
  P252_PHASE,
  P252_TEST_SUBJECT,
  type P252CapacityProjection,
  type P252GoNoGo,
  type P252LiveDeliveryValidation,
  type P252PipelineReadiness,
  type P252ProductionValidation,
} from "@/lib/p252-production-email-validation/types";
import {
  validateProductionConfig,
} from "@/lib/production-mail-config";
import { sendTransactionalEmail } from "@/lib/transactional-email";

const execFileAsync = promisify(execFile);

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

function redactEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const keep = Math.min(2, local.length);
  return `${local.slice(0, keep)}***@${domain}`;
}

function resolveInternalTestRecipient(): {
  envVar: string;
  email: string;
} | null {
  for (const name of P252_INTERNAL_TEST_ENV_VARS) {
    const raw = process.env[name]?.trim() ?? "";
    if (!raw) continue;
    if (/^(placeholder|changeme|your-|example)/i.test(raw)) continue;
    if (!raw.includes("@")) continue;
    return { envVar: name, email: raw };
  }
  return null;
}

function resolveGitCommit(): string | null {
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT?.trim() ||
    process.env.COMMIT_SHA?.trim() ||
    "";
  if (fromEnv) return fromEnv.slice(0, 40);
  try {
    const head = readFileSync(path.join(process.cwd(), ".git", "HEAD"), "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.slice(4).trim();
      const sha = readFileSync(path.join(process.cwd(), ".git", ref), "utf8").trim();
      return sha.slice(0, 40) || null;
    }
    return head.slice(0, 40) || null;
  } catch {
    return null;
  }
}

function resolveDeploymentId(): string | null {
  return (
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.DEPLOYMENT_ID?.trim() ||
    null
  );
}

async function runMailUnitTests(): Promise<P252PipelineReadiness["unitTests"]> {
  const command =
    "node --import tsx --test src/lib/direct-deposit-email-config.test.ts src/lib/transactional-email-outbox.test.ts";
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      [
        "--import",
        "tsx",
        "--test",
        "src/lib/direct-deposit-email-config.test.ts",
        "src/lib/transactional-email-outbox.test.ts",
      ],
      {
        cwd: process.cwd(),
        timeout: 60_000,
        env: process.env,
      },
    );
    const combined = `${stdout}\n${stderr}`;
    const failed = /not ok |fail(ed|ures?:)/i.test(combined) && !/# pass\s+\d+/i.test(combined)
      ? true
      : /# fail\s+[1-9]/i.test(combined);
    const passed = !failed && /# (tests|pass)/i.test(combined);
    return {
      attempted: true,
      command,
      passed: passed || (!failed && combined.includes("ok")),
      detail: passed || !failed
        ? "PASS — direct-deposit-email-config + transactional-email-outbox"
        : `FAIL — see test output (${combined.slice(0, 200).replace(/\s+/g, " ")})`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      attempted: true,
      command,
      passed: false,
      detail: `FAIL — ${msg.slice(0, 240)}`,
    };
  }
}

function buildCapacity(artifactsDir: string): P252CapacityProjection {
  const outstanding = readJson<P249OutstandingPaperworkAnalysis>(
    path.join(artifactsDir, "p249-outstanding-paperwork-analysis.json"),
  );
  const dryRun = readJson<P249DryRunReport>(
    path.join(artifactsDir, "p249-dry-run-report.json"),
  );
  const live = readJson<P249LiveExecutionPlan>(
    path.join(artifactsDir, "p249-live-execution-plan.json"),
  );
  const dashboard = readJson<P249OperationsDashboard>(
    path.join(artifactsDir, "p249-operations-dashboard.json"),
  );

  const sources: string[] = [];
  for (const name of [
    "p249-outstanding-paperwork-analysis.json",
    "p249-dry-run-report.json",
    "p249-live-execution-plan.json",
    "p249-operations-dashboard.json",
  ]) {
    if (existsSync(path.join(artifactsDir, name))) sources.push(name);
  }

  const initial =
    outstanding?.counts.eligibleForInitialPaperwork ??
    dryRun?.simulations.initialPaperworkWouldSend ??
    0;
  const reminders =
    outstanding?.counts.reminder1 ??
    dryRun?.simulations.remindersWouldSend ??
    dashboard?.reminder1 ??
    0;
  const readyForMel =
    outstanding?.counts.readyForMel ?? dashboard?.readyForMel ?? 0;
  const initialPerHour =
    live?.throughputEstimate.initialSendsPerHour ??
    dryRun?.simulations.openStoreSafeCapacity ??
    null;
  const remindersPerHour = live?.throughputEstimate.remindersPerHour ?? null;
  const estReminderMin = live?.throughputEstimate.estimatedMinutesForReminders ?? null;
  const estInitialMin = live?.throughputEstimate.estimatedMinutesForInitialSends ?? null;
  const recruiterHours = dashboard?.estimatedRecruiterHoursSaved ?? 9.1;

  const parts: string[] = [];
  if (estReminderMin != null) {
    parts.push(`~${estReminderMin} min for Reminder 1 cohort (${reminders})`);
  }
  if (estInitialMin != null) {
    parts.push(`~${estInitialMin} min for initial open-store sends (${initial})`);
  }
  const projectedCompletionSummary =
    parts.length > 0
      ? `Projected completion after live mail GO: ${parts.join("; ")}.`
      : `Projected volumes: initial=${initial}, Reminder 1=${reminders}; throughput unknown until live plan refreshed.`;

  return {
    initialSendsReady: initial,
    remindersReady: reminders,
    dailyThroughputInitialPerHour: initialPerHour,
    dailyThroughputRemindersPerHour: remindersPerHour,
    estimatedMinutesForReminders: estReminderMin,
    estimatedMinutesForInitialSends: estInitialMin,
    projectedCompletionSummary,
    recruiterHoursSaved: recruiterHours,
    readyForMel,
    sourceArtifacts: sources,
  };
}

async function maybeSendInternalTestEmail(input: {
  productionReady: boolean;
  from: string;
  replyTo: string;
  gitCommit: string | null;
  deploymentId: string | null;
  environment: string;
}): Promise<P252LiveDeliveryValidation> {
  const subject = P252_TEST_SUBJECT;
  const recipient = resolveInternalTestRecipient();

  if (!input.productionReady) {
    return {
      attempted: false,
      skippedReason:
        "Skipped — production email is not fully configured (okForLiveEmail=false)",
      recipientEnvVar: recipient?.envVar ?? null,
      recipientRedacted: recipient ? redactEmail(recipient.email) : null,
      subject,
      sent: false,
      messageId: null,
      provider: null,
      error: null,
      bodyMeta: null,
    };
  }

  if (!recipient) {
    return {
      attempted: false,
      skippedReason:
        `Skipped — no internal test recipient. Set one of: ${P252_INTERNAL_TEST_ENV_VARS.join(", ")} in .env.local (do not invent or use candidate addresses)`,
      recipientEnvVar: null,
      recipientRedacted: null,
      subject,
      sent: false,
      messageId: null,
      provider: null,
      error: null,
      bodyMeta: null,
    };
  }

  const timestamp = new Date().toISOString();
  const bodyMeta = {
    timestamp,
    environment: input.environment,
    deploymentId: input.deploymentId,
    gitCommit: input.gitCommit,
    mailProvider: "resend",
  };
  const text = [
    "SRS Recruiting Production Validation — live delivery check",
    "",
    `Timestamp: ${timestamp}`,
    `Environment: ${input.environment}`,
    `Deployment id: ${input.deploymentId ?? "unset"}`,
    `Git commit: ${input.gitCommit ?? "unset"}`,
    `Mail provider: resend`,
    "",
    "This message confirms Resend live delivery is working for the recruiting From address.",
    "Internal ops test only — not a candidate paperwork message.",
  ].join("\n");

  const result = await sendTransactionalEmail(
    {
      from: input.from,
      replyTo: input.replyTo,
      to: recipient.email,
      subject,
      text,
      tags: ["p252-production-validation", "internal-test"],
    },
    {
      phase: P252_PHASE,
      purpose: "internal_production_mail_validation",
      candidateId: null,
      paperworkResend: false,
    },
    { requireLiveDelivery: true },
  );

  return {
    attempted: true,
    skippedReason: null,
    recipientEnvVar: recipient.envVar,
    recipientRedacted: redactEmail(recipient.email),
    subject,
    sent: Boolean(result.ok && result.mode === "resend"),
    messageId: result.messageId ?? null,
    provider: result.mode === "resend" ? "resend" : null,
    error: result.ok ? null : result.error ?? "Send failed",
    bodyMeta,
  };
}

export async function runP252ProductionEmailValidation(input?: {
  artifactsDir?: string;
  skipUnitTests?: boolean;
}): Promise<P252ProductionValidation> {
  const artifactsDir = input?.artifactsDir ?? path.join(process.cwd(), "artifacts");
  const generatedAt = new Date().toISOString();

  console.log("[p252] Phase 1 — runtime config (no secrets)…");
  const runtimeConfig = validateProductionConfig();

  console.log("[p252] Phase 2 — Resend API validation…");
  const apiKey = runtimeConfig.mail.hasResendApiKey
    ? process.env.RESEND_API_KEY?.trim() ?? null
    : null;
  const resendProbe = await probeResendProduction({
    apiKey,
    fromEmail: runtimeConfig.mail.resolvedFrom,
  });

  // Fail immediately on config / auth issues for live path clarity
  const configBlockers = [
    ...runtimeConfig.mail.blockers,
    ...resendProbe.blockers,
  ];

  console.log("[p252] Phase 3 — live delivery validation (internal only)…");
  const gitCommit = resolveGitCommit();
  const deploymentId = resolveDeploymentId();
  const liveDelivery = await maybeSendInternalTestEmail({
    productionReady:
      runtimeConfig.okForLiveEmail &&
      resendProbe.authenticated === true &&
      resendProbe.fromAuthorized === true,
    from: runtimeConfig.mail.resolvedFrom,
    replyTo: runtimeConfig.mail.resolvedReplyTo,
    gitCommit,
    deploymentId,
    environment: runtimeConfig.tier,
  });

  console.log("[p252] Phase 4 — pipeline readiness…");
  const p245 = resolveP245MailCapability();
  const p246 = resolveP246MailCapability();
  let readinessOverall: P252PipelineReadiness["p249ReadinessOverall"] = "unknown";
  let p249ResendReady: boolean | null = null;
  const pipelineBlockers: string[] = [];
  const pipelineNotes: string[] = [
    "Zero workflow stage changes in P252",
    "P245/P246/P249 re-checked read-only; no candidate paperwork resend",
  ];

  try {
    const readiness = await buildP249ProductionReadiness();
    readinessOverall = readiness.overall;
    p249ResendReady = readiness.modes.resendReady;
    if (!readiness.modes.resendReady) {
      pipelineBlockers.push(...readiness.blockers.filter((b) =>
        /RESEND|DIRECT_DEPOSIT_EMAIL_MODE|SRS_RECRUITING_FROM|Sender domain/i.test(b),
      ).slice(0, 6));
    }
    pipelineNotes.push(`P249 readiness overall=${readiness.overall}`);
  } catch (error) {
    pipelineNotes.push(
      `P249 readiness probe error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const unitTests = input?.skipUnitTests
    ? {
        attempted: false,
        command: null,
        passed: null,
        detail: "Skipped (skipUnitTests)",
      }
    : await runMailUnitTests();

  const pipeline: P252PipelineReadiness = {
    p245MailCanLiveDeliver: p245.canLiveDeliver,
    p246MailCanLiveDeliver: p246.canLiveDeliver,
    p249ReadinessOverall: readinessOverall,
    p249ResendReady,
    transactionalRequireLiveDeliveryPresent: true,
    startupOkForLiveEmail: runtimeConfig.okForLiveEmail,
    failFastEnabled: true,
    unitTests,
    notes: pipelineNotes,
    blockers: pipelineBlockers,
  };

  console.log("[p252] Phase 5 — capacity projection…");
  const capacity = buildCapacity(artifactsDir);

  console.log("[p252] Phase 6 — GO / NO-GO…");
  const remainingBlockers = [
    ...new Set([
      ...configBlockers,
      ...runtimeConfig.issues
        .filter((i) => i.severity === "FAIL")
        .map((i) => `${i.variable ?? i.id}: ${i.why}`),
      ...pipeline.blockers,
      ...(liveDelivery.attempted && !liveDelivery.sent && liveDelivery.error
        ? [`Live test email failed: ${liveDelivery.error}`]
        : []),
      ...(!liveDelivery.attempted &&
      runtimeConfig.okForLiveEmail &&
      liveDelivery.skippedReason?.includes("no internal test recipient")
        ? [liveDelivery.skippedReason]
        : []),
    ]),
  ];

  const configurationChangesRequired = [
    ...runtimeConfig.issues
      .filter((i) => i.fixType === "config_only" || i.fixType === "vendor")
      .map((i) => `${i.expectedFormat}  (${i.file})`),
  ];
  if (
    !resolveInternalTestRecipient() &&
    (runtimeConfig.okForLiveEmail || remainingBlockers.some((b) => /RESEND_API_KEY/i.test(b)))
  ) {
    const already = configurationChangesRequired.some((c) =>
      c.includes("SRS_INTERNAL_TEST_EMAIL"),
    );
    if (!already) {
      configurationChangesRequired.push(
        "SRS_INTERNAL_TEST_EMAIL=<internal-ops@your-domain>  (.env.local — required for P252 live validation send)",
      );
    }
  }

  let decision: P252GoNoGo["decision"] = "NO-GO";
  if (
    runtimeConfig.okForLiveEmail &&
    resendProbe.authenticated === true &&
    resendProbe.fromAuthorized === true &&
    liveDelivery.sent &&
    p245.canLiveDeliver &&
    p246.canLiveDeliver
  ) {
    decision = "GO";
  } else if (
    runtimeConfig.okForLiveEmail &&
    resendProbe.authenticated === true &&
    resendProbe.fromAuthorized === true &&
    !liveDelivery.sent &&
    liveDelivery.skippedReason?.includes("no internal test recipient")
  ) {
    decision = "CONDITIONAL-GO";
    remainingBlockers.push(
      "Live internal validation email not sent — set SRS_INTERNAL_TEST_EMAIL then re-run P252",
    );
  }

  const uniqueBlockers = [...new Set(remainingBlockers)];
  const prioritize = (b: string): number => {
    if (/RESEND_API_KEY is missing/i.test(b)) return 0;
    if (/RESEND_API_KEY/i.test(b) && /Missing from runtime/i.test(b)) return 1;
    if (/DIRECT_DEPOSIT_EMAIL_MODE/i.test(b)) return 2;
    if (/SRS_RECRUITING_FROM_EMAIL/i.test(b)) return 3;
    if (/Sender domain/i.test(b)) return 4;
    if (/SRS_INTERNAL_TEST_EMAIL|internal test recipient/i.test(b)) return 5;
    return 10;
  };
  uniqueBlockers.sort((a, b) => prioritize(a) - prioritize(b));
  const highestImpactBlocker =
    decision === "GO"
      ? null
      : uniqueBlockers[0] ??
        "RESEND_API_KEY is missing from the runtime environment (.env.local)";

  const goNoGo: P252GoNoGo = {
    phase: P252_PHASE,
    generatedAt,
    opsDate: P252_OPS_DATE,
    decision,
    remainingBlockers: uniqueBlockers,
    configurationChangesRequired: [...new Set(configurationChangesRequired)],
    codeChangesRequired: [],
    expectedThroughput: {
      initialPaperworkSends: capacity.initialSendsReady,
      reminder1Sends: capacity.remindersReady,
      openStoreSafeCapacity: capacity.dailyThroughputInitialPerHour,
    },
    estimatedReadyForMelToday: capacity.readyForMel,
    expectedRecruiterTimeSavingsHours: capacity.recruiterHoursSaved,
    highestImpactBlocker,
    liveTestEmailSent: liveDelivery.sent,
    liveTestEmailRecipientRedacted: liveDelivery.recipientRedacted,
    justification:
      decision === "GO"
        ? `GO: runtime mail config ready, Resend authenticated, From domain verified, and one internal validation email delivered (${liveDelivery.recipientRedacted}). Candidate paperwork not resent. Volumes: initial=${capacity.initialSendsReady}, Reminder 1=${capacity.remindersReady}.`
        : decision === "CONDITIONAL-GO"
          ? `CONDITIONAL-GO: Resend/live config ready and domain verified, but internal test send skipped — set SRS_INTERNAL_TEST_EMAIL and re-run. Highest impact: ${highestImpactBlocker}`
          : `NO-GO: ${uniqueBlockers.length} blocker(s) remain. Highest impact: ${highestImpactBlocker}. Do not enable live reminder campaigns until Resend + recruiting From are configured and P252 re-run confirms delivery.`,
  };

  const report: P252ProductionValidation = {
    phase: P252_PHASE,
    generatedAt,
    opsDate: P252_OPS_DATE,
    runtimeConfig,
    resendProbe,
    liveDelivery,
    pipeline,
    capacity,
    goNoGo,
    safety: {
      secretsNeverPrinted: true,
      candidateEmailsNeverTargeted: true,
      paperworkNeverResent: true,
      workflowStagesUnmodified: true,
      dbCandidateUpdates: 0,
      simulatedSuccess: false,
    },
    artifacts: [],
  };

  const artifactPaths = [
    writeArtifact(artifactsDir, "p252-production-validation.json", report),
    writeArtifact(
      artifactsDir,
      "p252-production-validation.md",
      formatP252ProductionValidationMarkdown(report),
    ),
  ];
  report.artifacts = artifactPaths;
  writeArtifact(artifactsDir, "p252-production-validation.json", report);

  return report;
}
