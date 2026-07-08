import { mapSignatureRequestToPaperworkStatus } from "@/lib/candidate-paperwork";
import {
  applyCandidatePaperworkSigned,
  applyCandidatePaperworkStatus,
  applyCandidatePaperworkViewed,
  findCandidateIdBySignatureRequest,
  getCandidateWorkflowState,
} from "@/lib/candidate-workflow-store";
import type { OnboardingPacketStatus } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  findOnboardingBySignatureRequest,
  recordCandidateOnboarding,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { publishWorkflowRealtime } from "@/lib/workflow-realtime-push";
import { DropboxSignError, getSignatureRequest, type DropboxSignRequestSummary } from "@/lib/dropbox-sign";

function mapToOnboardingStatus(paperworkStatus: string, rawStatus?: string): OnboardingPacketStatus {
  if (paperworkStatus === "signed") return "completed";
  if (paperworkStatus === "declined") return "declined";
  if (paperworkStatus === "viewed") return "viewed";
  if (rawStatus?.toLowerCase().includes("expired")) return "expired";
  if (rawStatus?.toLowerCase().includes("partial")) return "partially_completed";
  return "sent";
}

export type ProcessSignatureStatusResult = {
  ok: boolean;
  paperworkStatus: string;
  onboardingStatus: OnboardingPacketStatus;
  candidateId: string | null;
  record: CandidateOnboardingRecord | null;
  error?: string;
};

export async function processSignatureStatus(input: {
  signatureRequestId: string;
  signature?: DropboxSignRequestSummary;
  byUserId?: string;
}): Promise<ProcessSignatureStatusResult> {
  try {
    const signature = input.signature ?? (await getSignatureRequest(input.signatureRequestId));
    const paperworkStatus = mapSignatureRequestToPaperworkStatus(signature);
    const onboardingStatus = mapToOnboardingStatus(paperworkStatus, signature.rawStatus);
    const workflows = await getCandidateWorkflowState();
    const candidateId = findCandidateIdBySignatureRequest(workflows, input.signatureRequestId);

    if (candidateId) {
      let workflow;
      if (paperworkStatus === "signed") {
        workflow = await applyCandidatePaperworkSigned({
          candidateId,
          signatureRequestId: input.signatureRequestId,
          byUserId: input.byUserId,
        });
      } else if (paperworkStatus === "viewed") {
        workflow = await applyCandidatePaperworkViewed({
          candidateId,
          signatureRequestId: input.signatureRequestId,
          byUserId: input.byUserId,
        });
      } else {
        workflow = await applyCandidatePaperworkStatus({
          candidateId,
          signatureRequestId: input.signatureRequestId,
          paperworkStatus,
          byUserId: input.byUserId,
        });
      }
      if (workflow) {
        publishWorkflowRealtime({ candidateId, workflow, source: "workflow_api" });
      }
    }

    const existing =
      (await findOnboardingBySignatureRequest(input.signatureRequestId)) ??
      (candidateId
        ? {
            onboardingId: `sync-${input.signatureRequestId}`,
            candidateId,
            signatureRequestId: input.signatureRequestId,
            status: "sent" as const,
            paperworkComplete: false,
            readyForMel: false,
            createdAt: new Date().toISOString(),
            retryCount: 0,
            escalated: false,
            statusHistory: [],
          }
        : null);

    if (!existing) {
      return {
        ok: true,
        paperworkStatus,
        onboardingStatus,
        candidateId,
        record: null,
      };
    }

    const record: CandidateOnboardingRecord = {
      ...existing,
      status: onboardingStatus,
      paperworkComplete: onboardingStatus === "completed",
      statusHistory: [
        ...existing.statusHistory,
        {
          at: new Date().toISOString(),
          status: onboardingStatus,
          detail: `Synced from Dropbox Sign (${signature.rawStatus})`,
        },
      ],
      completedAt: onboardingStatus === "completed" ? new Date().toISOString() : existing.completedAt,
    };
    await recordCandidateOnboarding(record);

    return {
      ok: true,
      paperworkStatus,
      onboardingStatus,
      candidateId,
      record,
    };
  } catch (error) {
    const message =
      error instanceof DropboxSignError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to process signature status.";
    return {
      ok: false,
      paperworkStatus: "failed",
      onboardingStatus: "failed",
      candidateId: null,
      record: null,
      error: message,
    };
  }
}
