import {
  getP171CandidateRecord,
  loadP171LifecycleState,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-store";
import {
  P171_SOURCE_PHASE,
  type P171CandidateTimeline,
  type P171TimelineEntry,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/types";

const TIMELINE_STAGES: Array<{ id: string; label: string; field: keyof import("@/lib/p171-autonomous-candidate-lifecycle-manager/types").P171CandidateLifecycleRecord | null }> = [
  { id: "applied", label: "Applied", field: "discoveredAt" },
  { id: "discovered", label: "Discovered", field: "discoveredAt" },
  { id: "evaluated", label: "Evaluated", field: "evaluatedAt" },
  { id: "confidence", label: "Confidence scored", field: "evaluatedAt" },
  { id: "paperwork_sent", label: "Paperwork sent", field: "paperworkSentAt" },
  { id: "viewed", label: "Viewed", field: null },
  { id: "signed", label: "Signed", field: "signedAt" },
  { id: "ready_for_mel", label: "Ready for MEL", field: "readyForMelAt" },
  { id: "assigned", label: "Assigned", field: null },
  { id: "completed", label: "Completed", field: null },
];

export async function buildP171CandidateTimeline(
  candidateId: string,
): Promise<P171CandidateTimeline | null> {
  const state = await loadP171LifecycleState();
  const record = getP171CandidateRecord(state, candidateId);
  if (!record) return null;

  const transitionAt = new Map(
    record.transitions.map((t) => [t.to, t.at]),
  );

  const entries: P171TimelineEntry[] = TIMELINE_STAGES.map((stage) => {
    let at: string | null = null;
    if (stage.field) {
      at = (record[stage.field] as string | null) ?? null;
    }
    if (!at && stage.id === "viewed") {
      at =
        record.signatureStatus === "VIEWED" || record.signatureStatus === "SIGNED"
          ? transitionAt.get("WAITING_SIGNATURE") ?? record.paperworkSentAt
          : null;
    }
    if (!at && stage.id === "assigned") {
      at = record.state === "PLACED" ? transitionAt.get("PLACED") ?? null : null;
    }
    if (!at && stage.id === "completed") {
      at = record.state === "COMPLETED" ? transitionAt.get("COMPLETED") ?? null : null;
    }

    const detail =
      stage.id === "confidence" && record.confidence != null
        ? `Confidence ${record.confidence}`
        : stage.id === "evaluated" && record.p157Action
          ? record.p157Action
          : undefined;

    return {
      id: stage.id,
      label: stage.label,
      at,
      completed: at != null,
      detail,
    };
  });

  return {
    candidateId: record.candidateId,
    candidateName: record.candidateName,
    currentState: record.state,
    entries,
    generatedAt: new Date().toISOString(),
  };
}

export function formatP171TimelineMarkdown(timeline: P171CandidateTimeline): string {
  const lines = [
    `# P171 Candidate Timeline — ${timeline.candidateName}`,
    "",
    `Candidate ID: ${timeline.candidateId}`,
    `Current state: ${timeline.currentState}`,
    "",
    "## Timeline",
    ...timeline.entries.map(
      (e) =>
        `- [${e.completed ? "x" : " "}] ${e.label}${e.at ? ` — ${e.at}` : ""}${e.detail ? ` (${e.detail})` : ""}`,
    ),
    "",
  ];
  return lines.join("\n");
}

export { P171_SOURCE_PHASE };
