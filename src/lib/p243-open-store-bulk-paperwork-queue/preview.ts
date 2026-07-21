import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import { probeDropboxSendCapacity } from "@/lib/p243-open-store-bulk-paperwork-queue/capacity";
import { classifyAndQueueP243 } from "@/lib/p243-open-store-bulk-paperwork-queue/classify";
import { formatP243OsbpqPreviewMarkdown } from "@/lib/p243-open-store-bulk-paperwork-queue/format";
import { resolveOpenStoreSheetCandidates } from "@/lib/p243-open-store-bulk-paperwork-queue/resolve-candidates";
import { loadOpenStoreCandidateMatches } from "@/lib/p243-open-store-bulk-paperwork-queue/resolve-xlsx";
import {
  P243_OSBPQ_PHASE,
  type P243OsbpqPreviewReport,
  type P243OsbpqRunOptions,
} from "@/lib/p243-open-store-bulk-paperwork-queue/types";

export async function buildP243OsbpqPreview(
  options: Pick<P243OsbpqRunOptions, "xlsxPath" | "approveOver60Ids">,
): Promise<{
  report: P243OsbpqPreviewReport;
  markdown: string;
  eligible: ReturnType<typeof classifyAndQueueP243> extends Promise<infer R> ? R["eligible"] : never;
  deferred: ReturnType<typeof classifyAndQueueP243> extends Promise<infer R> ? R["deferred"] : never;
  allItems: ReturnType<typeof classifyAndQueueP243> extends Promise<infer R> ? R["items"] : never;
}> {
  const notes: string[] = [];
  const warnings: string[] = [];

  const loaded = loadOpenStoreCandidateMatches(options.xlsxPath);
  notes.push(...loaded.notes);

  const capacity = await probeDropboxSendCapacity();
  notes.push(capacity.detail);
  warnings.push(...capacity.limitationNotes);

  const resolved = await resolveOpenStoreSheetCandidates({ rows: loaded.rows });
  notes.push(...resolved.notes);
  warnings.push(...resolved.warnings);

  const queued = await classifyAndQueueP243({
    resolved: resolved.resolved,
    approveOver60Ids: options.approveOver60Ids,
    safeCapacity: capacity.safeCapacity,
  });
  notes.push(...queued.notes);

  // Attach capacity numbers onto summary
  queued.summary.apiRemaining = capacity.apiRequestsRemaining;
  queued.summary.safeCapacity = capacity.safeCapacity;

  let dropboxTestMode: boolean | null = null;
  try {
    dropboxTestMode = readDropboxSignConfig()?.testMode ?? null;
  } catch {
    dropboxTestMode = null;
  }

  const report: P243OsbpqPreviewReport = {
    generatedAt: new Date().toISOString(),
    phase: P243_OSBPQ_PHASE,
    xlsxPath: options.xlsxPath,
    dropboxTestMode,
    capacity,
    summary: queued.summary,
    queue: queued.items,
    eligibleIds: queued.eligible.map((c) => c.candidateId),
    deferredIds: queued.deferred.map((c) => c.candidateId),
    blockedIds: queued.blocked.map((c) => c.candidateId),
    notes,
    warnings: [...new Set(warnings)],
  };

  return {
    report,
    markdown: formatP243OsbpqPreviewMarkdown(report),
    eligible: queued.eligible,
    deferred: queued.deferred,
    allItems: queued.items,
  };
}
