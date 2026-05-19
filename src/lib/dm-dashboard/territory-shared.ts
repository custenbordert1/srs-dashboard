import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseDate(raw: string): Date | null {
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysSince(raw: string, reference: Date): number | null {
  const date = parseDate(raw);
  if (!date) return null;
  return Math.max(0, Math.round((reference.getTime() - date.getTime()) / MS_PER_DAY));
}

export function isInterviewingStage(stage: string): boolean {
  const normalized = stage.toLowerCase();
  return (
    normalized.includes("interview") ||
    normalized.includes("screen") ||
    normalized.includes("qualified") ||
    normalized.includes("assessment")
  );
}

export function isHiredStage(stage: string): boolean {
  const normalized = stage.toLowerCase();
  return (
    normalized.includes("hired") ||
    normalized.includes("offer") ||
    normalized.includes("placed") ||
    normalized.includes("accepted")
  );
}

export function isAppliedStage(stage: string): boolean {
  if (isInterviewingStage(stage) || isHiredStage(stage)) return false;
  const normalized = stage.toLowerCase();
  return (
    normalized.includes("applied") ||
    normalized.includes("new") ||
    normalized.includes("sourced") ||
    normalized.includes("pool") ||
    normalized.length === 0
  );
}

export function candidatesForJob(job: BreezyJob, candidates: BreezyCandidate[]): BreezyCandidate[] {
  return candidates.filter(
    (candidate) =>
      candidate.positionId === job.jobId ||
      (candidate.positionName && job.name && candidate.positionName === job.name),
  );
}

export function candidateDisplayName(candidate: BreezyCandidate): string {
  const name = `${candidate.firstName} ${candidate.lastName}`.trim();
  return name || candidate.email || "Unknown";
}

export function cityKey(city: string, state: string): string {
  const c = city.trim() || "Unknown";
  const s = state.trim() || "—";
  return `${c}, ${s}`;
}

export function clampScore(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

export function countBuckets(
  rows: Array<{ label: string }>,
  labelFn: (row: { label: string }) => string,
  limit = 8,
): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = labelFn(row) || "Unknown";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}
