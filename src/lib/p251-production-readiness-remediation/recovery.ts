import type {
  P249DryRunReport,
  P249GoNoGo,
  P249OutstandingPaperworkAnalysis,
} from "@/lib/p249-daily-ops-mission/types";
import {
  P251_OPS_DATE,
  P251_PHASE,
  type P251RecoveryTask,
  type P251RecoveryTasks,
} from "@/lib/p251-production-readiness-remediation/types";

export function buildP251RecoveryTasks(input: {
  outstanding: P249OutstandingPaperworkAnalysis | null;
  dryRun: P249DryRunReport | null;
  goNoGo: P249GoNoGo | null;
  mailReady: boolean;
  sourceArtifacts: string[];
}): P251RecoveryTasks {
  const tasks: P251RecoveryTask[] = [];
  const blocked = input.outstanding?.blockedByReason ?? [];
  const count = (reason: string) =>
    blocked.find((b) => b.reason === reason)?.count ?? 0;

  const invalidEmail = count("reminder:invalid_email");
  const missingSig = count("reminder:missing_signature_request");
  const statusConflicts = count("reminder:status_conflicts");
  const duplicates = input.dryRun?.simulations.duplicatesDetected ?? 0;
  const remindersReady = input.outstanding?.counts.reminder1 ?? 0;
  const initialReady = input.outstanding?.counts.eligibleForInitialPaperwork ?? 0;
  const readyForMel = input.goNoGo?.expectedReadyForMelToday ??
    input.outstanding?.counts.readyForMel ??
    0;

  if (!input.mailReady) {
    tasks.push({
      id: "config-resend-before-resend-batch",
      action: "retry",
      priority: "P0",
      title: "Configure Resend before any live resend / reminder batch",
      count: remindersReady,
      detail:
        "180 Reminder 1 and initial sends are queued but live delivery is blocked until RESEND_API_KEY + DIRECT_DEPOSIT_EMAIL_MODE=resend + SRS_RECRUITING_FROM_EMAIL.",
      command: null,
      blockedByMail: true,
    });
  }

  if (remindersReady > 0) {
    tasks.push({
      id: "resend-reminder-1-batch",
      action: "resend",
      priority: "P0",
      title: "Send Reminder 1 cohort (after mail GO)",
      count: remindersReady,
      detail:
        "Zero-write dry-run already sized this batch. Execute only after P251/P250 GO with --live --confirm-live.",
      command:
        "npx tsx scripts/p248-run-resend-live-reminder-campaign.ts  # after mail config + explicit approval",
      blockedByMail: !input.mailReady,
    });
  }

  if (initialReady > 0) {
    tasks.push({
      id: "retry-initial-paperwork",
      action: "retry",
      priority: "P1",
      title: "Retry eligible initial paperwork send",
      count: initialReady,
      detail:
        "1 open-store eligible packet. Production Dropbox quota may still be 0 — keep DROPBOX_SIGN_TEST_MODE intentional until quota restored.",
      command:
        "npx tsx scripts/p243-run-open-store-bulk-paperwork-queue.ts  # dry-run first; live only after flags + approval",
      blockedByMail: false,
    });
  }

  if (missingSig > 0) {
    tasks.push({
      id: "reconcile-missing-signature-request",
      action: "reconcile",
      priority: "P1",
      title: "Reconcile packets missing signatureRequestId",
      count: missingSig,
      detail:
        "Cannot remind without Dropbox signature request id — reconcile store or resend initial packet.",
      command: "npx tsx scripts/p244-run-open-store-reconciliation.ts",
      blockedByMail: false,
    });
  }

  if (invalidEmail > 0) {
    tasks.push({
      id: "manual-review-invalid-emails",
      action: "manual_review",
      priority: "P1",
      title: "Clean invalid emails in Breezy / workflow",
      count: invalidEmail,
      detail: "Excluded from reminders until addresses are fixed in Breezy.",
      command: null,
      blockedByMail: false,
    });
  }

  if (statusConflicts > 0) {
    tasks.push({
      id: "reconcile-status-conflicts",
      action: "reconcile",
      priority: "P2",
      title: "Apply safe status corrections when authorized",
      count: statusConflicts,
      detail:
        "Do not enable P246 --apply-safe-corrections until operator reviews reconciliation conflicts.",
      command:
        "npx tsx scripts/p246-run-outstanding-paperwork-reminders.ts  # preview only until authorized",
      blockedByMail: false,
    });
  }

  if (duplicates > 0) {
    tasks.push({
      id: "duplicate-cleanup",
      action: "duplicate_cleanup",
      priority: "P2",
      title: "Review duplicate candidate detections from dry-run",
      count: duplicates,
      detail:
        "Dry-run detected duplicates; confirm idempotency keys / store hygiene before live reminder batch.",
      command: null,
      blockedByMail: false,
    });
  }

  if (readyForMel > 0) {
    tasks.push({
      id: "manual-review-ready-for-mel",
      action: "manual_review",
      priority: "P1",
      title: "Advance Ready-for-MEL candidates (no MEL writes from this mission)",
      count: readyForMel,
      detail:
        "Candidates classified ready for MEL verification — recruiter review only; P251 does not write MEL.",
      command: null,
      blockedByMail: false,
    });
  }

  return {
    phase: P251_PHASE,
    generatedAt: new Date().toISOString(),
    opsDate: P251_OPS_DATE,
    mode: "read_only",
    tasks,
    sourceArtifacts: input.sourceArtifacts,
  };
}
