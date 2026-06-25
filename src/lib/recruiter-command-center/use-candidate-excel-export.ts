"use client";

import { downloadCandidatesXlsx } from "@/lib/recruiter-command-center/export-candidates-xlsx";
import type { RecruiterCommandCenterWorkItem } from "@/lib/recruiter-command-center/types";
import { useCallback, useState } from "react";

export type CandidateExcelExportScope = "all" | "filtered" | "selected";

type UseCandidateExcelExportOptions = {
  recruiterFilter?: string;
  selectedIds: Set<string>;
  resolveFilteredItems: (workQueue: RecruiterCommandCenterWorkItem[]) => RecruiterCommandCenterWorkItem[];
  disabled?: boolean;
};

async function fetchCommandCenterWorkQueue(
  recruiterFilter: string,
): Promise<RecruiterCommandCenterWorkItem[]> {
  const params = new URLSearchParams();
  if (recruiterFilter !== "all") params.set("recruiter", recruiterFilter);
  params.set("limit", "0");
  const query = params.toString();
  const res = await fetch(`/api/recruiting/command-center${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as {
    ok?: boolean;
    commandCenter?: { workQueue: RecruiterCommandCenterWorkItem[] };
    error?: string;
  };
  if (!res.ok || !data.ok || !data.commandCenter) {
    throw new Error(data.error ?? "Failed to load candidates for export");
  }
  return data.commandCenter.workQueue;
}

export function useCandidateExcelExport({
  recruiterFilter = "all",
  selectedIds,
  resolveFilteredItems,
  disabled = false,
}: UseCandidateExcelExportOptions) {
  const [exportScope, setExportScope] = useState<CandidateExcelExportScope>("filtered");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    if (disabled) return;
    setExporting(true);
    setExportError(null);
    try {
      const workQueue = await fetchCommandCenterWorkQueue(recruiterFilter);
      let items: RecruiterCommandCenterWorkItem[];
      if (exportScope === "selected") {
        items = workQueue.filter((item) => selectedIds.has(item.candidateId));
        if (items.length === 0) {
          setExportError("Select at least one candidate to export.");
          return;
        }
      } else if (exportScope === "filtered") {
        items = resolveFilteredItems(workQueue);
        if (items.length === 0) {
          setExportError("No candidates match the current filters.");
          return;
        }
      } else {
        items = workQueue;
        if (items.length === 0) {
          setExportError("No candidates available to export.");
          return;
        }
      }
      downloadCandidatesXlsx(items);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [disabled, exportScope, recruiterFilter, resolveFilteredItems, selectedIds]);

  return {
    exportScope,
    setExportScope,
    exporting,
    exportError,
    handleExport,
  };
}
