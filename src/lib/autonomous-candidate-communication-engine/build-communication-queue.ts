import type {
  CommunicationDecision,
  CommunicationQueueItem,
  CommunicationQueueStatus,
} from "@/lib/autonomous-candidate-communication-engine/types";
import {
  buildTemplateVariables,
  getCommunicationTemplate,
  renderPreviewTemplate,
} from "@/lib/autonomous-candidate-communication-engine/communication-templates";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

function resolveQueueStatus(decision: CommunicationDecision): CommunicationQueueStatus {
  if (decision.skipped) return "skipped";
  if (decision.approvalRequired) return "waiting_approval";
  if (decision.wouldSend) return "ready";
  if (decision.effectiveMode === "off") return "cancelled";
  return "queued";
}

export function buildCommunicationQueue(input: {
  decisions: CommunicationDecision[];
  candidatesById: Map<string, ScoredCandidateWorkflowRow>;
}): CommunicationQueueItem[] {
  return input.decisions.map((decision) => {
    const row = decision.candidateId ? input.candidatesById.get(decision.candidateId) : null;
    const template = getCommunicationTemplate(decision.communicationType);
    const rendered = row
      ? renderPreviewTemplate(template, buildTemplateVariables(row))
      : { subject: template.subject, body: template.body };

    const status = resolveQueueStatus(decision);

    return {
      queueId: `p73-${decision.decisionId}`,
      candidateId: decision.candidateId,
      candidateName: decision.candidateName,
      communicationType: decision.communicationType,
      recipientRole: decision.recipientRole,
      recipientLabel: decision.recipientLabel,
      templateId: decision.templateId,
      templateSubject: rendered.subject,
      scheduledAt: decision.scheduledAt,
      status,
      executionMode: decision.effectiveMode,
      effectiveMode: decision.effectiveMode,
      approvalRequired: decision.approvalRequired,
      explanation: decision.explanation,
      wouldExecute: decision.wouldSend && status !== "skipped" && status !== "cancelled",
    };
  });
}

export function simulatePreviewSentQueueItems(queue: CommunicationQueueItem[]): CommunicationQueueItem[] {
  return queue.map((item) => {
    if (item.status === "ready" && item.wouldExecute) {
      return { ...item, status: "sent_preview" as CommunicationQueueStatus };
    }
    return item;
  });
}
