import {
  applyCandidatePaperworkSigned,
  applyCandidatePaperworkViewed,
  findCandidateIdBySignatureRequest,
  getCandidateWorkflowState,
} from "@/lib/candidate-workflow-store";
import type { DropboxSignWebhookPayload } from "@/lib/dropbox-sign-webhook";
import { isHandledDropboxSignEventType } from "@/lib/dropbox-sign-webhook";
import {
  appendHrPaperworkNotice,
  notifyDmPaperworkSignedHook,
} from "@/lib/hr-paperwork-notices";
import { publishWorkflowRealtime } from "@/lib/workflow-realtime-push";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

export type DropboxSignWebhookHandleResult = {
  handled: boolean;
  eventType: string;
  signatureRequestId: string | null;
  candidateId: string | null;
  workflow?: CandidateWorkflowRecord;
  skipped?: string;
};

export async function handleDropboxSignWebhookEvent(
  payload: DropboxSignWebhookPayload,
): Promise<DropboxSignWebhookHandleResult> {
  const eventType = payload.event.event_type;
  const signatureRequestId = payload.signature_request?.signature_request_id?.trim() ?? null;

  if (!isHandledDropboxSignEventType(eventType)) {
    return {
      handled: false,
      eventType,
      signatureRequestId,
      candidateId: null,
      skipped: "unsupported_event",
    };
  }

  if (!signatureRequestId) {
    return {
      handled: false,
      eventType,
      signatureRequestId: null,
      candidateId: null,
      skipped: "missing_signature_request_id",
    };
  }

  const workflows = await getCandidateWorkflowState();
  const candidateId = findCandidateIdBySignatureRequest(workflows, signatureRequestId);
  if (!candidateId) {
    return {
      handled: false,
      eventType,
      signatureRequestId,
      candidateId: null,
      skipped: "unknown_signature_request",
    };
  }

  if (eventType === "signature_request_viewed") {
    const workflow = await applyCandidatePaperworkViewed({
      candidateId,
      signatureRequestId,
    });
    await appendHrPaperworkNotice({
      type: "paperwork_viewed",
      workflow,
      signatureRequestId,
    });
    publishWorkflowRealtime({
      candidateId,
      workflow,
      source: "dropbox_sign_webhook",
      eventType,
    });
    return { handled: true, eventType, signatureRequestId, candidateId, workflow };
  }

  if (
    eventType === "signature_request_signed" ||
    eventType === "signature_request_all_signed"
  ) {
    const workflow = await applyCandidatePaperworkSigned({
      candidateId,
      signatureRequestId,
    });
    await appendHrPaperworkNotice({
      type: "paperwork_signed",
      workflow,
      signatureRequestId,
    });
    notifyDmPaperworkSignedHook(workflow);
    publishWorkflowRealtime({
      candidateId,
      workflow,
      source: "dropbox_sign_webhook",
      eventType,
    });
    return { handled: true, eventType, signatureRequestId, candidateId, workflow };
  }

  return {
    handled: false,
    eventType,
    signatureRequestId,
    candidateId,
    skipped: "unhandled_event",
  };
}
