import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { productionRunnerAuditPath } from "@/lib/p125-autonomous-paperwork-production-runner/runner-store";
import type { ActivityTimelineEntry } from "@/lib/p126-autonomous-operations-command-center/types";

export async function loadRunnerAuditTimeline(): Promise<ActivityTimelineEntry[]> {
  try {
    const raw = await readFile(productionRunnerAuditPath(), "utf8");
    const lines = raw.split("\n").filter((line) => line.trim());
    const events: ActivityTimelineEntry[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const at = String(entry.at ?? "");
        if (!at) continue;

        const action = String(entry.action ?? "cycle");
        const candidateId = entry.candidateId ? String(entry.candidateId) : null;
        const success = entry.success === true;
        const outcome = entry.outcome ? String(entry.outcome) : success ? "success" : "failed";

        events.push({
          auditId: String(entry.runId ?? randomUUID()),
          at,
          candidateId,
          candidateName: candidateId,
          action,
          result: outcome,
          durationMs: typeof entry.durationMs === "number" ? entry.durationMs : null,
          reason: entry.error ? String(entry.error) : entry.safetyGoNoGo ? String(entry.safetyGoNoGo) : null,
          source: "p125-runner",
        });
      } catch {
        // skip malformed line
      }
    }

    return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  } catch {
    return [];
  }
}

export function timelineFromOrchestratorCycle(input: {
  cycleId: string;
  operatorTimeline: Array<{ at: string; label: string; detail?: string }>;
  candidateId?: string | null;
  candidateName?: string | null;
}): ActivityTimelineEntry[] {
  return input.operatorTimeline.map((entry) => ({
    auditId: `${input.cycleId}:${entry.at}:${entry.label}`,
    at: entry.at,
    candidateId: input.candidateId ?? null,
    candidateName: input.candidateName ?? null,
    action: entry.label,
    result: entry.detail ?? "logged",
    durationMs: null,
    reason: entry.detail ?? null,
    source: "p123-orchestrator",
  }));
}
