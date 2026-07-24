import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { P221_TARGETS } from "@/lib/p221-controlled-dropbox-sign-send/types";
import {
  P239_EXCLUDED_NAME,
  P239_PHASE,
} from "@/lib/p239-final-remaining-auto-eligible-send/types";

export function p239RedactId(candidateId: string): string {
  return createHash("sha256").update(candidateId).digest("hex").slice(0, 12);
}

export function p239NormalizeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

export function p239DisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  candidateId: string;
}): string {
  const name = `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim();
  return name || input.email?.trim() || input.candidateId;
}

export function p239IsCalvinBrown(name: string): boolean {
  return name.trim().toLowerCase() === P239_EXCLUDED_NAME.toLowerCase();
}

export function p239HasUsablePhone(phone: string | null | undefined): boolean {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10;
}

export function p239HasUsableEmail(email: string | null | undefined): boolean {
  const value = String(email ?? "").trim();
  return value.includes("@") && value.length >= 5;
}

const TERMINAL = new Set([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Ready for MEL",
  "Archived",
  "Rejected",
  "Withdrawn",
]);

export function p239IsTerminalOrArchived(status: string, notes: string[] = []): boolean {
  if (TERMINAL.has(status)) return true;
  const blob = notes.join("\n").toLowerCase();
  return /\barchived\b|\brejected\b|\bwithdrawn\b/.test(blob);
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function loadIdsFromJsonPaths(
  cwd: string,
  candidates: Array<{ path: string; extract: (raw: unknown) => string[] }>,
): { ids: string[]; source: string } | null {
  for (const entry of candidates) {
    const full = path.join(cwd, entry.path);
    if (!existsSync(full)) continue;
    try {
      const raw = JSON.parse(readFileSync(full, "utf8")) as unknown;
      const ids = uniqueIds(entry.extract(raw));
      if (ids.length > 0) return { ids, source: entry.path };
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * P238 deferred auto-eligible candidates (batch_full) — P239 seed pool.
 */
export function loadP238BatchFullCandidateIds(cwd = process.cwd()): {
  ids: string[];
  source: string;
} {
  const loaded = loadIdsFromJsonPaths(cwd, [
    {
      path: "artifacts/p238-skipped.json",
      extract: (raw) => {
        const obj = raw as {
          rows?: Array<{ candidateId?: string; reason?: string }>;
        };
        return (obj.rows ?? [])
          .filter((r) => r.reason === "batch_full")
          .map((r) => String(r.candidateId ?? ""));
      },
    },
  ]);
  if (!loaded) {
    throw new Error(
      `[${P239_PHASE}] Missing P238 batch_full IDs (expected artifacts/p238-skipped.json)`,
    );
  }
  return loaded;
}

export function loadP221SentCandidateIds(cwd = process.cwd()): {
  ids: string[];
  source: string;
} {
  const loaded = loadIdsFromJsonPaths(cwd, [
    {
      path: ".data/p221-controlled-dropbox-sign-send-operator-local.json",
      extract: (raw) => {
        const obj = raw as { candidateIds?: string[] };
        return obj.candidateIds ?? [];
      },
    },
    {
      path: "artifacts/p221-signature-requests.json",
      extract: (raw) => {
        const obj = raw as {
          requests?: Array<{ candidateId?: string; redactedCandidateId?: string }>;
        };
        const withIds = (obj.requests ?? [])
          .map((r) => String(r.candidateId ?? ""))
          .filter(Boolean);
        if (withIds.length) return withIds;
        // Fall back to frozen P221 targets matched by redacted id
        const redacted = new Set(
          (obj.requests ?? []).map((r) => String(r.redactedCandidateId ?? "")),
        );
        return P221_TARGETS.filter((t) => redacted.has(t.redactedCandidateId)).map(
          (t) => t.candidateId,
        );
      },
    },
  ]);
  if (loaded) return loaded;
  return {
    ids: P221_TARGETS.map((t) => t.candidateId),
    source: "P221_TARGETS",
  };
}

export function loadP227SentCandidateIds(cwd = process.cwd()): {
  ids: string[];
  source: string;
} {
  const loaded = loadIdsFromJsonPaths(cwd, [
    {
      path: ".data/p227-controlled-live-dropbox-sign-send-operator-local.json",
      extract: (raw) => {
        const obj = raw as {
          candidateIds?: string[];
          sendResults?: Array<{ candidateId?: string }>;
        };
        if (obj.candidateIds?.length) return obj.candidateIds;
        return (obj.sendResults ?? []).map((r) => String(r.candidateId ?? ""));
      },
    },
    {
      path: "artifacts/p227-verification.json",
      extract: (raw) => {
        const obj = raw as {
          sends?: Array<{ candidateId?: string }>;
          readBack?: Array<{ candidateId?: string }>;
        };
        const fromSends = (obj.sends ?? []).map((r) => String(r.candidateId ?? ""));
        if (fromSends.some(Boolean)) return fromSends;
        return (obj.readBack ?? []).map((r) => String(r.candidateId ?? ""));
      },
    },
  ]);
  if (loaded) return loaded;
  return { ids: [], source: "none" };
}

export function loadP235SentCandidateIds(cwd = process.cwd()): {
  ids: string[];
  source: string;
} {
  const loaded = loadIdsFromJsonPaths(cwd, [
    {
      path: "artifacts/p235-newest-five-selection.json",
      extract: (raw) => {
        const obj = raw as { selected?: Array<{ candidateId?: string }> };
        return (obj.selected ?? []).map((r) => String(r.candidateId ?? ""));
      },
    },
    {
      path: "artifacts/p235-verification.json",
      extract: (raw) => {
        const obj = raw as { sends?: Array<{ candidateId?: string }> };
        return (obj.sends ?? []).map((r) => String(r.candidateId ?? ""));
      },
    },
    {
      path: ".data/p235-controlled-newest-five-send-operator-local.json",
      extract: (raw) => {
        const obj = raw as { candidateIds?: string[] };
        return obj.candidateIds ?? [];
      },
    },
  ]);
  if (!loaded) {
    throw new Error(
      `[${P239_PHASE}] Missing P235 sent-candidate IDs (expected artifacts/p235-newest-five-selection.json)`,
    );
  }
  return loaded;
}

export function loadP237SentCandidateIds(cwd = process.cwd()): {
  ids: string[];
  source: string;
} {
  const loaded = loadIdsFromJsonPaths(cwd, [
    {
      path: "artifacts/p237-newest-five-selection.json",
      extract: (raw) => {
        const obj = raw as { selected?: Array<{ candidateId?: string }> };
        return (obj.selected ?? []).map((r) => String(r.candidateId ?? ""));
      },
    },
    {
      path: "artifacts/p237-verification.json",
      extract: (raw) => {
        const obj = raw as { sends?: Array<{ candidateId?: string }> };
        return (obj.sends ?? []).map((r) => String(r.candidateId ?? ""));
      },
    },
    {
      path: ".data/p237-dashboard-ingestion-merge-send-operator-local.json",
      extract: (raw) => {
        const obj = raw as { candidateIds?: string[] };
        return obj.candidateIds ?? [];
      },
    },
    {
      path: ".data/p237-frozen-send-ids.json",
      extract: (raw) => {
        const obj = raw as { candidateIds?: string[] };
        return obj.candidateIds ?? [];
      },
    },
  ]);
  if (!loaded) {
    throw new Error(
      `[${P239_PHASE}] Missing P237 sent-candidate IDs (expected artifacts/p237-newest-five-selection.json)`,
    );
  }
  return loaded;
}

export function loadP238SentCandidateIds(cwd = process.cwd()): {
  ids: string[];
  source: string;
} {
  const loaded = loadIdsFromJsonPaths(cwd, [
    {
      path: "artifacts/p238-sent.json",
      extract: (raw) => {
        const obj = raw as { rows?: Array<{ candidateId?: string; ok?: boolean }> };
        return (obj.rows ?? [])
          .filter((r) => r.ok !== false)
          .map((r) => String(r.candidateId ?? ""));
      },
    },
    {
      path: ".data/p238-controlled-remaining-queue-send-operator-local.json",
      extract: (raw) => {
        const obj = raw as { candidateIds?: string[] };
        return obj.candidateIds ?? [];
      },
    },
    {
      path: "artifacts/p238-verification.json",
      extract: (raw) => {
        const obj = raw as { sends?: Array<{ candidateId?: string; ok?: boolean }> };
        return (obj.sends ?? [])
          .filter((r) => r.ok !== false)
          .map((r) => String(r.candidateId ?? ""));
      },
    },
  ]);
  if (!loaded) {
    throw new Error(
      `[${P239_PHASE}] Missing P238 sent-candidate IDs (expected artifacts/p238-sent.json)`,
    );
  }
  return loaded;
}

export function loadPriorSentExclusionSets(cwd = process.cwd()): {
  p221: Set<string>;
  p227: Set<string>;
  p235: Set<string>;
  p237: Set<string>;
  p238: Set<string>;
  all: Set<string>;
  sources: {
    p221: string;
    p227: string;
    p235: string;
    p237: string;
    p238: string;
  };
} {
  const p221 = loadP221SentCandidateIds(cwd);
  const p227 = loadP227SentCandidateIds(cwd);
  const p235 = loadP235SentCandidateIds(cwd);
  const p237 = loadP237SentCandidateIds(cwd);
  const p238 = loadP238SentCandidateIds(cwd);
  const all = new Set([
    ...p221.ids,
    ...p227.ids,
    ...p235.ids,
    ...p237.ids,
    ...p238.ids,
  ]);
  return {
    p221: new Set(p221.ids),
    p227: new Set(p227.ids),
    p235: new Set(p235.ids),
    p237: new Set(p237.ids),
    p238: new Set(p238.ids),
    all,
    sources: {
      p221: p221.source,
      p227: p227.source,
      p235: p235.source,
      p237: p237.source,
      p238: p238.source,
    },
  };
}
