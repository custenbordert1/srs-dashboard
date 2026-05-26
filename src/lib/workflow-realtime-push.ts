import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

export type WorkflowRealtimePayload = {
  candidateId: string;
  workflow: CandidateWorkflowRecord;
  source: "dropbox_sign_webhook" | "workflow_api" | "direct_deposit_api";
  eventType?: string;
};

type WorkflowRealtimeListener = (payload: WorkflowRealtimePayload) => void;

const listeners = new Set<WorkflowRealtimeListener>();

export function subscribeWorkflowRealtime(listener: WorkflowRealtimeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishWorkflowRealtime(payload: WorkflowRealtimePayload): void {
  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (err) {
      console.warn("[workflow-realtime] listener failed", err instanceof Error ? err.message : err);
    }
  }
}
