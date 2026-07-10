import { readFile } from "node:fs/promises";
import { canLiveSendPaperwork, loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import type { P84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/types";
import {
  loadP97RollbackFile,
  p97AuditLogPath,
  p97RollbackPath,
} from "@/lib/approval-mode-production/approval-mode-store";
import { loadLiveSendReadinessApproval } from "@/lib/live-send-readiness/live-send-readiness-store";
import { loadP97AuditCandidateIds } from "@/lib/live-send-readiness/load-audit-candidate-ids";
import type {
  ControlledLiveSendLock,
  ControlledLiveSendMode,
  ControlledLiveSendReport,
} from "@/lib/controlled-live-send/types";
import {
  P100_CONFIRMATION_PHRASE,
  P100_EXPECTED_CANDIDATE_COUNT,
  P100_REMAINING_BATCH_PHRASE,
  P100_SOURCE_PHASE,
} from "@/lib/controlled-live-send/types";
import { isValidBatchConfirmation, resolveRemainingBatchContext } from "@/lib/controlled-live-send/resolve-remaining-batch-context";
import { p100AuditLogPath, p100StatePath } from "@/lib/controlled-live-send/controlled-live-send-store";

export type ExecutionLockInput = {
  mode: ControlledLiveSendMode;
  executiveApprovalFlag?: boolean;
  confirmationPhrase?: string;
  candidateCount?: number;
  readinessApproved: boolean;
  rollbackEntryCount: number;
  auditEntryCount: number;
  blockedCount: number;
  readyCount: number;
  alreadySentCount: number;
  sentCandidateIds: string[];
  p84Flags: P84FeatureFlags;
};

export async function countP97AuditEntries(): Promise<number> {
  try {
    const raw = await readFile(p97AuditLogPath(), "utf8");
    return raw.split("\n").filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
}

export function validateExecutionLocks(input: ExecutionLockInput): ControlledLiveSendLock[] {
  const isLiveMode = input.mode === "executeOne" || input.mode === "executeBatch";
  const isBatch = input.mode === "executeBatch";
  const batchContext = resolveRemainingBatchContext({
    readyToSend: input.readyCount,
    alreadySentCount: input.alreadySentCount,
    sentCandidateIds: input.sentCandidateIds,
  });
  const batchPhraseValid =
    isBatch &&
    isValidBatchConfirmation({
      confirmationPhrase: input.confirmationPhrase,
      candidateCount: input.candidateCount,
      readyToSend: input.readyCount,
      alreadySentCount: input.alreadySentCount,
      sentCandidateIds: input.sentCandidateIds,
    });

  const locks: ControlledLiveSendLock[] = [
    {
      id: "p99_readiness_approved",
      label: "P99 readiness approval exists",
      satisfied: input.readinessApproved,
      detail: input.readinessApproved
        ? "Executive P99 readiness approval on file."
        : "POST /api/live-send-readiness/approve required first.",
    },
    {
      id: "rollback_artifact_present",
      label: "Rollback artifact exists",
      satisfied: input.rollbackEntryCount > 0,
      detail:
        input.rollbackEntryCount > 0
          ? `${input.rollbackEntryCount} P97 rollback snapshot(s).`
          : "P97 rollback artifact missing.",
    },
    {
      id: "audit_log_present",
      label: "Audit log exists",
      satisfied: input.auditEntryCount > 0,
      detail:
        input.auditEntryCount > 0
          ? `${input.auditEntryCount} P97 audit entry(ies).`
          : "P97 audit log missing.",
    },
    {
      id: "live_send_enabled",
      label: "P84 liveSend explicitly enabled",
      satisfied: !isLiveMode || canLiveSendPaperwork(input.p84Flags),
      detail: canLiveSendPaperwork(input.p84Flags)
        ? "P84 enabled + liveMode + liveSend are true."
        : isLiveMode
          ? "Enable P84 enabled, liveMode, and liveSend before live execution."
          : "Not required for dryRun.",
    },
    {
      id: "executive_approval_flag",
      label: "Executive approval flag",
      satisfied: !isLiveMode || input.executiveApprovalFlag === true,
      detail:
        input.executiveApprovalFlag === true
          ? "executiveApprovalFlag confirmed."
          : isLiveMode
            ? "executiveApprovalFlag must be true for live execution."
            : "Not required for dryRun.",
    },
    {
      id: "confirmation_phrase_verified",
      label: "Batch confirmation phrase",
      satisfied: !isBatch || (batchPhraseValid && input.executiveApprovalFlag === true),
      detail: isBatch
        ? batchContext.detail
        : "Required only for executeBatch.",
    },
    {
      id: "candidate_count_confirmed",
      label: "Candidate count confirmation",
      satisfied:
        !isBatch ||
        (input.candidateCount === batchContext.requiredCandidateCount &&
          input.readyCount === batchContext.requiredCandidateCount),
      detail: isBatch
        ? `Must confirm ${batchContext.requiredCandidateCount} remaining candidate(s) (${batchContext.batchMode}).`
        : "Required only for executeBatch.",
    },
    {
      id: "no_blocked_candidates",
      label: "No blocked candidates at execution time",
      satisfied: input.blockedCount === 0,
      detail:
        input.blockedCount === 0
          ? "All candidates pass P84 eligibility recheck."
          : `${input.blockedCount} candidate(s) blocked at execution time.`,
    },
  ];

  return locks;
}

export function assertExecutionLocksPass(locks: ControlledLiveSendLock[], mode: ControlledLiveSendMode): void {
  const required = locks.filter((lock) => {
    if (mode === "dryRun") {
      return ["p99_readiness_approved", "rollback_artifact_present", "audit_log_present"].includes(lock.id);
    }
    if (mode === "executeOne") {
      return lock.id !== "confirmation_phrase_verified" && lock.id !== "candidate_count_confirmed";
    }
    return true;
  });

  const failed = required.filter((lock) => !lock.satisfied);
  if (failed.length > 0) {
    throw new Error(
      `Controlled live send blocked: ${failed.map((lock) => lock.label).join("; ")}.`,
    );
  }
}

export function resolveGoNoGo(locks: ControlledLiveSendLock[]): {
  goNoGo: ControlledLiveSendReport["goNoGo"];
  goNoGoReason: string;
} {
  const unsatisfied = locks.filter((lock) => !lock.satisfied);
  if (unsatisfied.length === 0) {
    return {
      goNoGo: "go",
      goNoGoReason: "All safety locks satisfied for controlled live send (dryRun default; live requires POST).",
    };
  }
  return {
    goNoGo: "no-go",
    goNoGoReason: unsatisfied.map((lock) => lock.detail).join(" "),
  };
}

export async function loadExecutionLockContext(): Promise<{
  readinessApproved: boolean;
  rollbackEntryCount: number;
  auditEntryCount: number;
  p84Flags: P84FeatureFlags;
}> {
  const [approvalFile, rollback, auditIds, p84Flags, auditLineCount] = await Promise.all([
    loadLiveSendReadinessApproval(),
    loadP97RollbackFile(),
    loadP97AuditCandidateIds(),
    loadP84FeatureFlags(),
    countP97AuditEntries(),
  ]);

  return {
    readinessApproved: Boolean(approvalFile.approval?.approved),
    rollbackEntryCount: rollback.entries.length,
    auditEntryCount: Math.max(auditIds.size, auditLineCount),
    p84Flags,
  };
}

export function buildReportPaths(): {
  auditLogPath: string;
  rollbackArtifactPath: string;
  executionStatePath: string;
} {
  return {
    auditLogPath: p100AuditLogPath(),
    rollbackArtifactPath: p97RollbackPath(),
    executionStatePath: p100StatePath(),
  };
}

export { P100_CONFIRMATION_PHRASE, P100_EXPECTED_CANDIDATE_COUNT, P100_SOURCE_PHASE };
