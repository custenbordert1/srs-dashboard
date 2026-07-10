import type { P1851NormalizedStage } from "@/lib/p185-1-paperwork-eligibility-recovery/types";

/** Explicit production stage → normalized stage. Never auto-advances Applied → paperwork_needed. */
export const P1851_STAGE_MAPPING_TABLE: Array<{
  patterns: RegExp[];
  normalized: P1851NormalizedStage;
}> = [
  { patterns: [/^applied$/i], normalized: "applied" },
  { patterns: [/^needs?\s*review$/i, /^review$/i, /^feedback$/i], normalized: "review" },
  { patterns: [/^contacted$/i, /^reached\s*out$/i], normalized: "contacted" },
  { patterns: [/^interview/i], normalized: "interview" },
  {
    patterns: [/^selected$/i, /^offer$/i, /^offer\s*extended$/i],
    normalized: "selected",
  },
  {
    patterns: [/^approved$/i, /^hire\s*approved$/i, /^hiring\s*approved$/i],
    normalized: "approved",
  },
  { patterns: [/^hiring$/i], normalized: "hiring" },
  {
    patterns: [/^paperwork\s*needed$/i, /^ready\s*for\s*paperwork$/i],
    normalized: "paperwork_needed",
  },
  {
    patterns: [/^paperwork\s*sent$/i, /^packet\s*sent$/i],
    normalized: "paperwork_sent",
  },
  {
    patterns: [/^awaiting\s*signature$/i],
    normalized: "awaiting_signature",
  },
  { patterns: [/^signed$/i], normalized: "signed" },
  { patterns: [/^completed$/i], normalized: "completed" },
  { patterns: [/^ready\s*for\s*mel$/i, /^loaded\s*in\s*mel$/i], normalized: "ready_for_mel" },
  { patterns: [/^hired$/i, /^active\s*rep$/i], normalized: "hired" },
  { patterns: [/^not\s*qualified$/i, /^disqualified$/i], normalized: "not_qualified" },
  { patterns: [/^archived$/i], normalized: "archived" },
  { patterns: [/^withdrawn$/i, /^rejected$/i], normalized: "withdrawn" },
];

export function normalizeP1851Stage(raw: string | null | undefined): P1851NormalizedStage {
  const value = (raw ?? "").trim();
  if (!value) return "unknown";
  for (const entry of P1851_STAGE_MAPPING_TABLE) {
    if (entry.patterns.some((re) => re.test(value))) return entry.normalized;
  }
  return "unknown";
}

export function inventoryDistinctStages(values: string[]): Array<{ stage: string; count: number }> {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = v || "(empty)";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));
}
