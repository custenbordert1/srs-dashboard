import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkExecutionAuditEvent, PaperworkExecutionTimelineStep } from "@/lib/autonomous-paperwork-execution-engine/types";
import { simulateExecutionWorkflow } from "@/lib/autonomous-paperwork-execution-engine/simulate-execution-workflow";
import type { PaperworkExecutionMode } from "@/lib/autonomous-paperwork-execution-engine/types";

export function buildCandidateExecutionTimeline(input: {
  candidateId: string;
  candidateName: string;
  templateLabel: string;
  executionMode: PaperworkExecutionMode;
  wouldExecute: boolean;
  blockingReasons: string[];
  onboarding: CandidateOnboardingRecord | null;
  auditEvents: PaperworkExecutionAuditEvent[];
  referenceMs?: number;
}): PaperworkExecutionTimelineStep[] {
  const referenceMs = input.referenceMs ?? Date.now();
  const simulated = simulateExecutionWorkflow({
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    templateLabel: input.templateLabel,
    executionMode: input.executionMode,
    referenceMs,
    wouldExecute: input.wouldExecute,
    blockingReasons: input.blockingReasons,
  });

  const historySteps: PaperworkExecutionTimelineStep[] = (input.onboarding?.statusHistory ?? []).map(
    (entry, index) => ({
      id: `history-${index}`,
      label: entry.status.replaceAll("_", " "),
      at: entry.at,
      detail: entry.detail ?? null,
      status: "completed" as const,
    }),
  );

  const auditSteps: PaperworkExecutionTimelineStep[] = input.auditEvents
    .filter((event) => event.candidateId === input.candidateId)
    .map((event) => ({
      id: event.auditId,
      label: event.trigger.replaceAll("_", " "),
      at: event.timestamp,
      detail: event.detail,
      status: event.result === "failure" || event.result === "blocked" ? "failed" : "simulated",
    }));

  return [...historySteps, ...simulated.timeline, ...auditSteps].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
}
