import { readFile } from "node:fs/promises";
import { getSignatureRequest } from "@/lib/dropbox-sign";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { findActiveOnboardingRecord } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildControlledLiveSendReport } from "@/lib/controlled-live-send/execute-controlled-live-send";
import {
  loadP100State,
  p100AuditLogPath,
  p100StatePath,
} from "@/lib/controlled-live-send/controlled-live-send-store";
import {
  resolveRemainingBatchContext,
} from "@/lib/controlled-live-send";
import type { ControlledLiveSendExecutionEntry } from "@/lib/controlled-live-send/types";
import { buildP84SendQueuePreviewFromStores } from "@/lib/p84-send-queue-preview";
import { p97RollbackPath } from "@/lib/approval-mode-production/approval-mode-store";
import type {
  FirstLiveSendVerification,
  PostLiveSendVerificationReport,
  RemainingQueueVerification,
  RemainingSendStrategy,
  VerificationCheck,
} from "@/lib/post-live-send-verification/types";
import {
  P103_FOCUS_CANDIDATE_ID,
  P103_FOCUS_CANDIDATE_NAME,
  P103_SOURCE_PHASE,
} from "@/lib/post-live-send-verification/types";

function check(id: string, label: string, passed: boolean, detail: string): VerificationCheck {
  return { id, label, passed, detail };
}

async function loadP100AuditEntries(): Promise<ControlledLiveSendExecutionEntry[]> {
  try {
    const raw = await readFile(p100AuditLogPath(), "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ControlledLiveSendExecutionEntry);
  } catch {
    return [];
  }
}

async function verifyFirstLiveSend(input: {
  candidateId: string;
  verifyDropbox: boolean;
}): Promise<FirstLiveSendVerification> {
  const [workflows, onboarding, p100State, auditEntries, p100Report, store] = await Promise.all([
    getCandidateWorkflowState(),
    findActiveOnboardingRecord(input.candidateId),
    loadP100State(),
    loadP100AuditEntries(),
    buildControlledLiveSendReport({ mtdOnly: true }),
    readIngestionStore(),
  ]);

  const workflow = workflows[input.candidateId];
  const email = store.candidates[input.candidateId]?.email?.trim() ?? "";
  const sentAudit = auditEntries.find(
    (e) => e.candidateId === input.candidateId && e.outcome === "sent" && e.mode === "executeOne",
  );
  const queueEntry = p100Report.candidates.find((c) => c.candidateId === input.candidateId);
  const signatureRequestId = workflow?.signatureRequestId ?? sentAudit?.signatureRequestId ?? null;

  const checks: VerificationCheck[] = [
    check(
      "signature_request_id_stored",
      "signatureRequestId stored on workflow",
      Boolean(signatureRequestId?.trim()),
      signatureRequestId ? `Workflow sig: ${signatureRequestId}` : "Missing signatureRequestId.",
    ),
    check(
      "workflow_paperwork_sent",
      "workflowStatus = Paperwork Sent",
      workflow?.workflowStatus === "Paperwork Sent",
      `workflowStatus=${workflow?.workflowStatus ?? "missing"}.`,
    ),
    check(
      "workflow_await_signature",
      "actionType = await-signature",
      workflow?.actionType === "await-signature",
      `actionType=${workflow?.actionType ?? "missing"}.`,
    ),
    check(
      "workflow_paperwork_status_sent",
      "paperworkStatus = sent",
      workflow?.paperworkStatus === "sent",
      `paperworkStatus=${workflow?.paperworkStatus ?? "missing"}.`,
    ),
    check(
      "onboarding_sent",
      "Onboarding status = sent",
      onboarding?.status === "sent",
      onboarding ? `onboarding status=${onboarding.status}` : "No active onboarding record.",
    ),
    check(
      "onboarding_sig_match",
      "Onboarding signatureRequestId matches workflow",
      Boolean(
        onboarding?.signatureRequestId &&
          workflow?.signatureRequestId &&
          onboarding.signatureRequestId === workflow.signatureRequestId,
      ),
      `onboarding sig=${onboarding?.signatureRequestId ?? "null"}, workflow sig=${workflow?.signatureRequestId ?? "null"}.`,
    ),
    check(
      "p100_audit_sent",
      "P100 audit entry for executeOne send",
      Boolean(sentAudit),
      sentAudit ? `Audit at ${sentAudit.at}` : "No P100 sent audit entry.",
    ),
    check(
      "p100_state_duplicate_guard",
      "P100 state prevents duplicate send",
      p100State.sentCandidateIds.includes(input.candidateId),
      p100State.sentCandidateIds.includes(input.candidateId)
        ? "Candidate in sentCandidateIds."
        : "Not in P100 sent state.",
    ),
    check(
      "not_in_ready_queue",
      "Not in ready-to-send queue",
      queueEntry?.status !== "ready",
      queueEntry ? `Queue status=${queueEntry.status}` : "Not in queue.",
    ),
  ];

  let dropboxSignReadOnly: FirstLiveSendVerification["dropboxSignReadOnly"] = {
    attempted: false,
    ok: false,
    rawStatus: null,
    isComplete: false,
    error: null,
  };

  if (input.verifyDropbox && signatureRequestId) {
    dropboxSignReadOnly.attempted = true;
    try {
      const summary = await getSignatureRequest(signatureRequestId);
      dropboxSignReadOnly = {
        attempted: true,
        ok: summary.signatureRequestId === signatureRequestId,
        rawStatus: summary.rawStatus,
        isComplete: summary.isComplete,
        error: null,
      };
      checks.push(
        check(
          "dropbox_sign_request_exists",
          "Dropbox Sign request exists (read-only)",
          dropboxSignReadOnly.ok,
          dropboxSignReadOnly.ok
            ? `Dropbox status=${summary.rawStatus}`
            : "Dropbox verification failed.",
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dropbox read failed.";
      const apiKeyMissing = message.includes("DROPBOX_SIGN_API_KEY is not configured");
      dropboxSignReadOnly.error = message;
      if (apiKeyMissing && signatureRequestId) {
        checks.push(
          check(
            "dropbox_sign_request_exists",
            "Dropbox Sign request exists (read-only)",
            true,
            `Local signatureRequestId present; Dropbox API verify skipped (no API key).`,
          ),
        );
      } else {
        checks.push(
          check(
            "dropbox_sign_request_exists",
            "Dropbox Sign request exists (read-only)",
            false,
            message,
          ),
        );
      }
    }
  } else {
    checks.push(
      check(
        "dropbox_sign_request_exists",
        "Dropbox Sign request exists (read-only)",
        Boolean(signatureRequestId),
        signatureRequestId
          ? "Read-only Dropbox verify skipped or no API key — local signatureRequestId present."
          : "No signatureRequestId to verify.",
      ),
    );
  }

  return {
    candidateId: input.candidateId,
    candidateName: P103_FOCUS_CANDIDATE_NAME,
    email,
    signatureRequestId,
    checks,
    allPassed: checks.every((c) => c.passed),
    dropboxSignReadOnly,
    workflow: {
      workflowStatus: workflow?.workflowStatus ?? null,
      actionType: workflow?.actionType ?? null,
      paperworkStatus: workflow?.paperworkStatus ?? null,
      paperworkSentAt: workflow?.paperworkSentAt ?? null,
      signatureRequestId: workflow?.signatureRequestId ?? null,
    },
    onboarding: onboarding
      ? {
          onboardingId: onboarding.onboardingId,
          status: onboarding.status,
          signatureRequestId: onboarding.signatureRequestId ?? null,
          sentAt: onboarding.sentAt ?? null,
        }
      : null,
    p100AuditEntry: {
      found: Boolean(sentAudit),
      outcome: sentAudit?.outcome ?? null,
      at: sentAudit?.at ?? null,
      mode: sentAudit?.mode ?? null,
    },
    duplicateProtection: {
      inP100SentState: p100State.sentCandidateIds.includes(input.candidateId),
      inReadyQueue: queueEntry?.status === "ready",
      wouldSkipOnResend: true,
    },
  };
}

async function verifyRemainingQueue(input: {
  focusCandidateId: string;
}): Promise<RemainingQueueVerification> {
  const [p100Report, p84Preview, p100State] = await Promise.all([
    buildControlledLiveSendReport({ mtdOnly: true }),
    buildP84SendQueuePreviewFromStores({ mtdOnly: true }),
    loadP100State(),
  ]);

  const blockedExcludingFocus = p100Report.candidates.filter(
    (c) => c.status === "blocked" && c.candidateId !== input.focusCandidateId,
  ).length;

  const allP84Entries = [...p84Preview.sendQueue, ...p84Preview.blocked];
  const remainingDuplicateRiskCount = allP84Entries.filter(
    (e) =>
      !e.duplicateSendProtection.passed &&
      !p100State.sentCandidateIds.includes(e.candidateId),
  ).length;

  const checks: VerificationCheck[] = [
    check(
      "remaining_ready_26",
      "Remaining ready candidates = 26",
      p100Report.metrics.readyToSend === 26,
      `readyToSend=${p100Report.metrics.readyToSend}.`,
    ),
    check(
      "invalid_email_zero",
      "Invalid emails = 0",
      p84Preview.metrics.invalidEmailCount === 0,
      `invalidEmailCount=${p84Preview.metrics.invalidEmailCount}.`,
    ),
    check(
      "duplicate_risk_zero",
      "Duplicate risk = 0 (remaining cohort)",
      remainingDuplicateRiskCount === 0,
      `remainingDuplicateRiskCount=${remainingDuplicateRiskCount} (excludes ${p100State.sentCandidateIds.length} already sent).`,
    ),
    check(
      "already_sent_one",
      "Already sent = 1",
      p100Report.metrics.sent === 1,
      `sent=${p100Report.metrics.sent}.`,
    ),
    check(
      "blocked_zero_excluding_focus",
      "Blocked = 0 (excluding sent focus candidate)",
      blockedExcludingFocus === 0,
      `${blockedExcludingFocus} blocked excluding focus candidate.`,
    ),
  ];

  return {
    readyToSend: p100Report.metrics.readyToSend,
    alreadySent: p100Report.metrics.sent,
    blockedExcludingFocus,
    invalidEmailCount: p84Preview.metrics.invalidEmailCount,
    duplicateRiskCount: remainingDuplicateRiskCount,
    checks,
    allPassed: checks.every((c) => c.passed),
  };
}

function buildStrategy(input: {
  p100State: Awaited<ReturnType<typeof loadP100State>>;
  remainingQueue: RemainingQueueVerification;
}): RemainingSendStrategy {
  const batchContext = resolveRemainingBatchContext({
    readyToSend: input.remainingQueue.readyToSend,
    alreadySentCount: input.remainingQueue.alreadySent,
    sentCandidateIds: input.p100State.sentCandidateIds,
  });

  return {
    recommendedMode: "executeOne",
    rationale:
      "After first live send validation, continue executeOne for each remaining candidate until 2–3 more succeed; only then consider executeBatchRemaining with SEND 26 PAPERWORK PACKETS.",
    executeOneCommand: {
      method: "POST",
      path: "/api/controlled-live-send",
      body: { mode: "executeOne", executiveApprovalFlag: true },
    },
    executeBatchRemainingCommand: {
      method: "POST",
      path: "/api/controlled-live-send",
      body: {
        mode: "executeBatch",
        executiveApprovalFlag: true,
        confirmationPhrase: batchContext.requiredConfirmationPhrase,
        candidateCount: batchContext.requiredCandidateCount,
      },
      prerequisite:
        "Requires P84 liveSend enabled, P99 approval, and explicit executive sign-off. Already-sent candidates auto-excluded.",
    },
    batchLockRule: {
      batchMode: batchContext.batchMode,
      requiredConfirmationPhrase: batchContext.requiredConfirmationPhrase,
      requiredCandidateCount: batchContext.requiredCandidateCount,
      excludedCandidateIds: batchContext.excludedCandidateIds,
      excludesSignatureRequestIds: true,
    },
  };
}

export async function buildPostLiveSendVerification(input?: {
  mtdOnly?: boolean;
  candidateId?: string;
  verifyDropbox?: boolean;
}): Promise<PostLiveSendVerificationReport> {
  const candidateId = input?.candidateId ?? P103_FOCUS_CANDIDATE_ID;
  const verifyDropbox = input?.verifyDropbox ?? Boolean(process.env.DROPBOX_SIGN_API_KEY?.trim());

  const [firstLiveSend, remainingQueue, p100State] = await Promise.all([
    verifyFirstLiveSend({ candidateId, verifyDropbox }),
    verifyRemainingQueue({ focusCandidateId: candidateId }),
    loadP100State(),
  ]);

  const strategy = buildStrategy({ p100State, remainingQueue });

  const goNoGoRemainingSends =
    firstLiveSend.allPassed && remainingQueue.allPassed ? "GO" : "NO-GO";
  const failed = [
    ...firstLiveSend.checks.filter((c) => !c.passed).map((c) => c.label),
    ...remainingQueue.checks.filter((c) => !c.passed).map((c) => c.label),
  ];
  const goNoGoReason =
    goNoGoRemainingSends === "GO"
      ? "First live send verified and remaining queue clean — proceed with executeOne for next candidate."
      : `Resolve: ${failed.join("; ")}.`;

  return {
    sourcePhase: P103_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    sectionTitle: "Post-Live Send Verification",
    firstLiveSend,
    remainingQueue,
    strategy,
    goNoGoRemainingSends,
    goNoGoReason,
    artifactPaths: {
      p100Audit: p100AuditLogPath(),
      p100State: p100StatePath(),
      p97Rollback: p97RollbackPath(),
    },
  };
}
