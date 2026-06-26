import type {
  CommunicationAuditEvent,
  CommunicationQueueItem,
} from "@/lib/autonomous-candidate-communication-engine/types";

export function buildCommunicationAuditTrail(input: {
  queue: CommunicationQueueItem[];
  fetchedAt: string;
}): CommunicationAuditEvent[] {
  return input.queue.map((item, index) => ({
    auditId: `p73-audit-${item.queueId}`,
    timestamp: item.scheduledAt || input.fetchedAt,
    trigger: item.explanation,
    candidateId: item.candidateId,
    candidateName: item.candidateName,
    communicationType: item.communicationType,
    recipientRole: item.recipientRole,
    recipientLabel: item.recipientLabel,
    templateId: item.templateId,
    executionMode: item.effectiveMode,
    automation: !item.approvalRequired,
    previewStatus: item.status,
    failureReason: item.status === "failed" ? "Preview simulation failure" : null,
    detail: item.templateSubject,
    simulated: true,
  }));
}
