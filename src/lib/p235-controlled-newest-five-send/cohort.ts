import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  P235_EXCLUDED_NAME,
  P235_PHASE,
} from "@/lib/p235-controlled-newest-five-send/types";

export function p235RedactId(candidateId: string): string {
  return createHash("sha256").update(candidateId).digest("hex").slice(0, 12);
}

export function p235NormalizeEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

export function p235DisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  candidateId: string;
}): string {
  const name = `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim();
  return name || input.email?.trim() || input.candidateId;
}

export function p235IsCalvinBrown(name: string): boolean {
  return name.trim().toLowerCase() === P235_EXCLUDED_NAME.toLowerCase();
}

export function p235HasUsablePhone(phone: string | null | undefined): boolean {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10;
}

export function p235HasUsableEmail(email: string | null | undefined): boolean {
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

export function p235IsTerminalOrArchived(status: string, notes: string[] = []): boolean {
  if (TERMINAL.has(status)) return true;
  const blob = notes.join("\n").toLowerCase();
  return /\barchived\b|\brejected\b|\bwithdrawn\b/.test(blob);
}

/**
 * Load frozen P234 Taylor-assigned cohort IDs from live verification artifact.
 * Falls back to preview frozenAssignableIds when verification rows are absent.
 */
export function loadP234FrozenCohortIds(cwd = process.cwd()): {
  ids: string[];
  source: string;
  approvedBy: string | null;
} {
  const verificationPath = path.join(cwd, "artifacts/p234-assignment-verification.json");
  const previewPath = path.join(cwd, "artifacts/p234-recruiter-assignment-preview.json");

  if (existsSync(verificationPath)) {
    const verification = JSON.parse(readFileSync(verificationPath, "utf8")) as {
      mode?: string;
      approvedBy?: string;
      rows?: Array<{ candidateId: string; ok?: boolean; actualRecruiter?: string }>;
      frozenAssignableIds?: string[];
    };
    const fromRows = (verification.rows ?? [])
      .filter((row) => row.ok !== false)
      .map((row) => String(row.candidateId).trim())
      .filter(Boolean);
    if (fromRows.length > 0) {
      return {
        ids: [...new Set(fromRows)],
        source: "artifacts/p234-assignment-verification.json#rows",
        approvedBy: verification.approvedBy ?? null,
      };
    }
    if (Array.isArray(verification.frozenAssignableIds) && verification.frozenAssignableIds.length) {
      return {
        ids: [...new Set(verification.frozenAssignableIds.map((id) => String(id).trim()).filter(Boolean))],
        source: "artifacts/p234-assignment-verification.json#frozenAssignableIds",
        approvedBy: verification.approvedBy ?? null,
      };
    }
  }

  if (existsSync(previewPath)) {
    const preview = JSON.parse(readFileSync(previewPath, "utf8")) as {
      frozenAssignableIds?: string[];
    };
    const ids = (preview.frozenAssignableIds ?? [])
      .map((id) => String(id).trim())
      .filter(Boolean);
    return {
      ids: [...new Set(ids)],
      source: "artifacts/p234-recruiter-assignment-preview.json#frozenAssignableIds",
      approvedBy: null,
    };
  }

  throw new Error(
    `[${P235_PHASE}] Missing P234 cohort artifacts (assignment-verification or recruiter-assignment-preview)`,
  );
}

export function loadP234IngestionGapIds(cwd = process.cwd()): Set<string> {
  const gapPath = path.join(cwd, "artifacts/p234-ingestion-gap.json");
  if (!existsSync(gapPath)) return new Set();
  const gap = JSON.parse(readFileSync(gapPath, "utf8")) as {
    rows?: Array<{ candidateId?: string }>;
  };
  return new Set(
    (gap.rows ?? [])
      .map((row) => String(row.candidateId ?? "").trim())
      .filter(Boolean),
  );
}
