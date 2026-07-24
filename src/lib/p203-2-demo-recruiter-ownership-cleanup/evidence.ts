import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import type { P1884LedgerEvent } from "@/lib/p188-4-recruiter-ownership-durability/types";
import type { P158AssignmentAuditEvent } from "@/lib/p158-autonomous-recruiter-assignment/types";
import { isDemoRecruiterName } from "@/lib/production-recruiter-directory";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

export type ValidOwnershipEvidence = {
  recruiter: string;
  at: string;
  source: "manual_audit" | "production_auto_audit" | "ownership_ledger";
  detail: string;
};

function isValidProductionRecruiter(name: string | null | undefined): name is string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || trimmed === "Unassigned") return false;
  if (isDemoRecruiterName(trimmed)) return false;
  return true;
}

export function isValidProductionRecruiterName(name: string | null | undefined): boolean {
  return isValidProductionRecruiter(name);
}

/**
 * Walk workflow audit JSONL for the most recent valid (non-demo) named owner
 * per candidate, preferring manual actions over production auto.
 */
export async function scanValidOwnershipEvidenceFromWorkflowAudit(input: {
  candidateIds: string[];
  auditPath?: string;
}): Promise<{
  manualByCandidate: Record<string, ValidOwnershipEvidence>;
  productionAutoByCandidate: Record<string, ValidOwnershipEvidence>;
  linesScanned: number;
}> {
  const cohort = new Set(input.candidateIds);
  const auditPath =
    input.auditPath ?? path.join(recruitingDataDir(), "candidate-workflow-audit.jsonl");
  const manualByCandidate: Record<string, ValidOwnershipEvidence> = {};
  const productionAutoByCandidate: Record<string, ValidOwnershipEvidence> = {};
  let linesScanned = 0;

  let rl: ReturnType<typeof createInterface> | null = null;
  try {
    rl = createInterface({
      input: createReadStream(auditPath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
  } catch {
    return { manualByCandidate, productionAutoByCandidate, linesScanned: 0 };
  }

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
    const recruiter = String(
      meta.afterRecruiter ?? meta.assignedRecruiter ?? meta.recruiter ?? meta.to ?? "",
    ).trim();
    if (!isValidProductionRecruiter(recruiter)) continue;

    if (action === "manual_assign_recruiter" || action === "assign_recruiter") {
      const prev = manualByCandidate[candidateId];
      if (!prev || at >= prev.at) {
        manualByCandidate[candidateId] = {
          recruiter,
          at,
          source: "manual_audit",
          detail: `Workflow audit ${action} → ${recruiter} @ ${at}`,
        };
      }
    }

    if (action === "auto_assign_recruiter") {
      const prev = productionAutoByCandidate[candidateId];
      if (!prev || at >= prev.at) {
        productionAutoByCandidate[candidateId] = {
          recruiter,
          at,
          source: "production_auto_audit",
          detail: `Workflow audit auto_assign_recruiter → ${recruiter} @ ${at}`,
        };
      }
    }
  }

  return { manualByCandidate, productionAutoByCandidate, linesScanned };
}

export function pickLatestValidLedgerEvidence(
  events: P1884LedgerEvent[],
): ValidOwnershipEvidence | null {
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  for (const event of sorted) {
    if (isValidProductionRecruiter(event.newRecruiter)) {
      return {
        recruiter: event.newRecruiter.trim(),
        at: event.at,
        source: "ownership_ledger",
        detail: `Ownership ledger ${event.source} → ${event.newRecruiter} @ ${event.at}`,
      };
    }
    if (
      isDemoRecruiterName(event.newRecruiter ?? "") &&
      isValidProductionRecruiter(event.previousRecruiter)
    ) {
      return {
        recruiter: event.previousRecruiter.trim(),
        at: event.at,
        source: "ownership_ledger",
        detail: `Ownership ledger previousRecruiter before demo write → ${event.previousRecruiter} @ ${event.at}`,
      };
    }
  }
  return null;
}

export function pickLatestValidP158Evidence(
  events: P158AssignmentAuditEvent[],
): ValidOwnershipEvidence | null {
  const sorted = [...events]
    .filter((e) => e.executionMode === "production" && e.action === "assigned")
    .sort((a, b) => b.at.localeCompare(a.at));
  for (const event of sorted) {
    const recruiter = String(event.afterRecruiter ?? event.recruiter ?? "").trim();
    if (!isValidProductionRecruiter(recruiter)) continue;
    return {
      recruiter,
      at: event.at,
      source: "production_auto_audit",
      detail: `P158 production assignment → ${recruiter} @ ${event.at}`,
    };
  }
  return null;
}

export function redactedCandidateId(candidateId: string): string {
  return createHash("sha256").update(`p203.2:${candidateId}`).digest("hex").slice(0, 12);
}

export function ownershipIdempotencyKey(input: {
  candidateId: string;
  expectedOwnershipVersion: number;
  proposedReplacement: string;
}): string {
  return `p203.2:${input.candidateId}:v${input.expectedOwnershipVersion}:${input.proposedReplacement}`;
}
