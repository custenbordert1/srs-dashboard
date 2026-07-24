import {
  isP223OperationallyActiveWorkflowStage,
  isP223TerminalWorkflowStage,
} from "@/lib/p223-recruiter-inbox-restoration";
import type { P228PipelineInventory } from "@/lib/p228-production-readiness/types";

const ACTIVE_NON_TERMINAL = (status: string): boolean =>
  !isP223TerminalWorkflowStage(status) && Boolean(status);

export function buildPipelineInventory(
  allWorkflowStatuses: Record<string, string>,
  totalUniverse: number,
): P228PipelineInventory {
  const byStage: Record<string, number> = {};
  let active = 0;
  let workflowActive = 0;
  let paperworkNeeded = 0;
  let paperworkSent = 0;
  let signed = 0;
  let readyForMel = 0;
  let loadedInMel = 0;
  let terminal = 0;

  for (const status of Object.values(allWorkflowStatuses)) {
    const s = String(status || "Unknown");
    byStage[s] = (byStage[s] ?? 0) + 1;
    if (ACTIVE_NON_TERMINAL(s)) active += 1;
    if (isP223OperationallyActiveWorkflowStage(s)) workflowActive += 1;
    if (isP223TerminalWorkflowStage(s)) terminal += 1;
    if (s === "Paperwork Needed") paperworkNeeded += 1;
    if (s === "Paperwork Sent") paperworkSent += 1;
    if (s === "Signed") signed += 1;
    if (s === "Ready for MEL") readyForMel += 1;
    if (s === "Loaded in MEL") loadedInMel += 1;
  }

  return {
    totalCandidates: totalUniverse,
    active,
    workflowActive,
    paperworkNeeded,
    paperworkSent,
    signed,
    readyForMel,
    loadedInMel,
    terminal,
    byStage,
  };
}
