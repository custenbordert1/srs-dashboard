import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import {
  buildP242PreviewSummary,
  classifyP242Candidates,
} from "@/lib/p242-open-store-paperwork-push/classify";
import { discoverP242OpenStoreApplicants } from "@/lib/p242-open-store-paperwork-push/discover";
import { formatP242PreviewMarkdown } from "@/lib/p242-open-store-paperwork-push/format";
import {
  P242_PHASE,
  type P242PreviewReport,
  type P242RunOptions,
} from "@/lib/p242-open-store-paperwork-push/types";

export async function buildP242Preview(
  options: Pick<P242RunOptions, "xlsxPath" | "approveOver60Ids">,
): Promise<{
  report: P242PreviewReport;
  markdown: string;
}> {
  const discovery = await discoverP242OpenStoreApplicants({ xlsxPath: options.xlsxPath });
  const classified = await classifyP242Candidates({
    applicants: discovery.applicants,
    approveOver60Ids: options.approveOver60Ids,
  });

  let dropboxTestMode: boolean | null = null;
  try {
    const cfg = readDropboxSignConfig();
    dropboxTestMode = cfg?.testMode ?? null;
  } catch {
    dropboxTestMode = null;
  }

  const summary = buildP242PreviewSummary(
    classified.candidates,
    discovery.stores.length,
  );

  const report: P242PreviewReport = {
    generatedAt: new Date().toISOString(),
    phase: P242_PHASE,
    xlsxPath: options.xlsxPath,
    dropboxTestMode,
    summary,
    stores: discovery.stores,
    candidates: classified.candidates,
    eligibleCandidateIds: classified.eligible.map((c) => c.candidateId),
    blockedCandidateIds: classified.blocked.map((c) => c.candidateId),
    notes: [...discovery.notes, ...classified.notes],
    warnings: [...discovery.warnings],
  };

  return { report, markdown: formatP242PreviewMarkdown(report) };
}
