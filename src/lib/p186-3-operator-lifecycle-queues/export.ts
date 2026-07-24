import type { P1863CandidateQueueItem } from "@/lib/p186-3-operator-lifecycle-queues/types";
import { readP1863Flags } from "@/lib/p186-3-operator-lifecycle-queues/flags";

export type RedactedExportRow = {
  candidateIdHash: string;
  displayNameRedacted: string;
  jobTitle: string | null;
  city: string | null;
  state: string | null;
  recruiter: string | null;
  dm: string | null;
  productionState: string | null;
  shadowState: string | null;
  queueId: string;
  mismatch: boolean;
  blocked: boolean;
  ageMs: number;
  recommendedAction: string;
};

function hashId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `cand_${h.toString(16).padStart(8, "0")}`;
}

function redactName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "Candidate";
  return parts.map((p) => `${p[0] ?? "?"}.`).join(" ");
}

/**
 * Redacted report — no signing URLs, emails, phones, or envelope IDs.
 */
export function buildRedactedExport(
  items: P1863CandidateQueueItem[],
  forceEnabled?: boolean,
): { ok: boolean; rows: RedactedExportRow[]; detail: string } {
  const flags = readP1863Flags(
    forceEnabled != null ? { redactedExports: forceEnabled } : undefined,
  );
  if (!flags.redactedExports) {
    return { ok: false, rows: [], detail: "P186_REDACTED_EXPORTS flag is off" };
  }
  return {
    ok: true,
    detail: `Exported ${items.length} redacted rows`,
    rows: items.map((item) => ({
      candidateIdHash: hashId(item.candidateId),
      displayNameRedacted: redactName(item.displayName),
      jobTitle: item.jobTitle,
      city: item.city,
      state: item.state,
      recruiter: item.recruiter,
      dm: item.dm,
      productionState: item.productionState,
      shadowState: item.shadowState,
      queueId: item.queueId,
      mismatch: item.mismatch,
      blocked: item.blocked,
      ageMs: item.ageMs,
      recommendedAction: item.recommendedAction,
    })),
  };
}
