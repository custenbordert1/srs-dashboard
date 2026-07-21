import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  loadP221SentCandidateIds,
  loadP227SentCandidateIds,
  loadP235SentCandidateIds,
  loadP237SentCandidateIds,
  loadP238SentCandidateIds,
  loadPriorSentExclusionSets,
} from "@/lib/p239-final-remaining-auto-eligible-send/cohort";
import {
  P240_CUTOFF_SOURCE,
  P240_DEFAULT_CUTOFF_ISO,
  P240_PHASE,
  type P240CutoffResolution,
} from "@/lib/p240-autonomous-new-applicant-pipeline/types";

export function p240Sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function p240RedactId(candidateId: string): string {
  return createHash("sha256").update(candidateId).digest("hex").slice(0, 12);
}

export function p240NormalizeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

export function p240DisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  candidateId: string;
}): string {
  const name = `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim();
  return name || input.email?.trim() || input.candidateId;
}

export function p240ParseMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function p240HasUsableEmail(email: string | null | undefined): boolean {
  const value = String(email ?? "").trim();
  return value.includes("@") && value.length >= 5;
}

export function p240HasUsablePhone(phone: string | null | undefined): boolean {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10;
}

const TERMINAL = new Set([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Ready for MEL",
  "Archived",
  "Rejected",
  "Withdrawn",
  "Signed",
]);

export function p240IsTerminalOrArchived(status: string, notes: string[] = []): boolean {
  if (TERMINAL.has(status)) return true;
  const blob = notes.join("\n").toLowerCase();
  return /\barchived\b|\brejected\b|\bwithdrawn\b/.test(blob);
}

export function p240IsCalvinBrown(name: string): boolean {
  return name.trim().toLowerCase() === "calvin brown";
}

function readJson(filePath: string): unknown | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

/**
 * Resolve the frozen "new applicants only" cutoff.
 * Primary: P239 send artifact generatedAt (backlog-clear completion).
 * Documented fallback: P240_DEFAULT_CUTOFF_ISO.
 */
export function resolveP240Cutoff(cwd = process.cwd()): P240CutoffResolution {
  const sentPath = path.join(cwd, "artifacts/p239-sent.json");
  const sent = readJson(sentPath) as {
    generatedAt?: string;
    rows?: Array<{ appliedDate?: string; ok?: boolean }>;
  } | null;

  const p239GeneratedAt =
    typeof sent?.generatedAt === "string" && sent.generatedAt.trim()
      ? sent.generatedAt.trim()
      : null;

  let maxP239AppliedDate: string | null = null;
  let maxAppliedMs = 0;
  for (const row of sent?.rows ?? []) {
    if (row.ok === false) continue;
    const ms = p240ParseMs(row.appliedDate);
    if (ms != null && ms >= maxAppliedMs) {
      maxAppliedMs = ms;
      maxP239AppliedDate = row.appliedDate ?? null;
    }
  }

  const cutoffIso = p239GeneratedAt ?? P240_DEFAULT_CUTOFF_ISO;
  const cutoffMs = p240ParseMs(cutoffIso) ?? Date.parse(P240_DEFAULT_CUTOFF_ISO);

  return {
    cutoffIso,
    cutoffMs,
    source: p239GeneratedAt
      ? `${P240_CUTOFF_SOURCE}; file=artifacts/p239-sent.json`
      : `fallback ${P240_DEFAULT_CUTOFF_ISO} (${P240_PHASE} default)`,
    p239GeneratedAt,
    maxP239AppliedDate,
  };
}

export function loadP239SentCandidateIds(cwd = process.cwd()): {
  ids: string[];
  source: string;
} {
  const sent = readJson(path.join(cwd, "artifacts/p239-sent.json")) as {
    rows?: Array<{ candidateId?: string; ok?: boolean }>;
  } | null;
  const ids = [...new Set(
    (sent?.rows ?? [])
      .filter((r) => r.ok !== false)
      .map((r) => String(r.candidateId ?? "").trim())
      .filter(Boolean),
  )];
  return {
    ids,
    source: ids.length ? "artifacts/p239-sent.json" : "none",
  };
}

/**
 * Union of all prior controlled-send cohorts that must never be resent.
 */
export function loadP240PriorSentExclusion(cwd = process.cwd()): {
  all: Set<string>;
  sources: Record<string, string>;
  counts: Record<string, number>;
} {
  const prior = loadPriorSentExclusionSets(cwd);
  const p239 = loadP239SentCandidateIds(cwd);
  const all = new Set<string>([
    ...prior.p221,
    ...prior.p227,
    ...prior.p235,
    ...prior.p237,
    ...prior.p238,
    ...p239.ids,
  ]);

  return {
    all,
    sources: {
      ...prior.sources,
      p239: p239.source,
    },
    counts: {
      p221: prior.p221.size,
      p227: prior.p227.size,
      p235: prior.p235.size,
      p237: prior.p237.size,
      p238: prior.p238.size,
      p239: p239.ids.length,
      union: all.size,
    },
  };
}

export {
  loadP221SentCandidateIds,
  loadP227SentCandidateIds,
  loadP235SentCandidateIds,
  loadP237SentCandidateIds,
  loadP238SentCandidateIds,
};
