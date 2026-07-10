"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import type { P157CandidateDecision, P157DecisionAction } from "@/lib/p157-recruiter-decision-engine/types";
import { useRecruitingDecisions } from "@/hooks/use-recruiting-decisions";

function confidenceTone(confidence: number): "success" | "warning" | "neutral" | "critical" {
  if (confidence >= 90) return "success";
  if (confidence >= 80) return "warning";
  if (confidence >= 65) return "neutral";
  return "critical";
}

function DecisionTable({ rows, emptyLabel }: { rows: P157CandidateDecision[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Confidence</th>
            <th className="px-3 py-2">Candidate</th>
            <th className="px-3 py-2">Reasons</th>
            <th className="px-3 py-2">Priority</th>
            <th className="px-3 py-2">Recruiter</th>
            <th className="px-3 py-2">DM</th>
            <th className="px-3 py-2">Project</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.candidateId} className="border-b border-white/5 align-top">
              <td className="px-3 py-3 font-medium text-white">{row.action}</td>
              <td className="px-3 py-3">
                <StatusBadge tone={confidenceTone(row.confidence)}>{String(row.confidence)}</StatusBadge>
              </td>
              <td className="px-3 py-3">
                <div className="font-medium text-white">{row.candidateName}</div>
                <div className="text-xs text-slate-400">{row.workflowStatus}</div>
              </td>
              <td className="max-w-xs px-3 py-3 text-slate-300">
                <ul className="list-disc space-y-1 pl-4">
                  {row.reasoning.slice(0, 4).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </td>
              <td className="px-3 py-3 text-slate-300">{row.priorityScore}</td>
              <td className="px-3 py-3 text-slate-300">{row.recruiter}</td>
              <td className="px-3 py-3 text-slate-300">{row.dm}</td>
              <td className="px-3 py-3 text-slate-300">{row.project ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      {label}
      <select
        className="rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 text-sm text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RecruitingDecisionsPanel() {
  const {
    dashboard,
    warnings,
    error,
    loading,
    loadingCeilingHit,
    showingCachedSnapshot,
    refreshing,
    filters,
    updateFilter,
    clearFilters,
    refresh,
  } = useRecruitingDecisions();

  if (loading) {
    return <ExecutivePanelLoading title="Recruiting Decisions" badge="P157" />;
  }

  if (loadingCeilingHit && !dashboard) {
    return (
      <ExecutivePanelError
        title="Recruiting Decisions"
        message="Decision engine request timed out — retry shortly."
        onRetry={() => void refresh()}
      />
    );
  }

  if (!dashboard) {
    return (
      <ExecutivePanelError
        title="Recruiting Decisions"
        message={error ?? "Failed to load decision dashboard"}
        onRetry={() => void refresh()}
      />
    );
  }

  const bannerWarnings = [...warnings];
  if (error) bannerWarnings.push(error);
  const s = dashboard.summary;

  return (
    <div className="space-y-6">
      {(showingCachedSnapshot || bannerWarnings.length > 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {showingCachedSnapshot ? (
            <p className="font-medium">Showing last successful decision snapshot.</p>
          ) : null}
          {bannerWarnings.length > 0 ? <ExecutiveWarningList warnings={bannerWarnings} /> : null}
        </div>
      )}

      <ExecutiveCard variant="premium">
        <SectionHeader
          title="Executive Summary"
          subtitle="P157 — read-only next-action recommendations for every candidate"
          actions={
            <button
              type="button"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          }
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard label="Candidates" value={s.totalCandidates} />
          <MetricCard label="High confidence" value={s.highConfidenceCount} />
          <MetricCard label="Manual review" value={s.manualReviewCount} />
          <MetricCard label="Blocked" value={s.blockedCount} />
          <MetricCard label="Avg confidence" value={s.avgConfidence} />
        </div>
        {s.topAction ? (
          <p className="mt-3 text-sm text-slate-400">
            Most common action: <span className="text-white">{s.topAction}</span>
          </p>
        ) : null}
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Filters" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <FilterSelect
            label="Recruiter"
            value={filters.recruiter ?? ""}
            options={dashboard.filterOptions.recruiters}
            onChange={(v) => updateFilter("recruiter", v || null)}
          />
          <FilterSelect
            label="DM"
            value={filters.dm ?? ""}
            options={dashboard.filterOptions.dms}
            onChange={(v) => updateFilter("dm", v || null)}
          />
          <FilterSelect
            label="State"
            value={filters.state ?? ""}
            options={dashboard.filterOptions.states}
            onChange={(v) => updateFilter("state", v || null)}
          />
          <FilterSelect
            label="Project"
            value={filters.project ?? ""}
            options={dashboard.filterOptions.projects}
            onChange={(v) => updateFilter("project", v || null)}
          />
          <FilterSelect
            label="Decision"
            value={filters.decision ?? ""}
            options={dashboard.filterOptions.decisions}
            onChange={(v) => updateFilter("decision", (v as P157DecisionAction) || null)}
          />
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Confidence min
            <input
              type="number"
              min={0}
              max={100}
              className="rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 text-sm text-white"
              value={filters.confidenceMin ?? ""}
              onChange={(e) =>
                updateFilter("confidenceMin", e.target.value ? Number.parseInt(e.target.value, 10) : null)
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Priority min
            <input
              type="number"
              min={0}
              max={100}
              className="rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 text-sm text-white"
              value={filters.priorityMin ?? ""}
              onChange={(e) =>
                updateFilter("priorityMin", e.target.value ? Number.parseInt(e.target.value, 10) : null)
              }
            />
          </label>
        </div>
        <button
          type="button"
          className="mt-3 text-sm text-slate-400 underline hover:text-white"
          onClick={clearFilters}
        >
          Clear filters
        </button>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Decision Distribution" />
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {dashboard.distribution.map((row) => (
            <li key={row.action} className="rounded-lg border border-white/5 px-3 py-2 text-sm text-slate-300">
              <span className="font-medium text-white">{row.action}</span>
              <span className="text-slate-400"> — {row.count} candidates · avg {row.avgConfidence}%</span>
            </li>
          ))}
        </ul>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Recommended Actions" />
        <div className="mt-4">
          <DecisionTable rows={dashboard.sections.recommendedActions.slice(0, 50)} emptyLabel="No decisions" />
        </div>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Top 25 Candidates" />
        <div className="mt-4">
          <DecisionTable rows={dashboard.sections.top25} emptyLabel="No candidates" />
        </div>
      </ExecutiveCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExecutiveCard>
          <SectionHeader title="High Confidence Decisions" />
          <div className="mt-4">
            <DecisionTable rows={dashboard.sections.highConfidence.slice(0, 15)} emptyLabel="None" />
          </div>
        </ExecutiveCard>
        <ExecutiveCard>
          <SectionHeader title="Manual Review" />
          <div className="mt-4">
            <DecisionTable rows={dashboard.sections.manualReview.slice(0, 15)} emptyLabel="None" />
          </div>
        </ExecutiveCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExecutiveCard>
          <SectionHeader title="Needs Recruiter" />
          <div className="mt-4">
            <DecisionTable rows={dashboard.sections.needsRecruiter.slice(0, 15)} emptyLabel="None" />
          </div>
        </ExecutiveCard>
        <ExecutiveCard>
          <SectionHeader title="Needs DM" />
          <div className="mt-4">
            <DecisionTable rows={dashboard.sections.needsDm.slice(0, 15)} emptyLabel="None" />
          </div>
        </ExecutiveCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExecutiveCard>
          <SectionHeader title="Needs Paperwork" />
          <div className="mt-4">
            <DecisionTable rows={dashboard.sections.needsPaperwork.slice(0, 15)} emptyLabel="None" />
          </div>
        </ExecutiveCard>
        <ExecutiveCard>
          <SectionHeader title="Ready For MEL" />
          <div className="mt-4">
            <DecisionTable rows={dashboard.sections.readyForMel.slice(0, 15)} emptyLabel="None" />
          </div>
        </ExecutiveCard>
      </div>

      <ExecutiveCard>
        <SectionHeader title="Blocked Candidates" />
        <div className="mt-4">
          <DecisionTable rows={dashboard.sections.blocked.slice(0, 20)} emptyLabel="No blocked candidates" />
        </div>
      </ExecutiveCard>
    </div>
  );
}
