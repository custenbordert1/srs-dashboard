import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadP158AssignmentAuditLog } from "@/lib/p158-autonomous-recruiter-assignment";
import { detectOnboardingBypassFindings } from "@/lib/p188-1-hiring-recommendation-workflow/bypassDetector";
import {
  buildEnrichmentBundle,
  type P1882EnrichmentBundle,
} from "@/lib/p188-2-breezy-enrichment-recovery/sources";
import type { MappingReviewRecord } from "@/lib/p108-intelligent-project-mapping/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function loadMappingReviewsSafe(): Promise<MappingReviewRecord[]> {
  const candidates = [
    path.join(recruitingDataDir(), "p109-project-mapping-decisions.json"),
    path.join(recruitingDataDir(), "p108-mapping-review-decisions.json"),
    path.join(recruitingDataDir(), "p110-approved-mappings.json"),
  ];
  const out: MappingReviewRecord[] = [];
  for (const file of candidates) {
    try {
      const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
      const rows = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object" && Array.isArray((raw as { decisions?: unknown }).decisions)
          ? (raw as { decisions: MappingReviewRecord[] }).decisions
          : raw && typeof raw === "object" && Array.isArray((raw as { records?: unknown }).records)
            ? (raw as { records: MappingReviewRecord[] }).records
            : [];
      for (const r of rows) {
        if (r && typeof r === "object" && "candidateId" in r) {
          out.push(r as MappingReviewRecord);
        }
      }
    } catch {
      // optional store
    }
  }
  return out;
}

/**
 * Load local authoritative sources for P188.2 (read-only).
 * Does not call live Breezy APIs — uses ingestion store + audits + workflows.
 */
export async function loadP1882EnrichmentBundleFromLocal(options?: {
  nowMs?: number;
  operatorConfirmedRecruiter?: Record<string, string>;
  operatorConfirmedJob?: Record<string, string>;
  territoryRecruiterUnique?: Record<string, string>;
}): Promise<P1882EnrichmentBundle> {
  const [workflowState, ingestion, audits, mappingReviews] = await Promise.all([
    getCandidateWorkflowState(),
    readIngestionStore(),
    loadP158AssignmentAuditLog(),
    loadMappingReviewsSafe(),
  ]);

  const workflows = Object.values(workflowState);
  const breezyCandidates = Object.values(ingestion.candidates ?? {});
  const bypassFindings = detectOnboardingBypassFindings(workflows, {
    bypassFindingsDashboard: true,
  });

  return buildEnrichmentBundle({
    workflows,
    breezyCandidates,
    assignmentAudits: audits,
    mappingReviews,
    bypassFindings,
    operatorConfirmedRecruiter: options?.operatorConfirmedRecruiter,
    operatorConfirmedJob: options?.operatorConfirmedJob,
    territoryRecruiterUnique: options?.territoryRecruiterUnique,
    nowMs: options?.nowMs,
  });
}
