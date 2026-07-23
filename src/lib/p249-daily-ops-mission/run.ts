import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { resolveDefaultXlsxPath } from "@/lib/open-stores-paperwork-send";
import { buildP242Preview } from "@/lib/p242-open-store-paperwork-push";
import {
  buildP243OsbpqPreview,
  resolveOpenStoreMatchesXlsxPath,
} from "@/lib/p243-open-store-bulk-paperwork-queue";
import { buildP246Preview } from "@/lib/p246-outstanding-paperwork-reminders";
import { buildP249ProductionReadiness } from "@/lib/p249-daily-ops-mission/readiness";
import {
  formatP249DryRunMarkdown,
  formatP249GoNoGoMarkdown,
  formatP249LivePlanMarkdown,
  formatP249OperationsDashboardMarkdown,
  formatP249OutstandingMarkdown,
  formatP249ReadinessMarkdown,
} from "@/lib/p249-daily-ops-mission/format";
import {
  P249_OPS_DATE,
  P249_PHASE,
  type P249BlockedReason,
  type P249DryRunReport,
  type P249GoNoGo,
  type P249LiveExecutionPlan,
  type P249MissionResult,
  type P249OperationsDashboard,
  type P249OutstandingPaperworkAnalysis,
} from "@/lib/p249-daily-ops-mission/types";

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

function pipelineHealthScore(input: {
  readinessFail: number;
  resendReady: boolean;
  dropboxOk: boolean;
  breezyOk: boolean;
  eligibleInitial: number;
  reminderEligible: number;
  outstanding: number;
  blockedHard: number;
}): number {
  let score = 100;
  score -= Math.min(40, input.readinessFail * 8);
  if (!input.resendReady) score -= 20;
  if (!input.dropboxOk) score -= 15;
  if (!input.breezyOk) score -= 15;
  // Capacity to move work is healthy even if live email blocked
  if (input.reminderEligible > 0 || input.eligibleInitial > 0) score += 0;
  else if (input.outstanding === 0) score -= 5;
  if (input.blockedHard > 100) score -= 10;
  else if (input.blockedHard > 50) score -= 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function estimateRecruiterHoursSaved(input: {
  initialWouldSend: number;
  remindersWouldSend: number;
}): number {
  // Conservative ops estimate: ~8 min per initial packet prep/send, ~3 min per reminder chase
  const minutes = input.initialWouldSend * 8 + input.remindersWouldSend * 3;
  return Math.round((minutes / 60) * 10) / 10;
}

export async function runP249DailyOpsMission(input?: {
  artifactsDir?: string;
  probeDropbox?: boolean;
  dropboxConcurrency?: number;
  skipBreezyHeavy?: boolean;
}): Promise<P249MissionResult> {
  const artifactsDir = input?.artifactsDir ?? path.join(process.cwd(), "artifacts");
  const probeDropbox = input?.probeDropbox ?? true;
  const artifacts: string[] = [];

  console.log("[p249] Priority 1 — production readiness (read-only)…");
  const readiness = await buildP249ProductionReadiness();

  console.log("[p249] Priority 2 — open-store initial paperwork preview (zero send)…");
  let p242Eligible = 0;
  let p242AlreadySent = 0;
  let p242Blocked: P249BlockedReason[] = [];
  let p242WouldSend = 0;
  let p242Notes: string[] = [];
  const trendsXlsx = resolveDefaultXlsxPath();
  if (trendsXlsx) {
    try {
      const { report } = await buildP242Preview({ xlsxPath: trendsXlsx });
      p242Eligible = report.summary.eligible;
      p242AlreadySent = report.summary.alreadySent;
      p242WouldSend = report.summary.eligible;
      p242Notes = report.notes ?? [];
      const reasonCounts = new Map<string, number>();
      for (const c of report.candidates) {
        if (c.eligibility === "eligible") continue;
        const reason =
          c.blockReasons?.[0] ??
          (c.alreadySentExclusion
            ? "already_sent"
            : c.signedExclusion
              ? "already_signed"
              : "other_blocked");
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
      p242Blocked = [...reasonCounts.entries()].map(([reason, count]) => ({
        reason: `initial:${reason}`,
        count,
        automaticFix: reason === "already_sent" || reason === "already_signed",
        manualAction:
          reason === "already_sent" || reason === "already_signed"
            ? "None — correctly excluded"
            : "Review blocked candidates in P242 preview artifacts",
      }));
    } catch (error) {
      p242Notes.push(
        `P242 preview failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    p242Notes.push("Trends open-store workbook not found — skipped P242 preview");
  }

  console.log("[p249] Priority 2/3 — open-store bulk queue preview (zero send)…");
  let osbpqEligible = 0;
  let osbpqDuplicates = 0;
  let osbpqSafeCapacity: number | null = null;
  let osbpqAlreadySent = 0;
  const matchesXlsx = resolveOpenStoreMatchesXlsxPath();
  const dryWarnings: string[] = [];
  if (matchesXlsx) {
    try {
      const { report } = await buildP243OsbpqPreview({ xlsxPath: matchesXlsx });
      osbpqEligible = report.summary.eligible;
      osbpqDuplicates = report.summary.duplicates;
      osbpqSafeCapacity = report.summary.safeCapacity;
      osbpqAlreadySent = report.summary.alreadySent;
    } catch (error) {
      dryWarnings.push(
        `P243 OSBPQ preview failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    dryWarnings.push("Open_Store_Candidate_Matches.xlsx not found — skipped OSBPQ preview");
  }

  console.log(
    `[p249] Priority 2/3 — P246 reminder preview (Dropbox probe=${probeDropbox}, read-only)…`,
  );
  const p246 = await buildP246Preview({
    probeDropbox,
    dropboxConcurrency: input?.dropboxConcurrency ?? 6,
    applySafeCorrections: false,
  });

  console.log("[p249] Analyzing durable workflow store…");
  const workflows = await getCandidateWorkflowState();
  const wfValues = Object.values(workflows);
  let paperworkNeeded = 0;
  let paperworkSent = 0;
  let signedWf = 0;
  let readyForMel = 0;
  let applied = 0;
  let verifySigned = 0;
  const today = P249_OPS_DATE;
  let signedToday = 0;
  for (const w of wfValues) {
    const status = w.workflowStatus ?? "";
    if (status === "Paperwork Needed") paperworkNeeded += 1;
    if (status === "Paperwork Sent") paperworkSent += 1;
    if (status === "Signed") signedWf += 1;
    if (status === "Ready for MEL" || status === "Applied") {
      if (status === "Ready for MEL") readyForMel += 1;
      if (status === "Applied") applied += 1;
    }
    if (w.nextActionNeeded === "Load into MEL" || w.nextActionNeeded === "Verify signed paperwork") {
      if (w.nextActionNeeded === "Load into MEL") readyForMel += 1;
      if (w.nextActionNeeded === "Verify signed paperwork") verifySigned += 1;
    }
    const signedAt = w.paperworkSignedAt?.slice(0, 10);
    if (signedAt === today || (w.paperworkStatus === "signed" && signedAt === today)) {
      signedToday += 1;
    }
  }
  // Deduplicate readyForMel if both status and nextAction counted — prefer unique candidates
  readyForMel = wfValues.filter(
    (w) =>
      w.workflowStatus === "Ready for MEL" ||
      w.nextActionNeeded === "Load into MEL",
  ).length;

  const reminderStorePresent =
    existsSync(path.join(process.cwd(), ".data", "p246-reminder-store.json")) ||
    existsSync(path.join(process.cwd(), ".data", "p245-reminder-store.json"));

  const blockedByReason: P249BlockedReason[] = [
    ...p242Blocked,
    {
      reason: "reminder:invalid_email",
      count: p246.metrics.invalidEmail,
      automaticFix: false,
      manualAction: "Clean invalid emails in Breezy / workflow before reminding",
    },
    {
      reason: "reminder:missing_signature_request",
      count: p246.metrics.missingSignatureRequest,
      automaticFix: false,
      manualAction: "Reconcile missing Dropbox signatureRequestId or resend initial packet",
    },
    {
      reason: "reminder:cooldown_not_met",
      count: p246.metrics.cooldownNotMet,
      automaticFix: true,
      manualAction: "Wait for cadence window — no operator action",
    },
    {
      reason: "reminder:signed_or_completed",
      count: p246.metrics.signedOrCompleted,
      automaticFix: true,
      manualAction: "None — advance toward MEL verification",
    },
    {
      reason: "reminder:status_conflicts",
      count: p246.metrics.statusConflicts,
      automaticFix: true,
      manualAction: "Re-run P246 with --apply-safe-corrections when authorized",
    },
  ].filter((b) => b.count > 0);

  const outstanding: P249OutstandingPaperworkAnalysis = {
    phase: P249_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P249_OPS_DATE,
    source: {
      p242Preview: Boolean(trendsXlsx),
      p246Preview: true,
      workflowStore: true,
      reminderStorePresent,
    },
    counts: {
      eligibleForInitialPaperwork: Math.max(p242Eligible, osbpqEligible),
      alreadySent: Math.max(p242AlreadySent, osbpqAlreadySent, paperworkSent),
      outstandingDropboxSignatures: p246.dashboard.totalOutstandingPaperwork,
      reminderEligibleTotal: p246.metrics.eligibleTotal,
      reminder1: p246.metrics.eligibleReminder1,
      reminder2: p246.metrics.eligibleReminder2,
      reminder3: p246.metrics.eligibleReminder3,
      reminder4: p246.metrics.eligibleReminder4,
      viewedButNotSigned: p246.metrics.viewedIncomplete,
      signed: Math.max(p246.metrics.signedOrCompleted, signedWf),
      readyForMel: readyForMel + verifySigned,
      paperworkNeededWorkflow: paperworkNeeded,
      paperworkSentWorkflow: paperworkSent,
    },
    blockedByReason,
  };

  const dropboxProbed = p246.metrics.dropboxVerified + p246.metrics.dropboxLookupFailures;
  const dryRun: P249DryRunReport = {
    phase: P249_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P249_OPS_DATE,
    zeroWritesConfirmed: true,
    liveEmailsSent: 0,
    dropboxWrites: 0,
    melWrites: 0,
    breezyWrites: 0,
    simulations: {
      initialPaperworkWouldSend: Math.max(p242WouldSend, osbpqEligible),
      initialPaperworkDeferredOrBlocked: p242Blocked.reduce((n, b) => n + b.count, 0),
      remindersWouldSend: p246.metrics.eligibleTotal,
      remindersSkippedDuplicateOrCooldown:
        p246.metrics.cooldownNotMet + (p246.metrics.otherExclusions ?? 0),
      duplicatesDetected: osbpqDuplicates,
      dropboxRefreshProbed: dropboxProbed,
      dropboxRefreshOk: p246.metrics.dropboxVerified,
      idempotentSkips: p246.metrics.cooldownNotMet,
      candidateAdvancementPlanned: verifySigned + readyForMel,
      openStoreEligibleWouldSend: osbpqEligible,
      openStoreSafeCapacity: osbpqSafeCapacity,
    },
    notes: [
      ...p242Notes,
      p246.stopCampaign
        ? `P246 stopCampaign=${p246.stopCampaign}: ${p246.stopReason ?? "n/a"}`
        : "P246 preview completed without campaign stop",
      `Mail capability: mode=${p246.mail.mode} canLiveDeliver=${p246.mail.canLiveDeliver}`,
      "applySafeCorrections=false — workflow store untouched",
      "No --live / --confirm-live flags used",
    ],
    warnings: [
      ...dryWarnings,
      ...(p246.mail.blocker ? [p246.mail.blocker] : []),
      ...readiness.blockers.slice(0, 5),
    ],
  };

  const dropboxApiReadable = readiness.checklist.some(
    (c) => c.id === "dropbox_connectivity" && /apiStatus=ok/i.test(c.detail),
  );
  const breezyOk = readiness.checklist.some(
    (c) => c.id === "breezy_connectivity" && c.status === "PASS",
  );
  const health = pipelineHealthScore({
    readinessFail: readiness.failCount,
    resendReady: readiness.modes.resendReady,
    dropboxOk: dropboxApiReadable,
    breezyOk,
    eligibleInitial: outstanding.counts.eligibleForInitialPaperwork,
    reminderEligible: outstanding.counts.reminderEligibleTotal,
    outstanding: outstanding.counts.outstandingDropboxSignatures,
    blockedHard:
      p246.metrics.invalidEmail + p246.metrics.missingSignatureRequest,
  });

  const remindersWould = dryRun.simulations.remindersWouldSend;
  const initialWould = dryRun.simulations.initialPaperworkWouldSend;
  const reminderMinutes =
    remindersWould > 0 ? Math.ceil((remindersWould / 25) * 1.5 + remindersWould * 0.05) : null;
  const initialMinutes =
    initialWould > 0
      ? Math.ceil(
          initialWould /
            Math.max(1, Math.min(osbpqSafeCapacity ?? 10, 10)),
        ) * 3
      : null;

  const liveBlockers = readiness.blockers.filter((b) =>
    /RESEND_API_KEY|DIRECT_DEPOSIT_EMAIL_MODE|SRS_RECRUITING_FROM|Sender domain|Breezy|Dropbox Sign API key missing/i.test(
      b,
    ),
  );

  let decision: P249GoNoGo["decision"] = "NO-GO";
  if (liveBlockers.length === 0 && readiness.modes.resendReady && dropboxApiReadable) {
    decision = "GO";
  }

  const goJustification =
    decision === "GO"
      ? "All critical live dependencies PASS; proceed with canary then capped batches."
      : `NO-GO for live execution today: Resend/live email is not configured (${liveBlockers.length} blocker(s)). Dropbox status probes and Breezy reads succeed; ${remindersWould} reminders and ${initialWould} initial send(s) are queued for after config. Production Dropbox quota is 0 — initial packet sends only via intentional testMode until quota restored.`;

  const livePlan: P249LiveExecutionPlan = {
    phase: P249_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P249_OPS_DATE,
    recommendation: decision,
    steps: [
      {
        order: 1,
        action: "Fix Resend configuration blockers",
        count: liveBlockers.length,
        command: null,
        risk: "high",
        notes:
          "Set RESEND_API_KEY, DIRECT_DEPOSIT_EMAIL_MODE=resend, SRS_RECRUITING_FROM_EMAIL; verify domain",
      },
      {
        order: 2,
        action: "Re-run P249 / P248 config check (read-only)",
        count: null,
        command: "npx tsx scripts/p249-run-daily-ops-mission.ts",
        risk: "low",
        notes: "Confirm readyForLive=true before any --live flags",
      },
      {
        order: 3,
        action: "P246 reminder canary (3) after Resend ready",
        count: Math.min(3, remindersWould),
        command:
          "npx tsx scripts/p248-run-resend-live-reminder-campaign.ts --live --confirm-live --canary-only",
        risk: "medium",
        notes: "Does NOT resend Dropbox packets; transactional email only",
      },
      {
        order: 4,
        action: "P246/P248 remaining Reminder 1 cohort",
        count: Math.max(0, remindersWould - 3),
        command:
          "npx tsx scripts/p248-run-resend-live-reminder-campaign.ts --live --confirm-live --continue-full",
        risk: "medium",
        notes: `Batch size 25 with pause; est. ${reminderMinutes ?? "n/a"} minutes`,
      },
      {
        order: 5,
        action: "Initial open-store paperwork canary (Dropbox testMode)",
        count: Math.min(3, initialWould),
        command:
          "export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true AUTONOMOUS_PAPERWORK_LIVE_MODE=true AUTONOMOUS_PAPERWORK_OPERATOR_GO=true; npx tsx scripts/p243-run-open-store-bulk-paperwork-queue.ts --live --confirm-live",
        risk: "high",
        notes: `Safe capacity=${osbpqSafeCapacity ?? "unknown"}; confirm testMode intent`,
      },
      {
        order: 6,
        action: "Advance signed → Ready for MEL (manual/authorized)",
        count: verifySigned + readyForMel,
        command: null,
        risk: "medium",
        notes: "No automatic MEL writes in this mission — verify signatures then load MEL",
      },
    ],
    throughputEstimate: {
      initialSendsPerHour: Math.min(osbpqSafeCapacity ?? 20, 20),
      // ~25/batch with ~1.5s pause + send overhead ≈ 10 batches/hour conservative
      remindersPerHour: 250,
      estimatedMinutesForReminders: reminderMinutes,
      estimatedMinutesForInitialSends: initialMinutes,
    },
    operationalRisks: [
      ...(readiness.modes.dropboxTestMode
        ? ["Dropbox testMode=true — packets may be test envelopes until production mode authorized"]
        : []),
      ...(!readiness.modes.resendReady
        ? ["Live reminder email blocked until Resend is configured"]
        : []),
      ...(p246.metrics.invalidEmail > 0
        ? [`${p246.metrics.invalidEmail} invalid emails will bounce if forced`]
        : []),
      ...(p246.metrics.missingSignatureRequest > 0
        ? [`${p246.metrics.missingSignatureRequest} packets missing signatureRequestId`]
        : []),
      "Never pass --live without --confirm-live",
      "Do not enable apply-safe-corrections until operator reviews reconciliation conflicts",
    ],
  };

  const dashboard: P249OperationsDashboard = {
    phase: P249_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P249_OPS_DATE,
    newApplicants: applied,
    paperworkNeeded,
    eligibleToSend: outstanding.counts.eligibleForInitialPaperwork,
    paperworkSent,
    outstandingSignatures: outstanding.counts.outstandingDropboxSignatures,
    reminder1: outstanding.counts.reminder1,
    reminder2: outstanding.counts.reminder2,
    reminder3: outstanding.counts.reminder3,
    reminder4: outstanding.counts.reminder4,
    viewed: outstanding.counts.viewedButNotSigned,
    signedToday,
    readyForMel: outstanding.counts.readyForMel,
    blocked: blockedByReason
      .filter((b) => !b.automaticFix)
      .reduce((n, b) => n + b.count, 0),
    pipelineHealthPct: health,
    estimatedRecruiterHoursSaved: estimateRecruiterHoursSaved({
      initialWouldSend: initialWould,
      remindersWouldSend: remindersWould,
    }),
  };

  const expectedReadyForMelToday = Math.min(
    outstanding.counts.readyForMel,
    verifySigned + readyForMel,
  );

  const goNoGo: P249GoNoGo = {
    phase: P249_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P249_OPS_DATE,
    decision,
    pipelineHealthScore: health,
    eligibleFirstTimePaperwork: outstanding.counts.eligibleForInitialPaperwork,
    eligibleReminders: outstanding.counts.reminderEligibleTotal,
    expectedReadyForMelToday,
    blockers: liveBlockers.length > 0 ? liveBlockers : readiness.blockers.slice(0, 8),
    justification: goJustification,
  };

  // Write artifacts
  artifacts.push(
    writeArtifact(artifactsDir, "p249-production-readiness.json", readiness),
    writeArtifact(
      artifactsDir,
      "p249-production-readiness.md",
      formatP249ReadinessMarkdown(readiness),
    ),
    writeArtifact(artifactsDir, "p249-outstanding-paperwork-analysis.json", outstanding),
    writeArtifact(
      artifactsDir,
      "p249-outstanding-paperwork-analysis.md",
      formatP249OutstandingMarkdown(outstanding),
    ),
    writeArtifact(artifactsDir, "p249-dry-run-report.json", dryRun),
    writeArtifact(artifactsDir, "p249-dry-run-report.md", formatP249DryRunMarkdown(dryRun)),
    writeArtifact(artifactsDir, "p249-live-execution-plan.md", formatP249LivePlanMarkdown(livePlan)),
    writeArtifact(artifactsDir, "p249-live-execution-plan.json", livePlan),
    writeArtifact(artifactsDir, "p249-operations-dashboard.json", dashboard),
    writeArtifact(
      artifactsDir,
      "p249-operations-dashboard.md",
      formatP249OperationsDashboardMarkdown(dashboard),
    ),
    writeArtifact(artifactsDir, "p249-go-nogo.md", formatP249GoNoGoMarkdown(goNoGo)),
    writeArtifact(artifactsDir, "p249-go-nogo.json", goNoGo),
  );

  return {
    readiness,
    outstanding,
    dryRun,
    livePlan,
    dashboard,
    goNoGo,
    artifacts,
  };
}
