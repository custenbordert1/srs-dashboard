import { canLiveSendPaperwork, loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import {
  loadP97RollbackFile,
  loadP97State,
  p97AuditLogPath,
  p97RollbackPath,
} from "@/lib/approval-mode-production/approval-mode-store";
import { buildControlledLiveSendReport } from "@/lib/controlled-live-send/execute-controlled-live-send";
import { p100AuditLogPath, p100StatePath } from "@/lib/controlled-live-send/controlled-live-send-store";
import { countP97AuditEntries } from "@/lib/controlled-live-send/validate-execution-locks";
import { buildP84SendQueuePreviewFromStores } from "@/lib/p84-send-queue-preview";
import { loadLiveSendReadinessApproval, p99ApprovalPath } from "@/lib/live-send-readiness/live-send-readiness-store";
import type {
  LiveSendOperatorChecklistReport,
  OperatorChecklistItem,
} from "@/lib/live-send-operator-checklist/types";
import { P101_EXPECTED_CANDIDATE_COUNT, P101_SOURCE_PHASE } from "@/lib/live-send-operator-checklist/types";

function item(
  id: OperatorChecklistItem["id"],
  label: string,
  satisfied: boolean,
  detail: string,
): OperatorChecklistItem {
  return { id, label, satisfied, detail };
}

function buildRemainingActions(checklist: OperatorChecklistItem[]): string[] {
  const actions: string[] = [];
  for (const entry of checklist) {
    if (entry.satisfied) continue;
    switch (entry.id) {
      case "p97_persistence_complete":
        actions.push("Complete P97 approval-mode persistence for all 27 candidates.");
        break;
      case "p99_readiness_approved":
        actions.push("POST /api/live-send-readiness/approve with executive confirmation phrase.");
        break;
      case "p100_controlled_send_ready":
        actions.push("Resolve P100 blocked candidates — rerun GET /api/controlled-live-send.");
        break;
      case "p84_live_send_enabled":
        actions.push("Enable P84 enabled + liveMode + liveSend via executive flags API (not automatic).");
        break;
      case "rollback_artifact_present":
        actions.push("Ensure P97 rollback artifact exists for all persisted candidates.");
        break;
      case "audit_log_present":
        actions.push("Ensure P97 audit log contains approval_persist entries.");
        break;
      case "candidate_count_27":
        actions.push(`Verify cohort has exactly ${P101_EXPECTED_CANDIDATE_COUNT} persisted candidates.`);
        break;
      case "duplicate_risk_zero":
        actions.push("Resolve duplicate-send protection risks before live send.");
        break;
      case "invalid_email_zero":
        actions.push("Fix missing/invalid candidate emails before live send.");
        break;
      case "already_sent_zero":
        actions.push("Investigate already-sent candidates — batch should start from zero sends.");
        break;
      default:
        actions.push(entry.detail);
    }
  }
  if (actions.length === 0) {
    actions.push("All checklist items satisfied — proceed with executeOne for first live send.");
  }
  return actions;
}

export async function buildLiveSendOperatorChecklist(input?: {
  mtdOnly?: boolean;
}): Promise<LiveSendOperatorChecklistReport> {
  const generatedAt = new Date().toISOString();

  const [
    p97State,
    p99Approval,
    p100Report,
    p84Preview,
    p84Flags,
    rollback,
    auditLineCount,
  ] = await Promise.all([
    loadP97State(),
    loadLiveSendReadinessApproval(),
    buildControlledLiveSendReport({ mtdOnly: input?.mtdOnly }),
    buildP84SendQueuePreviewFromStores(input),
    loadP84FeatureFlags(),
    loadP97RollbackFile(),
    countP97AuditEntries(),
  ]);

  const p97PersistedCount = p97State.persisted.length;
  const p99Approved = Boolean(p99Approval.approval?.approved);
  const liveSendReady = canLiveSendPaperwork(p84Flags);
  const duplicateRiskCount = p84Preview.metrics.duplicateRiskCount;
  const invalidEmailCount = p84Preview.metrics.invalidEmailCount;
  const alreadySentCount = p100Report.metrics.sent;
  const candidateCount = p100Report.metrics.totalCandidates;

  const checklist: OperatorChecklistItem[] = [
    item(
      "p97_persistence_complete",
      "P97 persistence complete",
      p97PersistedCount === P101_EXPECTED_CANDIDATE_COUNT,
      `${p97PersistedCount}/${P101_EXPECTED_CANDIDATE_COUNT} candidate(s) persisted in P97 state.`,
    ),
    item(
      "p99_readiness_approved",
      "P99 readiness approval status",
      p99Approved,
      p99Approved
        ? `Approved by ${p99Approval.approval?.approvedBy ?? "executive"}.`
        : "P99 readiness approval not recorded.",
    ),
    item(
      "p100_controlled_send_ready",
      "P100 controlled send readiness",
      p100Report.metrics.readyToSend === P101_EXPECTED_CANDIDATE_COUNT &&
        p100Report.metrics.failed === 0,
      `${p100Report.metrics.readyToSend} ready, ${p100Report.metrics.failed} failed/blocked.`,
    ),
    item(
      "p84_live_send_enabled",
      "P84 liveSend status",
      liveSendReady,
      liveSendReady
        ? "P84 enabled + liveMode + liveSend are true."
        : `liveSend=${p84Flags.liveSend}, liveMode=${p84Flags.liveMode}, enabled=${p84Flags.enabled}.`,
    ),
    item(
      "rollback_artifact_present",
      "Rollback artifact present",
      rollback.entries.length >= P101_EXPECTED_CANDIDATE_COUNT,
      `${rollback.entries.length} rollback snapshot(s) on disk.`,
    ),
    item(
      "audit_log_present",
      "Audit log present",
      auditLineCount >= P101_EXPECTED_CANDIDATE_COUNT,
      `${auditLineCount} P97 audit log line(s).`,
    ),
    item(
      "candidate_count_27",
      "Candidate count = 27",
      candidateCount === P101_EXPECTED_CANDIDATE_COUNT,
      `${candidateCount} candidate(s) in P100 controlled-send cohort.`,
    ),
    item(
      "duplicate_risk_zero",
      "Duplicate risk = 0",
      duplicateRiskCount === 0,
      `${duplicateRiskCount} candidate(s) with duplicate-send risk.`,
    ),
    item(
      "invalid_email_zero",
      "Invalid email = 0",
      invalidEmailCount === 0,
      `${invalidEmailCount} candidate(s) with missing/invalid email.`,
    ),
    item(
      "already_sent_zero",
      "Already sent = 0",
      alreadySentCount === 0,
      `${alreadySentCount} candidate(s) already sent in P100 state.`,
    ),
  ];

  const unsatisfied = checklist.filter((entry) => !entry.satisfied);
  const goNoGo = unsatisfied.length === 0 ? "GO" : "NO-GO";
  const goNoGoReason =
    goNoGo === "GO"
      ? "All operator checklist items satisfied — cleared for controlled executeOne after executive sign-off."
      : unsatisfied.map((entry) => `${entry.label}: ${entry.detail}`).join(" ");

  const remainingActionsBeforeExecuteOne = buildRemainingActions(checklist);

  return {
    sourcePhase: P101_SOURCE_PHASE,
    generatedAt,
    sectionTitle: "Live Send Operator Checklist",
    cohortLabel: "Final operator guard before any live paperwork send",
    goNoGo,
    goNoGoReason,
    checklist,
    metrics: {
      p97PersistedCount,
      p99ReadinessApproved: p99Approved,
      p100ReadyToSend: p100Report.metrics.readyToSend,
      p100AlreadySent: alreadySentCount,
      candidateCount,
      duplicateRiskCount,
      invalidEmailCount,
      liveSend: p84Flags.liveSend,
      p84Enabled: p84Flags.enabled,
      p84LiveMode: p84Flags.liveMode,
    },
    remainingActionsBeforeExecuteOne,
    recommendedFirstLiveSendApproach: [
      "1. Confirm this checklist shows GO.",
      "2. Run POST /api/controlled-live-send with mode=dryRun (no sends).",
      "3. Enable P84 liveSend explicitly via executive flags (if not already on).",
      "4. Send exactly one candidate: POST /api/controlled-live-send mode=executeOne.",
      "5. Verify signatureRequestId in workflow + P100 audit before continuing.",
      "6. Only after executeOne success, consider executeBatch with confirmation phrase.",
    ],
    artifactPaths: {
      p97Rollback: p97RollbackPath(),
      p97Audit: p97AuditLogPath(),
      p99Approval: p99ApprovalPath(),
      p100State: p100StatePath(),
      p100Audit: p100AuditLogPath(),
    },
    executeOneCommand: {
      method: "POST",
      path: "/api/controlled-live-send",
      body: {
        mode: "executeOne",
        executiveApprovalFlag: true,
      },
    },
    executeBatchCommand: {
      method: "POST",
      path: "/api/controlled-live-send",
      body: {
        mode: "executeBatch",
        executiveApprovalFlag: true,
        confirmationPhrase: "SEND 27 PAPERWORK PACKETS",
        candidateCount: P101_EXPECTED_CANDIDATE_COUNT,
      },
      prerequisite: "P84 liveSend must be enabled before batch send.",
    },
  };
}
