import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";

export function workflowNoticePacketSent(): string {
  return "Packet sent";
}

export function workflowNoticeAssigned(recruiter: string): string {
  const name = recruiter.trim();
  return name.length > 0 ? `Assigned to ${name}` : "Assigned to recruiter";
}

export function workflowNoticeStatus(status: CandidateWorkflowStatus): string {
  return `Workflow updated — ${status}`;
}

export function workflowNoticePaperworkSigned(): string {
  return "Paperwork signed";
}
