import type { OperatorTimelineEntry } from "@/lib/autonomous-paperwork-orchestrator/types";

export function createOperatorTimeline(): {
  entries: OperatorTimelineEntry[];
  add: (label: string, detail?: string, at?: string) => void;
} {
  const entries: OperatorTimelineEntry[] = [];
  return {
    entries,
    add(label: string, detail?: string, at?: string) {
      entries.push({
        at: at ?? new Date().toISOString(),
        label,
        detail,
      });
    },
  };
}

export function formatOperatorTimeline(entries: OperatorTimelineEntry[]): string[] {
  return entries.map((entry) => {
    const time = new Date(entry.at);
    const hh = String(time.getHours()).padStart(2, "0");
    const mm = String(time.getMinutes()).padStart(2, "0");
    return `${hh}:${mm} ${entry.label}${entry.detail ? ` — ${entry.detail}` : ""}`;
  });
}
