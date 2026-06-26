import type { PaperworkExecutionAuditEvent, PaperworkExecutionTimelineStep } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { PaperworkExecutionMode } from "@/lib/autonomous-paperwork-execution-engine/types";
import { buildAuditEventId } from "@/lib/autonomous-paperwork-execution-engine/audit-log-store";

export type SimulatedExecutionWorkflowInput = {
  candidateId: string;
  candidateName: string;
  templateLabel: string;
  executionMode: PaperworkExecutionMode;
  referenceMs: number;
  wouldExecute: boolean;
  blockingReasons: string[];
};

export type SimulatedExecutionWorkflowResult = {
  timeline: PaperworkExecutionTimelineStep[];
  auditEvents: PaperworkExecutionAuditEvent[];
};

export function simulateExecutionWorkflow(
  input: SimulatedExecutionWorkflowInput,
): SimulatedExecutionWorkflowResult {
  const baseMs = input.referenceMs;
  const steps: PaperworkExecutionTimelineStep[] = [];
  const auditEvents: PaperworkExecutionAuditEvent[] = [];

  const pushStep = (
    offsetMs: number,
    label: string,
    detail: string | null,
    status: PaperworkExecutionTimelineStep["status"],
  ) => {
    steps.push({
      id: `step-${steps.length + 1}`,
      label,
      at: new Date(baseMs + offsetMs).toISOString(),
      detail,
      status,
    });
  };

  const pushAudit = (
    offsetMs: number,
    trigger: string,
    result: PaperworkExecutionAuditEvent["result"],
    detail: string | null,
    failureReason: string | null = null,
  ) => {
    auditEvents.push({
      auditId: buildAuditEventId(baseMs + offsetMs, input.candidateId),
      timestamp: new Date(baseMs + offsetMs).toISOString(),
      trigger,
      executionMode: input.executionMode,
      actor: "preview_simulator",
      candidateId: input.candidateId,
      queueId: `queue-${input.candidateId}`,
      packetId: result === "simulated" ? `pkt-preview-${input.candidateId}` : null,
      durationMs: 120,
      result,
      failureReason,
      retryCount: 0,
      detail,
      simulated: true,
    });
  };

  pushStep(0, "Candidate approved", null, "simulated");
  pushAudit(0, "candidate_approved", "simulated", "Recruiter approval recorded");

  pushStep(60_000, "Eligibility validated", null, input.wouldExecute ? "simulated" : "failed");
  pushAudit(
    60_000,
    "eligibility_validated",
    input.wouldExecute ? "simulated" : "blocked",
    input.wouldExecute ? "All validations passed" : input.blockingReasons.join("; "),
    input.wouldExecute ? null : input.blockingReasons[0] ?? "Validation failed",
  );

  if (!input.wouldExecute) {
    pushStep(61_000, "Moved to manual review", input.blockingReasons.join("; "), "failed");
    return { timeline: steps, auditEvents };
  }

  pushStep(61_000, "Packet generated", input.templateLabel, "simulated");
  pushAudit(61_000, "packet_generated", "simulated", `Template: ${input.templateLabel}`);

  pushStep(62_000, "Added to execution queue", null, "simulated");
  pushAudit(62_000, "queue_enqueued", "simulated", "Packet added to production send queue (simulated)");

  if (input.executionMode === "preview" || input.executionMode === "off") {
    pushStep(63_000, "Execution simulated", "No Dropbox Sign call in preview mode", "simulated");
    pushAudit(63_000, "send_simulated", "simulated", "Preview mode — no live Dropbox Sign or email");
    pushStep(64_000, "Waiting for signature", "Simulated monitoring", "pending");
    return { timeline: steps, auditEvents };
  }

  pushStep(63_000, "Dropbox Sign packet created", "Would call Dropbox Sign API", "simulated");
  pushAudit(63_000, "dropbox_packet_created", "simulated", "Production path gated by feature flags");

  pushStep(64_000, "Email sent", "Would send candidate email", "simulated");
  pushAudit(64_000, "email_sent", "simulated", "Email dispatch simulated");

  pushStep(65_000, "Waiting for signature", null, "pending");
  pushAudit(65_000, "signature_monitoring", "simulated", "Signature monitoring started");

  return { timeline: steps, auditEvents };
}
