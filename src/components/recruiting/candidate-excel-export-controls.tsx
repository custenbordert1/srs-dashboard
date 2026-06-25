"use client";

import type { CandidateExcelExportScope } from "@/lib/recruiter-command-center/use-candidate-excel-export";

type CandidateExcelExportControlsProps = {
  exportScope: CandidateExcelExportScope;
  onExportScopeChange: (scope: CandidateExcelExportScope) => void;
  onExport: () => void;
  exporting: boolean;
  disabled?: boolean;
  exportError?: string | null;
  className?: string;
};

export function CandidateExcelExportControls({
  exportScope,
  onExportScopeChange,
  onExport,
  exporting,
  disabled = false,
  exportError = null,
  className = "",
}: CandidateExcelExportControlsProps) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/60 px-2 py-1">
        <label className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
          Export
          <select
            value={exportScope}
            onChange={(event) => onExportScopeChange(event.target.value as CandidateExcelExportScope)}
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs normal-case text-zinc-200"
          >
            <option value="all">All candidates</option>
            <option value="filtered">Filtered only</option>
            <option value="selected">Selected only</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void onExport()}
          disabled={exporting || disabled}
          className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-100 hover:bg-teal-500/20 disabled:opacity-60"
        >
          {exporting ? "Exporting…" : "Export to Excel"}
        </button>
      </div>
      {exportError ? <p className="mt-2 text-xs text-amber-200">{exportError}</p> : null}
    </div>
  );
}
