import path from "node:path";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { backfillWorkflowRecordsForCandidates } from "@/lib/candidate-ingestion/backfill-workflow-records";
import {
  listIngestedCandidates,
  readIngestionStore,
  writeIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { reconcileAllWorkflowsFromOnboarding } from "@/lib/workflow-onboarding-reconciliation";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { findInIngestionStore } from "@/lib/p170-unified-candidate-discovery/search-candidates";
import { parseP170SearchQuery } from "@/lib/p170-unified-candidate-discovery/parse-search-query";
import { appendBreezyExportImportAudit, newAuditEntryId } from "@/lib/p175-breezy-export-import/audit-store";
import { buildBreezyExportImportPlan } from "@/lib/p175-breezy-export-import/build-import-plan";
import {
  exportRowToBreezyCandidate,
  mergeExportRowIntoCandidate,
  tagApiCandidates,
} from "@/lib/p175-breezy-export-import/merge-export-candidate";
import { loadBreezyExportWorkbookFromDisk } from "@/lib/p175-breezy-export-import/parse-export-workbook";
import { writeExportImportRollback } from "@/lib/p175-breezy-export-import/rollback";
import type { BreezyExportImportResult } from "@/lib/p175-breezy-export-import/types";
import { DEFAULT_BREEZY_EXPORT_WORKBOOK } from "@/lib/p175-breezy-export-import/types";

export async function runBreezyExportImport(input: {
  workbookPath?: string;
  confirmImport: boolean;
  byUserId?: string;
}): Promise<BreezyExportImportResult> {
  const workbookPath = path.resolve(
    process.cwd(),
    input.workbookPath ?? DEFAULT_BREEZY_EXPORT_WORKBOOK,
  );
  const plan = await buildBreezyExportImportPlan({
    workbookPath,
    dryRun: !input.confirmImport,
  });

  if (!input.confirmImport) {
    return {
      ...plan,
      ok: true,
      imported: false,
      added: plan.wouldAdd,
      merged: plan.wouldMerge,
      skipped: plan.wouldSkip,
      postIngestionCount: plan.preImport.ingestionCount,
      rollbackPath: null,
      auditEntryId: null,
      workflowsBackfilled: 0,
      workflowsReconciled: 0,
    };
  }

  const storeBefore = await readIngestionStore();
  const auditEntryId = newAuditEntryId();
  const rollbackPath = await writeExportImportRollback({
    auditEntryId,
    store: storeBefore,
  });

  const parsed = loadBreezyExportWorkbookFromDisk(workbookPath);
  const exportByRow = new Map(parsed.rows.map((r) => [r.rowNumber, r]));
  const candidates = { ...storeBefore.candidates };
  let added = 0;
  let merged = 0;

  for (const planRow of plan.rows) {
    if (planRow.action === "skip") continue;
    const exportRow = exportByRow.get(planRow.rowNumber);
    if (!exportRow) continue;
    const existing = candidates[planRow.targetCandidateId];
    if (existing) {
      candidates[planRow.targetCandidateId] = mergeExportRowIntoCandidate(existing, exportRow);
      merged += 1;
    } else {
      candidates[planRow.targetCandidateId] = exportRowToBreezyCandidate(exportRow);
      added += 1;
    }
  }

  const storeAfter = {
    ...storeBefore,
    candidates,
    lastChunkAt: new Date().toISOString(),
  };
  await writeIngestionStore(storeAfter);

  const importedCandidates = plan.rows
    .map((row) => candidates[row.targetCandidateId])
    .filter(Boolean);

  const workflowState = await getCandidateWorkflowState();
  const backfill = await backfillWorkflowRecordsForCandidates({
    candidates: importedCandidates,
    workflows: { ...workflowState },
    byUserId: input.byUserId,
  });
  const reconciled = await reconcileAllWorkflowsFromOnboarding({
    byUserId: input.byUserId,
  });

  const postIngestionCount = Object.keys(storeAfter.candidates).length;

  await appendBreezyExportImportAudit({
    id: auditEntryId,
    at: new Date().toISOString(),
    byUserId: input.byUserId ?? "system",
    workbookPath,
    dryRun: false,
    confirmImport: true,
    preImport: plan.preImport,
    added,
    merged,
    skipped: plan.wouldSkip,
    postIngestionCount,
    rollbackPath,
  });

  const postPlan = await buildBreezyExportImportPlan({ workbookPath, dryRun: true });
  const p157 = await loadDecisionCohort();

  return {
    ...postPlan,
    ok: true,
    imported: true,
    added,
    merged,
    skipped: plan.wouldSkip,
    postIngestionCount,
    rollbackPath,
    auditEntryId,
    workflowsBackfilled: backfill.created,
    workflowsReconciled: reconciled.reconciled,
    preImport: plan.preImport,
    wouldAdd: plan.wouldAdd,
    wouldMerge: plan.wouldMerge,
    wouldSkip: plan.wouldSkip,
    spotlight: {
      ...postPlan.spotlight,
      patriciaIrby: {
        ...postPlan.spotlight.patriciaIrby,
        discoverableAfter: Boolean(
          findInIngestionStore(storeAfter, parseP170SearchQuery("Irby")),
        ),
      },
    },
    newestAfterImport: postPlan.newestAfterImport.map((row) => ({
      ...row,
      eligibleP157: p157.candidatesById.has(row.targetCandidateId),
    })),
  };
}
