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
  type P253EligibilityEval,
} from "@/lib/p253-controlled-live-paperwork-send/eligibility";
import {
  P253_BY_USER,
  type P253AuditEntry,
  type P253CandidateRow,
  type P253Counts,
  type P253ProductionPreflight,
} from "@/lib/p253-controlled-live-paperwork-send/types";

export type P253SendLoopResult = {
  counts: P253Counts;
  rows: P253CandidateRow[];
  auditTrail: P253AuditEntry[];
  aborted: boolean;
  abortReason: string | null;
  createdRequestIds: Array<{ candidateId: string; signatureRequestId: string }>;
};

/**
 * Live production send loop. Never retries a successful/ambiguous create.
 * Continues on candidate-level failures. Aborts if duplicate protection fails.
 */
export async function runP253LiveSendLoop(input: {
  eligibility: P253EligibilityEval;
  preflight: P253ProductionPreflight;
  emailByCandidateId: Map<string, string>;
}): Promise<P253SendLoopResult> {
  const counts = { ...input.eligibility.counts };
  const rows = input.eligibility.rows.map((r) => ({ ...r }));
  const byId = new Map(rows.map((r) => [r.candidateId, r]));
  const auditTrail: P253AuditEntry[] = [];
  const createdRequestIds: Array<{ candidateId: string; signatureRequestId: string }> = [];

  const dup = assertDuplicateProtectionIntact({
    rows,
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
    const row = byId.get(candidateId);
    if (!row) continue;

    const liveDup = assertDuplicateProtectionIntact({
      rows,
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
      row.result = recheck.skipCode ?? "skipped_state_change";
      row.error = recheck.blockers.join(", ");
      counts.eligible = Math.max(0, counts.eligible - 1);
      counts.skipped += 1;
      if (recheck.skipCode === "duplicate_prevented") counts.duplicatePrevented += 1;
      if (recheck.skipCode === "already_sent" || recheck.skipCode === "skipped_new_packet") {
        counts.alreadySent += 1;
      }
      if (recheck.skipCode === "already_signed") counts.alreadySigned += 1;
      auditTrail.push({
        at: new Date().toISOString(),
        action: "skip_recheck",
        candidateId,
        detail: row.error ?? "state change",
      });
      continue;
    }

    const email = (input.emailByCandidateId.get(candidateId) ?? "").trim();
    if (!email.includes("@")) {
      row.result = "failed";
      row.error = "missing_email at send time";
      counts.failed += 1;
      counts.eligible = Math.max(0, counts.eligible - 1);
      continue;
    }

    auditTrail.push({
      at: new Date().toISOString(),
      action: "send_attempt",
      candidateId,
      detail: `Production Dropbox send for ${row.name}`,
    });

    try {
      const prepared = await prepareOnboardingSend({
        candidateId,
        templateKey: "onboarding_packet",
        actionType: "send-paperwork",
        orchestratorRunId: "P253",
      });

      const workflows2 = await getCandidateWorkflowState();
      const recheck2 = recheckP253CandidateLive({
        workflow: workflows2[candidateId],
        onboarding: prepared.signatureRequestId ? prepared : onboarding,
        priorSentIds: input.eligibility.priorSentIds,
        candidateId,
      });
      // prepared is queued — allow send-in-progress; only block if a real packet id exists
      if (
        workflows2[candidateId]?.signatureRequestId ||
        prepared.signatureRequestId ||
        workflows2[candidateId]?.workflowStatus !== "Paperwork Needed"
      ) {
        row.eligible = false;
        row.blockers = recheck2.blockers.length
          ? recheck2.blockers
          : ["active_packet_or_state_change"];
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
          byUserId: P253_BY_USER,
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
        counts.failed += 1;
        counts.eligible = Math.max(0, counts.eligible - 1);
        auditTrail.push({
          at: new Date().toISOString(),
          action: "send_failed",
          candidateId,
          detail: row.error,
        });
        // Never retry this candidate in the same run (duplicate risk).
        continue;
      }

      // Persist workflow Paperwork Sent only after successful packet creation.
      // executeOnboardingSend already calls recordCandidatePaperworkSent; reinforce action fields.
      await upsertCandidateWorkflow({
        candidateId,
        actionType: "await-signature",
        requiredAction: "Paperwork sent — awaiting signature.",
        actionReason: "P253 controlled live production paperwork send completed.",
        audit: {
          action: "p253_controlled_live_paperwork_send",
          byUserId: P253_BY_USER,
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
      counts.sentSuccessfully += 1;
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
      counts.failed += 1;
      counts.eligible = Math.max(0, counts.eligible - 1);
      auditTrail.push({
        at: new Date().toISOString(),
        action: "send_failed",
        candidateId,
        detail: row.error,
      });
      // No retry — continue remaining candidates.
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
