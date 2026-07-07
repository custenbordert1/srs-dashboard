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
import type { P156PrioritizedCandidate } from "@/lib/p156-candidate-prioritization/types";
import { useRecruitingPriorities } from "@/hooks/use-recruiting-priorities";

function priorityTone(level: string): "success" | "warning" | "neutral" | "critical" {
  if (level === "critical") return "critical";
  if (level === "high") return "warning";
  if (level === "medium") return "neutral";
  return "success";
}

function CandidateTable({ rows, emptyLabel }: { rows: P156PrioritizedCandidate[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2">Score</th>
            <th className="px-3 py-2">Candidate</th>
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2">Recruiter</th>
            <th className="px-3 py-2">DM</th>
            <th className="px-3 py-2">Days</th>
            <th className="px-3 py-2">Project</th>
            <th className="px-3 py-2">Territory</th>
            <th className="px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.candidateId} className="border-b border-white/5 align-top">
              <td className="px-3 py-3">
                <StatusBadge tone={priorityTone(row.priorityLevel)}>{String(row.priorityScore)}</StatusBadge>
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
              <td className="px-3 py-3 text-slate-300">{row.recruiter}</td>
              <td className="px-3 py-3 text-slate-300">{row.dm}</td>
              <td className="px-3 py-3 text-slate-300">{row.daysInPipeline ?? "—"}</td>
              <td className="px-3 py-3 text-slate-300">{row.project ?? "—"}</td>
              <td className="px-3 py-3 text-slate-300">{row.territory}</td>
              <td className="max-w-xs px-3 py-3 text-slate-200">{row.recommendedNextAction}</td>
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

export function RecruitingPrioritiesPanel() {
  const {
    queue,
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
  } = useRecruitingPriorities();

  if (loading) {
    return <ExecutivePanelLoading title="Recruiting Priorities" badge="P156" />;
  }

  if (loadingCeilingHit && !queue) {
    return (
      <ExecutivePanelError
        title="Recruiting Priorities"
        message="Queue request timed out — retry shortly."
        onRetry={() => void refresh()}
      />
    );
  }

  if (!queue) {
    return (
      <ExecutivePanelError
        title="Recruiting Priorities"
        message={error ?? "Failed to load prioritized queue"}
        onRetry={() => void refresh()}
      />
    );
  }

  const bannerWarnings = [...warnings];
  if (error) bannerWarnings.push(error);

  return (
    <div className="space-y-6">
      {(showingCachedSnapshot || bannerWarnings.length > 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {showingCachedSnapshot ? (
            <p className="font-medium">Showing last successful queue snapshot.</p>
          ) : null}
          {bannerWarnings.length > 0 ? <ExecutiveWarningList warnings={bannerWarnings} /> : null}
        </div>
      )}

      <ExecutiveCard variant="premium">
        <SectionHeader
          title="Intelligent Candidate Prioritization"
          subtitle="P156 — read-only scoring; ranks candidates by business impact"
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
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Scored candidates" value={queue.candidates.length} />
          <MetricCard label="Critical / high" value={queue.candidates.filter((c) => c.priorityLevel === "critical" || c.priorityLevel === "high").length} />
          <MetricCard label="Ready for paperwork" value={queue.sections.readyForPaperwork.length} />
          <MetricCard label="Awaiting recruiter" value={queue.sections.awaitingRecruiter.length} />
        </div>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Filters" subtitle="Narrow the prioritized queue" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <FilterSelect
            label="Recruiter"
            value={filters.recruiter ?? ""}
            options={queue.filterOptions.recruiters}
            onChange={(v) => updateFilter("recruiter", v || null)}
          />
          <FilterSelect
            label="DM"
            value={filters.dm ?? ""}
            options={queue.filterOptions.dms}
            onChange={(v) => updateFilter("dm", v || null)}
          />
          <FilterSelect
            label="State"
            value={filters.state ?? ""}
            options={queue.filterOptions.states}
            onChange={(v) => updateFilter("state", v || null)}
          />
          <FilterSelect
            label="Project"
            value={filters.project ?? ""}
            options={queue.filterOptions.projects}
            onChange={(v) => updateFilter("project", v || null)}
          />
          <FilterSelect
            label="Stage"
            value={filters.stage ?? ""}
            options={queue.filterOptions.stages}
            onChange={(v) => updateFilter("stage", v || null)}
          />
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Priority min
            <input
              type="number"
              min={0}
              max={100}
              className="rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 text-sm text-white"
              value={filters.priorityMin ?? ""}
              onChange={(e) =>
                updateFilter(
                  "priorityMin",
                  e.target.value ? Number.parseInt(e.target.value, 10) : null,
                )
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Priority max
            <input
              type="number"
              min={0}
              max={100}
              className="rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 text-sm text-white"
              value={filters.priorityMax ?? ""}
              onChange={(e) =>
                updateFilter(
                  "priorityMax",
                  e.target.value ? Number.parseInt(e.target.value, 10) : null,
                )
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
        <SectionHeader title="Top Priority Candidates" />
        <div className="mt-4">
          <CandidateTable rows={queue.sections.topPriority} emptyLabel="No prioritized candidates" />
        </div>
      </ExecutiveCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExecutiveCard>
          <SectionHeader title="Highest Risk Positions" />
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {queue.sections.highestRiskPositions.length === 0 ? (
              <li>No high-risk positions detected</li>
            ) : (
              queue.sections.highestRiskPositions.map((pos) => (
                <li key={pos.positionId} className="rounded-lg border border-white/5 px-3 py-2">
                  <div className="font-medium text-white">{pos.positionName}</div>
                  <div className="text-xs text-slate-400">
                    {pos.urgency} · {pos.openDemand} open demand · top score {pos.topCandidateScore}
                  </div>
                </li>
              ))
            )}
          </ul>
        </ExecutiveCard>

        <ExecutiveCard>
          <SectionHeader title="Highest Demand Markets" />
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {queue.sections.highestDemandMarkets.map((market) => (
              <li key={`${market.dmName}-${market.territory}`} className="rounded-lg border border-white/5 px-3 py-2">
                <div className="font-medium text-white">{market.territory}</div>
                <div className="text-xs text-slate-400">
                  {market.dmName} · {market.openCalls} open calls · {market.coverageStatus}
                </div>
              </li>
            ))}
          </ul>
        </ExecutiveCard>
      </div>

      <ExecutiveCard>
        <SectionHeader title="Candidates Ready for Paperwork" />
        <div className="mt-4">
          <CandidateTable rows={queue.sections.readyForPaperwork} emptyLabel="None ready for paperwork" />
        </div>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Candidates Awaiting Recruiter" />
        <div className="mt-4">
          <CandidateTable rows={queue.sections.awaitingRecruiter} emptyLabel="All candidates have recruiters" />
        </div>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Candidates Awaiting Follow-up" />
        <div className="mt-4">
          <CandidateTable rows={queue.sections.awaitingFollowUp} emptyLabel="No follow-ups pending" />
        </div>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Candidates Ready for MEL" />
        <div className="mt-4">
          <CandidateTable rows={queue.sections.readyForMel} emptyLabel="None ready for MEL" />
        </div>
      </ExecutiveCard>
    </div>
  );
}
