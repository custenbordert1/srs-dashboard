"use client";

import { useState } from "react";
import { ActiveRepMatchingPanel } from "@/components/recruiting/active-rep-matching-panel";
import { CoverageRiskDashboard } from "@/components/recruiting/coverage-risk-dashboard";
import { RepImportPanel } from "@/components/recruiting/rep-import-panel";
import { RepIntelligencePanel } from "@/components/recruiting/rep-intelligence-panel";
import { StaffingRecommendationsPanel } from "@/components/recruiting/staffing-recommendations-panel";
import { ChangePasswordPanel } from "@/components/auth/change-password-panel";
import { useRepIntelligence } from "@/hooks/use-rep-intelligence";
import { TabSkeleton } from "@/components/ui/tab-skeleton";

type WorkforceOperationsSectionProps = {
  showPasswordPanel?: boolean;
};

export function WorkforceOperationsSection({ showPasswordPanel = false }: WorkforceOperationsSectionProps) {
  const [includeInactive, setIncludeInactive] = useState(false);
  const { snapshot, loading, error, refresh } = useRepIntelligence({ includeInactive });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Workforce operations</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Rep import, geocoded matching, coverage risk, and AI staffing guidance
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded border-zinc-600"
            />
            Include inactive reps for analysis
          </label>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh intelligence"}
          </button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="shrink-0 rounded-lg border border-red-400/40 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-500/20"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <RepImportPanel />
        {showPasswordPanel ? <ChangePasswordPanel /> : null}
      </div>

      {loading && !snapshot ? <TabSkeleton rows={4} cards={2} /> : null}

      {snapshot ? (
        <>
          <RepIntelligencePanel snapshot={snapshot} />
          <CoverageRiskDashboard snapshot={snapshot} />
          <ActiveRepMatchingPanel
            matches={snapshot.repProjectMatches}
            geocodedRepCount={snapshot.geocodedRepCount}
          />
          <StaffingRecommendationsPanel recommendations={snapshot.staffingRecommendations} />
          {snapshot.importedRepCount > 0 ? (
            <p className="text-xs text-zinc-600">
              {snapshot.importedRepCount} imported rep(s) merged with MEL roster data.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
