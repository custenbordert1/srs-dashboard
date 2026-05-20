"use client";

import { isGoogleSheetRecruitingLiveEnabledClient } from "@/lib/recruiting-data-architecture";

export function RecruitingArchiveBanner() {
  if (isGoogleSheetRecruitingLiveEnabledClient()) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100"
    >
      <p className="font-medium text-sky-50">Google Sheet recruiting = reference only</p>
      <p className="mt-1 text-sky-100/90">
        Live job ads, applicant counts, and recruiting KPIs use Breezy HR. The sections below show
        archived sheet rows for export and historical comparison — not the active ATS source.
      </p>
    </div>
  );
}
