"use client";

import { usePlacementCommandCenter } from "@/hooks/use-placement-command-center";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";

function KpiCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
      {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
    </div>
  );
}

function statusBadge(status: string) {
  if (status === "ready-to-place") return "text-emerald-300 bg-emerald-500/10 border-emerald-500/30";
  if (status === "needs-action") return "text-amber-200 bg-amber-500/10 border-amber-500/30";
  return "text-zinc-400 bg-zinc-800/40 border-zinc-700/60";
}

export function PlacementCommandCenterPanel() {
  const {
    data,
    loading,
    error,
    showingCachedSnapshot,
    refreshing,
    refresh,
    planPlacementCorrelations,
    approvePlacement,
    rejectPlacement,
    needsReviewPlacement,
    executePlacement,
  } = usePlacementCommandCenter();
  const loadingCeilingHit = useLoadingCeiling(loading && !data, EXECUTIVE_PANEL_LOADING_CEILING_MS);
  const showLoading = loading && !data && !loadingCeilingHit;

  if (showLoading) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <div className="h-8 w-64 animate-pulse rounded bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p>{error}</p>
        <button type="button" onClick={() => refresh()} className="mt-2 rounded-lg border border-amber-400/40 px-3 py-1 text-xs">
          Retry
        </button>
      </section>
    );
  }

  if (!data) return null;

  const {
    kpis,
    funnel,
    readyForPlacement,
    paperworkBottlenecks,
    coverageGaps,
    placementQueue,
    autoPlacementOpportunities,
    timeToFill,
    placementExecutionRecommendations,
    placementOutcomes,
  } = data;

  return (
    <section className="space-y-6">
      {showingCachedSnapshot ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Showing last loaded placement snapshot.
          {error ? ` ${error}` : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Autonomous Hiring & Placement</h2>
          <p className="text-sm text-zinc-500">
            Hiring readiness, placement intelligence, and coverage coordination — orchestrated over P56–P59 systems.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800/60"
        >
          Refresh
        </button>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void planPlacementCorrelations()}
          className="rounded-lg border border-emerald-600/50 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          Plan placement correlations
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label="Recommended placements" value={kpis.recommendedPlacements} />
        <KpiCard label="Approved placements" value={kpis.approvedPlacements} />
        <KpiCard
          label="Placement success rate"
          value={kpis.placementSuccessRate !== null ? `${kpis.placementSuccessRate}%` : "—"}
        />
        <KpiCard label="Coverage gaps filled" value={kpis.coverageGapsFilled} />
        <KpiCard
          label="Placement ROI"
          value={kpis.placementRoi !== null ? kpis.placementRoi : "—"}
          detail="Indexed from completed placements"
        />
        <KpiCard label="Ready for placement" value={kpis.readyForPlacement} />
        <KpiCard label="Needs action" value={kpis.needsAction} />
        <KpiCard label="Paperwork bottlenecks" value={paperworkBottlenecks.length} />
        <KpiCard label="Coverage gaps" value={kpis.openCoverageGaps} />
        <KpiCard label="Auto placement opportunities" value={kpis.autoPlacementCount} />
        <KpiCard
          label="Avg time to fill"
          value={kpis.avgTimeToFillDays ?? "—"}
          detail={kpis.avgTimeToFillDays ? "days (territory weighted)" : "Insufficient history"}
        />
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Hiring workflow funnel</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {funnel.map((stage) => (
            <div key={stage.id} className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">{stage.label}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">{stage.count}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Candidates ready for placement</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {readyForPlacement.slice(0, 8).map((row) => (
              <li key={row.candidateId} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/60 px-3 py-2">
                <span className="text-zinc-200">{row.candidateName}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusBadge(row.status)}`}>
                  {row.grade} · {row.candidateScore}
                </span>
              </li>
            ))}
            {readyForPlacement.length === 0 ? (
              <li className="text-zinc-500">No candidates are ready for placement yet.</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Paperwork bottlenecks</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {paperworkBottlenecks.slice(0, 8).map((row) => (
              <li key={row.candidateId} className="rounded-lg border border-zinc-800/60 px-3 py-2">
                <p className="font-medium text-zinc-200">{row.candidateName}</p>
                <p className="text-xs text-zinc-500">{row.blocker}</p>
              </li>
            ))}
            {paperworkBottlenecks.length === 0 ? (
              <li className="text-zinc-500">No active paperwork bottlenecks.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Coverage gaps waiting for candidates</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {coverageGaps.slice(0, 8).map((row) => (
              <li key={row.territoryKey} className="rounded-lg border border-zinc-800/60 px-3 py-2">
                <p className="font-medium text-zinc-200">{row.territoryLabel}</p>
                <p className="text-xs text-zinc-500">
                  {row.openCalls} open calls · {row.readyCandidates} ready · {row.coverageStatus}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Auto placement opportunities</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {autoPlacementOpportunities.slice(0, 8).map((row) => (
              <li key={row.candidateId} className="rounded-lg border border-zinc-800/60 px-3 py-2">
                <p className="font-medium text-zinc-200">{row.candidateName}</p>
                <p className="text-xs text-zinc-500">
                  {row.recommendedProject} · score {row.placementScore} · {row.coverageUrgency}
                </p>
              </li>
            ))}
            {autoPlacementOpportunities.length === 0 ? (
              <li className="text-zinc-500">No high-confidence auto placement matches right now.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">P61 placement recommendations</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {placementExecutionRecommendations.slice(0, 8).map((row) => (
            <li key={row.recommendationId} className="rounded-lg border border-zinc-800/60 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-zinc-200">{row.candidateName}</p>
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
                  {row.matchLabel}
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                {row.recommendedProject} · confidence {row.fitScores.placementConfidence}%
              </p>
            </li>
          ))}
          {placementExecutionRecommendations.length === 0 ? (
            <li className="text-zinc-500">No placement execution recommendations yet.</li>
          ) : null}
        </ul>
        {placementOutcomes.recommendationAccuracy !== null ? (
          <p className="mt-3 text-xs text-zinc-500">
            Recommendation accuracy: {placementOutcomes.recommendationAccuracy}% · Time-to-fill improvement:{" "}
            {placementOutcomes.timeToFillImprovementDays ?? "—"} days
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Placement queue</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-1">Candidate</th>
                <th className="px-2 py-1">Match</th>
                <th className="px-2 py-1">Readiness</th>
                <th className="px-2 py-1">Score</th>
                <th className="px-2 py-1">Project</th>
                <th className="px-2 py-1">Execution</th>
                <th className="px-2 py-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {placementQueue.slice(0, 12).map((row) => (
                <tr key={row.candidateId} className="border-t border-zinc-800/60">
                  <td className="px-2 py-2 text-zinc-200">{row.candidateName}</td>
                  <td className="px-2 py-2 text-zinc-400">{row.matchLabel ?? "—"}</td>
                  <td className="px-2 py-2 text-zinc-400">{row.readinessStatus}</td>
                  <td className="px-2 py-2 text-zinc-300">{row.placementScore}</td>
                  <td className="px-2 py-2 text-zinc-400">{row.recommendedProject ?? "—"}</td>
                  <td className="px-2 py-2 text-zinc-500">{row.correlationStatus ?? "—"}</td>
                  <td className="px-2 py-2">
                    {row.correlationId ? (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={refreshing || row.approvalStatus === "approved"}
                          onClick={() => void approvePlacement(row.correlationId!)}
                          className="rounded border border-emerald-600/40 px-2 py-0.5 text-[11px] text-emerald-200 disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={refreshing}
                          onClick={() => void rejectPlacement(row.correlationId!)}
                          className="rounded border border-red-600/40 px-2 py-0.5 text-[11px] text-red-200 disabled:opacity-40"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={refreshing}
                          onClick={() => void needsReviewPlacement(row.correlationId!)}
                          className="rounded border border-amber-600/40 px-2 py-0.5 text-[11px] text-amber-200 disabled:opacity-40"
                        >
                          Needs review
                        </button>
                        {row.approvalStatus === "approved" ? (
                          <button
                            type="button"
                            disabled={refreshing}
                            onClick={() => void executePlacement(row.correlationId!)}
                            className="rounded border border-sky-600/40 px-2 py-0.5 text-[11px] text-sky-200 disabled:opacity-40"
                          >
                            Execute
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Time to fill by territory</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {timeToFill
            .filter((row) => row.timeToFillDays !== null || row.readyForPlacement > 0)
            .slice(0, 9)
            .map((row) => (
              <li key={row.territoryKey} className="rounded-lg border border-zinc-800/60 px-3 py-2 text-sm">
                <p className="font-medium text-zinc-200">{row.territoryLabel}</p>
                <p className="text-xs text-zinc-500">
                  {row.timeToFillDays ?? "—"} days · {row.applicants}/{row.targetApplicants} applicants · {row.readyForPlacement} ready
                </p>
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}
