import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

export type HistoricalNamedAssignment = {
  candidateId: string;
  recruiter: string;
  at: string;
  action: string;
};

export type HistoricalReconstructionScan = {
  auditPath: string;
  linesScanned: number;
  cohortSize: number;
  lastNamedByCandidate: Record<string, HistoricalNamedAssignment>;
  rapidWipeCount: number;
  uniqueNamedCount: number;
  recruiterHistogram: Record<string, number>;
};

/**
 * Read-only scan of workflow audit for last named recruiter per candidate.
 * Does not write or reconstruct production ownership.
 */
export async function scanHistoricalNamedAssignments(input: {
  candidateIds: string[];
  auditPath?: string;
  rapidWipeMs?: number;
}): Promise<HistoricalReconstructionScan> {
  const cohort = new Set(input.candidateIds);
  const auditPath =
    input.auditPath ?? path.join(recruitingDataDir(), "candidate-workflow-audit.jsonl");
  const rapidWipeMs = input.rapidWipeMs ?? 5000;

  const lastNamedByCandidate: Record<string, HistoricalNamedAssignment> = {};
  let linesScanned = 0;
  let rapidWipeCount = 0;

  const rl = createInterface({
    input: createReadStream(auditPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    linesScanned += 1;
    let row: {
      action?: string;
      candidateId?: string;
      at?: string;
      metadata?: Record<string, unknown>;
    };
    try {
      row = JSON.parse(line) as typeof row;
    } catch {
      continue;
    }
    const candidateId = row.candidateId;
    if (!candidateId || !cohort.has(candidateId)) continue;
    const action = row.action ?? "";
    const meta = row.metadata ?? {};
    const at = row.at ?? "";

    if (
      action === "auto_assign_recruiter" ||
      action === "assign_recruiter" ||
      action === "manual_assign_recruiter"
    ) {
      const recruiter = String(
        meta.afterRecruiter ?? meta.assignedRecruiter ?? meta.recruiter ?? meta.to ?? "",
      ).trim();
      if (recruiter && recruiter !== "Unassigned") {
        lastNamedByCandidate[candidateId] = {
          candidateId,
          recruiter,
          at,
          action,
        };
      }
    }

    if (action === "ingestion_import") {
      const prior = lastNamedByCandidate[candidateId];
      if (!prior) continue;
      const namedAt = Date.parse(prior.at);
      const wipeAt = Date.parse(at);
      if (
        Number.isFinite(namedAt) &&
        Number.isFinite(wipeAt) &&
        wipeAt >= namedAt &&
        wipeAt - namedAt < rapidWipeMs
      ) {
        rapidWipeCount += 1;
      }
    }
  }

  const recruiterHistogram: Record<string, number> = {};
  for (const row of Object.values(lastNamedByCandidate)) {
    recruiterHistogram[row.recruiter] = (recruiterHistogram[row.recruiter] ?? 0) + 1;
  }

  return {
    auditPath,
    linesScanned,
    cohortSize: cohort.size,
    lastNamedByCandidate,
    rapidWipeCount,
    uniqueNamedCount: Object.keys(lastNamedByCandidate).length,
    recruiterHistogram,
  };
}
