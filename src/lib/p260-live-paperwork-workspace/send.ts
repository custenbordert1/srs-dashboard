import { prepareOnboardingSend } from "@/lib/autonomous-paperwork-send-engine/prepare-onboarding-send";
import { executeOnboardingSend } from "@/lib/candidate-onboarding-send-queue/execute-onboarding-send";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { getSignatureRequest } from "@/lib/dropbox-sign";
import { sendTemplateSignatureRequestProductionOnly } from "@/lib/p192-supervised-paperwork-runner/productionMode";
import {
  P260_BY_USER,
  P260_SOURCE,
} from "@/lib/p260-live-paperwork-workspace/types";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";

export async function defaultPrepareP260Send(
  candidateId: string,
  templateKey: string,
): Promise<{ onboardingId: string }> {
  const prepared = await prepareOnboardingSend({
    candidateId,
    templateKey: templateKey as OnboardingTemplateKey,
    actionType: "send-paperwork",
    orchestratorRunId: "P260",
  });
  return { onboardingId: prepared.onboardingId };
}

export async function defaultExecuteP260Send(input: {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  templateKey: string;
  byUserId: string;
  inFlightOnboardingId?: string;
}): Promise<{
  ok: boolean;
  signatureRequestId?: string;
  paperworkStatus?: string;
  workflowStatus?: string;
  error?: string;
  transient?: boolean;
}> {
  const result = await executeOnboardingSend(
    {
      candidateId: input.candidateId,
      candidateName: input.candidateName,
      candidateEmail: input.candidateEmail,
      templateKey: input.templateKey as OnboardingTemplateKey,
      byUserId: input.byUserId,
      inFlightOnboardingId: input.inFlightOnboardingId,
      recordWorkflowFailureOnError: false,
    },
    {
      sendTemplateSignatureRequest: sendTemplateSignatureRequestProductionOnly,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      transient: result.transient,
      paperworkStatus: result.workflow?.paperworkStatus,
      workflowStatus: result.workflow?.workflowStatus,
    };
  }

  return {
    ok: true,
    signatureRequestId: result.signatureRequestId,
    paperworkStatus: result.paperworkStatus,
    workflowStatus: result.workflow.workflowStatus,
  };
}

/**
 * Paperwork Sent only after Dropbox success — reinforce action fields for JCC source.
 */
export async function defaultUpsertP260PaperworkSent(input: {
  candidateId: string;
  signatureRequestId: string;
  byUserId: string;
}): Promise<void> {
  await upsertCandidateWorkflow({
    candidateId: input.candidateId,
    actionType: "await-signature",
    requiredAction: "Paperwork sent — awaiting signature.",
    actionReason: `${P260_SOURCE} live paperwork send completed.`,
    audit: {
      action: "p260_live_paperwork_workspace_send",
      byUserId: input.byUserId || P260_BY_USER,
      metadata: {
        signatureRequestId: input.signatureRequestId,
        source: P260_SOURCE,
        sentAt: new Date().toISOString(),
      },
    },
  });
}

export async function defaultVerifyP260Dropbox(signatureRequestId: string): Promise<boolean> {
  try {
    const remote = await getSignatureRequest(signatureRequestId);
    return Boolean(remote?.signatureRequestId);
  } catch {
    return false;
  }
}

/**
 * Clear expired packet markers so the authoritative send engine can create one new packet.
 * Only called after typed confirmation for prior_expired_packet.
 */
export async function defaultClearExpiredPacket(candidateId: string): Promise<void> {
  await upsertCandidateWorkflow({
    candidateId,
    signatureRequestId: null,
    paperworkStatus: "not_sent",
    paperworkSentAt: null,
    paperworkViewedAt: null,
    paperworkError: null,
    workflowStatus: "Paperwork Needed",
    audit: {
      action: "p260_clear_expired_packet",
      byUserId: P260_BY_USER,
      metadata: {
        source: P260_SOURCE,
        reason: "prior_expired_packet typed confirmation",
      },
    },
  });
}
