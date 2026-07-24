import {
  emptyMetadata,
  type P193LifecycleRecord,
  type P193LifecycleState,
} from "@/lib/p193-simplified-autonomous-lifecycle/types";

/** Pure factory — safe for client and server (no filesystem). */
export function createP193Record(input: {
  candidateId: string;
  state?: P193LifecycleState;
  legacyWorkflowStatus?: string | null;
  nowIso?: string;
}): P193LifecycleRecord {
  const now = input.nowIso ?? new Date().toISOString();
  const state = input.state ?? "Applied";
  return {
    candidateId: input.candidateId,
    state,
    previousState: null,
    enteredAt: now,
    updatedAt: now,
    metadata: emptyMetadata(),
    timeline: [{ at: now, state, detail: "Record created in P193 simplified lifecycle" }],
    legacyWorkflowStatus: input.legacyWorkflowStatus ?? null,
    legacyP186State: null,
    version: 1,
  };
}
