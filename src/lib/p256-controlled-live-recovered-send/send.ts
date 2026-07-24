import { prepareOnboardingSend } from "@/lib/autonomous-paperwork-send-engine/prepare-onboarding-send";
import { executeOnboardingSend } from "@/lib/candidate-onboarding-send-queue/execute-onboarding-send";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import { sendTemplateSignatureRequestProductionOnly } from "@/lib/p192-supervised-paperwork-runner/productionMode";
import {
  assertDuplicateProtectionIntact,
  recheckP253CandidateLive,
} from "@/lib/p253-controlled-live-paperwork-send/eligibility";
import { assertP256CandidateAuthorized } from "@/lib/p256-controlled-live-recovered-send/cohort";
import type { P256EligibilityEval } from "@/lib/p256-controlled-live-recovered-send/eligibility";
import {
  P256_BY_USER,
  type P256AuditEntry,
  type P256CandidateRow,
  type P256Counts,
  type P256ProductionPreflight,
} from "@/lib/p256-controlled-live-recovered-send/types";

export type P256SendLoopResult = {
  counts: P256Counts;
  rows: P256CandidateRow[];
  auditTrail: P256AuditEntry[];
  aborted: boolean;
  abortReason: string | null;
  createdRequestIds: Array<{ candidateId: string; signatureRequestId: string }>;
};

/**
 * Controlled one-by-one production send for authorized recovered candidates only.
 * No bulk send. No retries on failure. Abort candidate if any live gate fails.
 */
export async function runP256LiveSendLoop(input: {
  eligibility: P256EligibilityEval;
  preflight: P256ProductionPreflight;
  emailByCandidateId: Map<string, string>;
  authorizedIds: ReadonlySet<string>;
}): Promise<P256SendLoopResult> {
  const counts = { ...input.eligibility.counts };
  const rows = input.eligibility.rows.map((r) => ({ ...r }));
  const byId = new Map(rows.map((r) => [r.candidateId, r]));
  const auditTrail: P256AuditEntry[] = [];
  const createdRequestIds: Array<{ candidateId: string; signatureRequestId: string }> =
    [];

  // Hard safety: eligible set must be subset of authorized allowlist.
  for (const id of input.eligibility.eligibleIds) {
    assertP256CandidateAuthorized(id, input.authorizedIds);
  }

  const dup = assertDuplicateProtectionIntact({
    rows: input.eligibility.p253.rows,
    emailOwners: input.eligibility.emailOwners,
  });
  if (!dup.ok) {
    auditTrail.push({
      at: new Date().toISOString(),
      action: "abort_duplicate_protection",
      candidateId: null,
      detail: dup.detail,
    });
    return {
      counts,
      rows,
      auditTrail,
      aborted: true,
      abortReason: dup.detail,
      createdRequestIds,
    };
  }

  if (!input.preflight.ok) {
    for (const id of input.eligibility.eligibleIds) {
      const row = byId.get(id);
      if (!row) continue;
      row.result = "skipped_quota_abort";
      row.error = input.preflight.detail;
      row.eligible = false;
      counts.eligible = Math.max(0, counts.eligible - 1);
      counts.skipped += 1;
    }
    auditTrail.push({
      at: new Date().toISOString(),
      action: "abort_preflight",
      candidateId: null,
      detail: input.preflight.detail,
    });
    return {
      counts,
      rows,
      auditTrail,
      aborted: true,
      abortReason: input.preflight.detail,
      createdRequestIds,
    };
  }

  for (const candidateId of input.eligibility.eligibleIds) {
    assertP256CandidateAuthorized(candidateId, input.authorizedIds);
    const row = byId.get(candidateId);
    if (!row) continue;

    const liveDup = assertDuplicateProtectionIntact({
      rows: input.eligibility.p253.rows,
      emailOwners: input.eligibility.emailOwners,
    });
    if (!liveDup.ok) {
      auditTrail.push({
        at: new Date().toISOString(),
        action: "abort_duplicate_protection",
        candidateId,
        detail: liveDup.detail,
      });
      return {
        counts,
        rows,
        auditTrail,
        aborted: true,
        abortReason: liveDup.detail,
        createdRequestIds,
      };
    }

    const workflows = await getCandidateWorkflowState();
    const onboardingRecords = await listAllCandidateOnboardingRecords();
    const onboarding =
      onboardingRecords.find((r) => r.candidateId === candidateId) ?? null;
    const recheck = recheckP253CandidateLive({
      workflow: workflows[candidateId],
      onboarding,
      priorSentIds: input.eligibility.priorSentIds,
      candidateId,
    });

    if (!recheck.ok) {
      row.eligible = false;
      row.blockers = recheck.blockers;
      row.result =
        recheck.skipCode === "already_signed"
          ? "already_signed"
          : recheck.skipCode === "already_sent" ||
              recheck.skipCode === "skipped_new_packet"
            ? "skipped_new_packet"
            : "gate_failed_after_refresh";
      row.error = recheck.blockers.join(", ");
      counts.eligible = Math.max(0, counts.eligible - 1);
      counts.skipped += 1;
      counts.gateFailed += 1;
      if (row.result === "already_signed") counts.alreadySigned += 1;
      if (row.result === "skipped_new_packet") counts.alreadySent += 1;
      auditTrail.push({
        at: new Date().toISOString(),
        action: "skip_recheck",
        candidateId,
        detail: row.error ?? "state change",
      });
      continue;
    }

    const email = (input.emailByCandidateId.get(candidateId) ?? row.email ?? "").trim();
    if (!email.includes("@")) {
      row.result = "failed";
      row.error = "missing_email at send time";
      counts.failures += 1;
      counts.eligible = Math.max(0, counts.eligible - 1);
      auditTrail.push({
        at: new Date().toISOString(),
        action: "send_failed",
        candidateId,
        detail: row.error,
      });
      continue;
    }

    auditTrail.push({
      at: new Date().toISOString(),
      action: "send_attempt",
      candidateId,
      detail: `Production Dropbox send for ${row.name} (P256 recovered cohort, one-by-one)`,
    });

    try {
      const prepared = await prepareOnboardingSend({
        candidateId,
        templateKey: "onboarding_packet",
        actionType: "send-paperwork",
        orchestratorRunId: "P256",
      });

      const workflows2 = await getCandidateWorkflowState();
      if (
        workflows2[candidateId]?.signatureRequestId ||
        prepared.signatureRequestId ||
        workflows2[candidateId]?.workflowStatus !== "Paperwork Needed"
      ) {
        row.eligible = false;
        row.blockers = ["active_packet_or_state_change"];
        row.result = "skipped_new_packet";
        row.error = row.blockers.join(", ");
        counts.eligible = Math.max(0, counts.eligible - 1);
        counts.skipped += 1;
        counts.alreadySent += 1;
        auditTrail.push({
          at: new Date().toISOString(),
          action: "skip_pre_dropbox_recheck",
          candidateId,
          detail: row.error,
        });
        continue;
      }

      const sendResult = await executeOnboardingSend(
        {
          candidateId,
          candidateName: row.name,
          candidateEmail: email,
          templateKey: "onboarding_packet",
          byUserId: P256_BY_USER,
          inFlightOnboardingId: prepared.onboardingId,
          recordWorkflowFailureOnError: false,
        },
        {
          sendTemplateSignatureRequest: sendTemplateSignatureRequestProductionOnly,
        },
      );

      if (!sendResult.ok || !sendResult.signatureRequestId) {
        row.result = "failed";
        row.error = sendResult.ok
          ? "missing signatureRequestId"
          : sendResult.error;
        counts.failures += 1;
        counts.eligible = Math.max(0, counts.eligible - 1);
        auditTrail.push({
          at: new Date().toISOString(),
          action: "send_failed",
          candidateId,
          detail: row.error,
        });
        // Never retry this candidate in the same run.
        continue;
      }

      // Persist workflow Paperwork Sent only after successful packet creation.
      await upsertCandidateWorkflow({
        candidateId,
        actionType: "await-signature",
        requiredAction: "Paperwork sent — awaiting signature.",
        actionReason: "P256 controlled live recovered-candidate production paperwork send completed.",
        audit: {
          action: "p256_controlled_live_recovered_send",
          byUserId: P256_BY_USER,
          metadata: {
            signatureRequestId: sendResult.signatureRequestId,
            recruiter: row.recruiter,
            districtManager: row.districtManager,
            sentAt: new Date().toISOString(),
          },
        },
      });

      const sentAt = new Date().toISOString();
      row.result = "sent";
      row.signatureRequestId = sendResult.signatureRequestId;
      row.sentAt = sentAt;
      row.error = null;
      row.paperworkStatus = "sent";
      row.workflowStatus = "Paperwork Sent";
      counts.sent += 1;
      createdRequestIds.push({
        candidateId,
        signatureRequestId: sendResult.signatureRequestId,
      });
      input.eligibility.priorSentIds.add(candidateId);
      auditTrail.push({
        at: sentAt,
        action: "send_success",
        candidateId,
        detail: `recruiter=${row.recruiter}; dm=${row.districtManager}`,
        signatureRequestId: sendResult.signatureRequestId,
      });
    } catch (error) {
      row.result = "failed";
      row.error = error instanceof Error ? error.message : String(error);
      counts.failures += 1;
      counts.eligible = Math.max(0, counts.eligible - 1);
      auditTrail.push({
        at: new Date().toISOString(),
        action: "send_failed",
        candidateId,
        detail: row.error,
      });
      // No retry — continue remaining authorized candidate only.
    }
  }

  return {
    counts,
    rows,
    auditTrail,
    aborted: false,
    abortReason: null,
    createdRequestIds,
  };
}
