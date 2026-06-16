"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import type { UserPublic } from "@/lib/auth/types";
import type {
  CandidateReEngagementIntelligenceSnapshot,
  CandidateReEngagementSegment,
  ReEngagementOpportunity,
  ReEngagementWorkflowAction,
} from "@/lib/candidate-re-engagement-intelligence";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import {
  mapWorkflowActionToStatus,
  workflowNoteForAction,
} from "@/lib/candidate-re-engagement-intelligence";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import {
  UI_BADGE,
  UI_BUTTON,
  UI_LAYOUT,
  UI_RISK,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type ReEngagementResponse = {
  ok?: boolean;
  snapshot?: CandidateReEngagementIntelligenceSnapshot;
  meta?: {
    partialSync?: boolean;
    refreshedAt?: string;
    intelligenceCache?: RecruitingIntelligenceCacheMeta;
    scopedToRecruiter?: boolean;
  };
  error?: string;
};

type CandidateReEngagementOutreachCenterProps = {
  user?: UserPublic;
  compact?: boolean;
};

const SEGMENT_STYLES: Record<CandidateReEngagementSegment, string> = {
  hot: UI_RISK.critical,
  warm: UI_RISK.atRisk,
  cold: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  dormant: UI_BADGE.moderate,
  "former-worker": "border-violet-500/40 bg-violet-500/10 text-violet-100",
  "high-value": "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
};

function KpiCard({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-50">
        {value}
        {suffix ? <span className="text-base font-medium text-zinc-400">{suffix}</span> : null}
      </p>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${UI_SURFACE.panel} border-zinc-800/80 bg-zinc-950/40 p-4`}>
      <div className="mb-3">
        <h3 className={UI_TYPE.sectionTitle}>{title}</h3>
        {subtitle ? <p className={UI_TYPE.sectionSubtitle}>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function OpportunityRow({
  row,
  onWorkflowAction,
  busy,
}: {
  row: ReEngagementOpportunity;
  onWorkflowAction: (row: ReEngagementOpportunity, action: ReEngagementWorkflowAction) => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-50">{row.candidateName}</p>
          <p className="mt-0.5 text-xs text-zinc-400">
            {row.segment.replace(/-/g, " ")} · {row.source.replace(/-/g, " ")} · {row.city}, {row.state}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {row.projectName} · {row.storeName}
          </p>
          <p className="mt-1 text-xs text-amber-200/90">
            Score {row.reEngagementScore} · placement {row.placementProbability}% · territory {row.territoryImpact} · project {row.projectImpact}
          </p>
          <p className="mt-1 text-xs text-teal-300/90">
            {row.outreach.label} · impact {row.outreach.impactScore} · confidence {row.outreach.confidenceScore}%
          </p>
          <p className="mt-1 text-xs text-zinc-500">{row.recommendedAction}</p>
          <p className="mt-1 text-[10px] text-zinc-500">
            Timing: {row.recommendedTiming} · Expected: {row.expectedOutcome}
          </p>
          {row.followUpDueAt ? (
            <p className="mt-1 text-[10px] text-amber-300">Follow-up due {row.followUpDueAt}</p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${SEGMENT_STYLES[row.segment]}`}
        >
          {row.segment}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(
          [
            ["contacted", "Contacted"],
            ["interested", "Interested"],
            ["not-interested", "Not Interested"],
            ["schedule-follow-up", "Schedule Follow-Up"],
            ["escalate", "Escalate"],
          ] as const
        ).map(([action, label]) => (
          <button
            key={action}
            type="button"
            disabled={busy}
            onClick={() => onWorkflowAction(row, action)}
            className="rounded border border-zinc-700/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-300 hover:border-teal-500/40 disabled:opacity-50"
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[10px] uppercase text-zinc-500">{row.workflowStatus}</span>
      </div>
    </div>
  );
}

export function CandidateReEngagementOutreachCenter({
  user,
  compact = false,
}: CandidateReEngagementOutreachCenterProps) {
  const [snapshot, setSnapshot] = useState<CandidateReEngagementIntelligenceSnapshot | null>(null);
  const [meta, setMeta] = useState<ReEngagementResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workflowBusy, setWorkflowBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/candidate-re-engagement-intelligence", {
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const payload = (await response.json()) as ReEngagementResponse;
      if (!response.ok || !payload.ok || !payload.snapshot) {
        throw new Error(payload.error ?? "Failed to load candidate re-engagement intelligence");
      }
      setSnapshot(payload.snapshot);
      setMeta(payload.meta);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyWorkflowAction = useCallback(
    async (row: ReEngagementOpportunity, action: ReEngagementWorkflowAction) => {
      setWorkflowBusy(true);
      try {
        const status = mapWorkflowActionToStatus(action);
        const note = workflowNoteForAction(action);
        await fetchWithTimeout("/api/executive-alerts/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alertId: row.workflowAlertId,
            status,
            note,
          }),
          timeoutMs: FETCH_T4_INTELLIGENCE_MS,
        });

        if (action === "schedule-follow-up" || action === "escalate") {
          const due = new Date();
          due.setDate(due.getDate() + (action === "escalate" ? 1 : 2));
          await fetchWithTimeout("/api/executive-alerts/follow-ups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              alertId: row.workflowAlertId,
              ownerKind: action === "escalate" ? "dm" : "recruiter",
              ownerName: action === "escalate" ? "District Manager" : row.assignedRecruiter || user?.name || "Recruiter",
              dueDate: due.toISOString(),
              priority: action === "escalate" ? "high" : "medium",
              notes: note,
            }),
            timeoutMs: FETCH_T4_INTELLIGENCE_MS,
          });
        }

        await load();
      } catch {
        // Keep list visible; user can retry.
      } finally {
        setWorkflowBusy(false);
      }
    },
    [load, user?.name],
  );

  const dataTrust = {
    hasData: Boolean(snapshot),
    partialSync: meta?.partialSync ?? false,
    error,
  };

  const recruiterLabel = snapshot?.scope.recruiterLabel ?? user?.name ?? "Recruiter";
  const displayRows = compact ? snapshot?.top25.slice(0, 12) ?? [] : snapshot?.top25 ?? [];

  const content = snapshot ? (
    <div id="candidate-re-engagement-outreach-center" className={compact ? "space-y-3" : UI_SPACE.page}>
      {!compact ? (
        <>
          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>{recruiterLabel} · Outreach Intelligence</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Prioritized re-engagement opportunities ranked by territory demand and recovery impact
              </p>
            </div>
            <div className={UI_LAYOUT.toolbar}>
              <DataTrustBadge trust={dataTrust} />
              {meta?.intelligenceCache ? (
                <span className="rounded-full border border-zinc-700/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Intel cache · {meta.intelligenceCache.cacheStatus}
                </span>
              ) : null}
              <button type="button" onClick={() => void load()} className={UI_BUTTON.primary}>
                Refresh
              </button>
            </div>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Recoverable" value={snapshot.executiveSummary.recoverableCandidates} />
            <KpiCard label="Potential Placements" value={snapshot.executiveSummary.potentialPlacements} />
            <KpiCard
              label="Coverage Gain"
              value={snapshot.executiveSummary.estimatedCoverageGainPercent}
              suffix="%"
            />
            <KpiCard label="Top 25 Opportunities" value={snapshot.top25.length} />
          </section>
        </>
      ) : null}

      <div className={`grid gap-4 ${compact ? "" : "xl:grid-cols-2"}`}>
        {compact ? (
          <div className="space-y-2">
            {displayRows.length === 0 ? (
              <p className="text-sm text-zinc-500">No re-engagement opportunities.</p>
            ) : (
              displayRows.map((row) => (
                <OpportunityRow
                  key={row.candidateId}
                  row={row}
                  onWorkflowAction={applyWorkflowAction}
                  busy={workflowBusy}
                />
              ))
            )}
          </div>
        ) : (
          <>
            <SectionCard
              title="Recruiter Outreach Center"
              subtitle="Top 25 ranked outreach opportunities"
            >
              <div className="space-y-2">
                {displayRows.length === 0 ? (
                  <p className="text-sm text-zinc-500">No re-engagement opportunities.</p>
                ) : (
                  displayRows.map((row) => (
                    <OpportunityRow
                      key={row.candidateId}
                      row={row}
                      onWorkflowAction={applyWorkflowAction}
                      busy={workflowBusy}
                    />
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard title="Territory Recovery Impact" subtitle="Forecast if re-engaged successfully">
              <div className="space-y-2">
                {snapshot.territoryForecasts.slice(0, 8).map((forecast) => (
                  <div
                    key={forecast.state}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-zinc-100">{forecast.territoryLabel}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {forecast.recoverableCandidates} recoverable · {forecast.potentialPlacements} placements ·
                      +{forecast.coverageImprovementPercent}% coverage · −{forecast.openCallReduction} open calls
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(
                  Object.entries(snapshot.segmentCounts) as Array<[CandidateReEngagementSegment, number]>
                ).map(([segment, count]) => (
                  <div
                    key={segment}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-2 py-2 text-center"
                  >
                    <p className="text-[10px] uppercase text-zinc-500">{segment.replace(/-/g, " ")}</p>
                    <p className="text-lg font-bold tabular-nums text-zinc-100">{count}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </div>
  ) : null;

  if (compact) {
    if (loading) return <p className="text-sm text-zinc-500">Loading outreach intelligence…</p>;
    if (error) return <p className="text-sm text-red-300">{error}</p>;
    return content;
  }

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(snapshot)}
      loadingMessage="Loading outreach intelligence…"
      emptyTitle="No re-engagement opportunities"
      emptyMessage="Recoverable candidates will appear after the next intelligence sync."
      emptyNextStep="Try refresh, or confirm candidate workflows are up to date."
      onRefresh={() => void load()}
      partialDataAvailable={Boolean(snapshot)}
    >
      {content}
    </WorkspacePageShell>
  );
}
