import path from "node:path";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { isMtdApplicant } from "@/lib/candidate-ingestion/candidate-queue-scope";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { findInIngestionStore } from "@/lib/p170-unified-candidate-discovery/search-candidates";
import { parseP170SearchQuery } from "@/lib/p170-unified-candidate-discovery/parse-search-query";
import {
  exportRowToBreezyCandidate,
  mergeExportRowIntoCandidate,
  tagApiCandidates,
} from "@/lib/p175-breezy-export-import/merge-export-candidate";
import {
  findStoreMatchForExportRow,
  nameMatchesQuery,
} from "@/lib/p175-breezy-export-import/match-export-to-store";
import { normalizeEmail } from "@/lib/p175-breezy-export-import/normalize";
import { loadBreezyExportWorkbookFromDisk } from "@/lib/p175-breezy-export-import/parse-export-workbook";
import type {
  BreezyExportImportPlan,
  BreezyExportImportPlanRow,
  BreezyExportImportPreImportStats,
  BreezyExportNormalizedRow,
} from "@/lib/p175-breezy-export-import/types";
import {
  DEFAULT_BREEZY_EXPORT_WORKBOOK,
  P175_SOURCE_PHASE,
} from "@/lib/p175-breezy-export-import/types";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import { isApiSourcedCandidate } from "@/lib/p175-breezy-export-import/normalize";

function buildPreImportStats(input: {
  store: CandidateIngestionStoreFile;
  exportRows: BreezyExportNormalizedRow[];
  planRows: BreezyExportImportPlanRow[];
}): BreezyExportImportPreImportStats {
  const ingestionCount = Object.keys(input.store.candidates).length;
  const matchedExportRowNumbers = new Set(
    input.planRows.filter((r) => r.action === "merge").map((r) => r.rowNumber),
  );
  const exportOnlyCount = input.planRows.filter((r) => r.action === "add").length;
  const matchedCount = input.planRows.filter((r) => r.action === "merge").length;
  const duplicateRiskCount = input.planRows.filter((r) => r.duplicateRisk).length;

  const matchedExistingIds = new Set(
    input.planRows
      .filter((r) => r.existingCandidateId)
      .map((r) => r.existingCandidateId as string),
  );

  const apiOnlyCount = listIngestedCandidates(input.store).filter(
    (candidate) =>
      isApiSourcedCandidate(candidate) && !matchedExistingIds.has(candidate.candidateId),
  ).length;

  const exportEmails = new Set(input.exportRows.map((r) => normalizeEmail(r.email)));

  return {
    ingestionCount,
    apiOnlyCount,
    exportOnlyCount,
    matchedCount,
    duplicateRiskCount,
    exportRowCount: input.exportRows.length,
    exportUniqueEmails: exportEmails.size,
  };
}

function buildPlanRows(input: {
  exportRows: BreezyExportNormalizedRow[];
  candidates: BreezyCandidate[];
}): BreezyExportImportPlanRow[] {
  const rows: BreezyExportImportPlanRow[] = [];
  const targetIdCounts = new Map<string, number>();

  for (const exportRow of input.exportRows) {
    const existing = findStoreMatchForExportRow({ exportRow, candidates: input.candidates });
    const targetCandidateId = existing?.candidateId ?? exportRow.syntheticCandidateId;
    targetIdCounts.set(targetCandidateId, (targetIdCounts.get(targetCandidateId) ?? 0) + 1);

    if (existing) {
      rows.push({
        rowNumber: exportRow.rowNumber,
        action: "merge",
        email: exportRow.email,
        name: exportRow.name,
        positionName: exportRow.positionName,
        appliedAt: exportRow.appliedAt,
        targetCandidateId,
        existingCandidateId: existing.candidateId,
        ingestionSource: "merged",
      });
      continue;
    }

    const collision = input.candidates.some((c) => c.candidateId === exportRow.syntheticCandidateId);
    if (collision) {
      rows.push({
        rowNumber: exportRow.rowNumber,
        action: "merge",
        email: exportRow.email,
        name: exportRow.name,
        positionName: exportRow.positionName,
        appliedAt: exportRow.appliedAt,
        targetCandidateId: exportRow.syntheticCandidateId,
        existingCandidateId: exportRow.syntheticCandidateId,
        ingestionSource: "merged",
        duplicateRisk: true,
      });
      continue;
    }

    rows.push({
      rowNumber: exportRow.rowNumber,
      action: "add",
      email: exportRow.email,
      name: exportRow.name,
      positionName: exportRow.positionName,
      appliedAt: exportRow.appliedAt,
      targetCandidateId,
      existingCandidateId: null,
      ingestionSource: "breezy_export",
    });
  }

  for (const row of rows) {
    if ((targetIdCounts.get(row.targetCandidateId) ?? 0) > 1) {
      row.duplicateRisk = true;
    }
  }

  return rows;
}

function simulatePostImportStore(input: {
  store: CandidateIngestionStoreFile;
  exportRows: BreezyExportNormalizedRow[];
  planRows: BreezyExportImportPlanRow[];
}): CandidateIngestionStoreFile {
  const candidates = { ...input.store.candidates };
  const exportByRow = new Map(input.exportRows.map((r) => [r.rowNumber, r]));

  for (const planRow of input.planRows) {
    if (planRow.action === "skip") continue;
    const exportRow = exportByRow.get(planRow.rowNumber);
    if (!exportRow) continue;
    const existing = candidates[planRow.targetCandidateId];
    if (existing) {
      candidates[planRow.targetCandidateId] = mergeExportRowIntoCandidate(existing, exportRow);
    } else {
      candidates[planRow.targetCandidateId] = exportRowToBreezyCandidate(exportRow);
    }
  }

  return { ...input.store, candidates };
}

function discoverableInStore(store: CandidateIngestionStoreFile, query: string): boolean {
  return Boolean(findInIngestionStore(store, parseP170SearchQuery(query)));
}

export async function buildBreezyExportImportPlan(input?: {
  workbookPath?: string;
  dryRun?: boolean;
}): Promise<BreezyExportImportPlan> {
  const workbookPath = path.resolve(
    process.cwd(),
    input?.workbookPath ?? DEFAULT_BREEZY_EXPORT_WORKBOOK,
  );
  const generatedAt = new Date().toISOString();
  const store = await readIngestionStore();
  const jobsResult = await fetchBreezyJobs("published");
  const jobs = jobsResult.ok ? jobsResult.jobs : [];

  const parsed = loadBreezyExportWorkbookFromDisk(workbookPath);
  const taggedCandidates = tagApiCandidates(listIngestedCandidates(store));
  const planRows = buildPlanRows({ exportRows: parsed.rows, candidates: taggedCandidates });
  const preImport = buildPreImportStats({ store, exportRows: parsed.rows, planRows });
  const simulatedStore = simulatePostImportStore({ store, exportRows: parsed.rows, planRows });

  const newestAfterImport = [...parsed.rows]
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))
    .slice(0, 25)
    .map((row) => {
      const plan = planRows.find((p) => p.rowNumber === row.rowNumber);
      const candidate = simulatedStore.candidates[plan?.targetCandidateId ?? row.syntheticCandidateId];
      return {
        name: row.name,
        email: row.email,
        appliedAt: row.appliedAt,
        positionName: row.positionName,
        action: plan?.action ?? ("add" as const),
        targetCandidateId: plan?.targetCandidateId ?? row.syntheticCandidateId,
        discoverableP170: discoverableInStore(simulatedStore, row.email),
        eligibleP157: candidate ? isMtdApplicant(candidate) : false,
      };
    });

  const july9Rows = parsed.rows.filter((r) => r.appliedAt.startsWith("2026-07-09"));
  const patriciaRow = parsed.rows.find((r) => nameMatchesQuery(r.name, "Patricia Irby"));

  const patriciaBefore = discoverableInStore(store, "Irby");
  const patriciaAfter = discoverableInStore(simulatedStore, "Irby");
  const patriciaPlan = patriciaRow
    ? planRows.find((p) => p.rowNumber === patriciaRow.rowNumber)
    : null;

  return {
    sourcePhase: P175_SOURCE_PHASE,
    generatedAt,
    workbookPath,
    dryRun: input?.dryRun !== false,
    preImport,
    wouldAdd: planRows.filter((r) => r.action === "add").length,
    wouldMerge: planRows.filter((r) => r.action === "merge").length,
    wouldSkip: parsed.skipped,
    rows: planRows,
    newestAfterImport,
    spotlight: {
      patriciaIrby: {
        query: "Irby",
        discoverableBefore: patriciaBefore,
        discoverableAfter: patriciaAfter,
        action:
          patriciaBefore && !patriciaPlan
            ? "already_present"
            : (patriciaPlan?.action ?? "skip"),
        candidateId: patriciaPlan?.targetCandidateId ?? null,
      },
      july9Applicants: july9Rows.map((row) => {
        const plan = planRows.find((p) => p.rowNumber === row.rowNumber);
        const before = discoverableInStore(store, row.email);
        const after = discoverableInStore(simulatedStore, row.email);
        return {
          name: row.name,
          email: row.email,
          discoverableBefore: before,
          discoverableAfter: after,
          action: before && plan?.action !== "add" ? "already_present" : (plan?.action ?? "skip"),
        };
      }),
    },
  };
}
