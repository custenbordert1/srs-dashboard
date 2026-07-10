import { readFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type { P159WorkflowAuditEntry } from "@/lib/p159-operations-control-center/types";

function workflowAuditPath(): string {
  const override = process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR?.trim();
  const dir = override ? path.resolve(override) : recruitingDataDir();
  return path.join(dir, "candidate-workflow-audit.jsonl");
}

export async function loadCandidateWorkflowAudit(input?: {
  since?: string;
  actions?: string[];
  limit?: number;
}): Promise<P159WorkflowAuditEntry[]> {
  try {
    const raw = await readFile(workflowAuditPath(), "utf8");
    const sinceMs = input?.since ? Date.parse(input.since) : null;
    const actionSet = input?.actions ? new Set(input.actions) : null;
    const entries: P159WorkflowAuditEntry[] = [];

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as P159WorkflowAuditEntry;
        if (!parsed.at) continue;
        if (sinceMs !== null && Date.parse(parsed.at) < sinceMs) continue;
        if (actionSet && !actionSet.has(parsed.action)) continue;
        entries.push(parsed);
      } catch {
        // skip malformed lines
      }
    }

    if (input?.limit && entries.length > input.limit) {
      return entries.slice(-input.limit);
    }
    return entries;
  } catch {
    return [];
  }
}
