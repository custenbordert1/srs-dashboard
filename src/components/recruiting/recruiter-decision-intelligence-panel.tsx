"use client";

import type { RecruiterDecisionIntelligenceSnapshot } from "@/lib/recruiting-decision-intelligence";

type RecruiterDecisionIntelligencePanelProps = {
  data: RecruiterDecisionIntelligenceSnapshot | null;
  loading?: boolean;
  compact?: boolean;
  onOpenVariant?: (draftId: string) => void;
};

const URGENCY_CLASS: Record<string, string> = {
  critical: "border-red-500/30 bg-red-500/5",
  high: "border-amber-500/30 bg-amber-500/5",
  medium: "border-zinc-700 bg-zinc-950/50",
  low: "border-zinc-800 bg-zinc-950/40",
};

export function RecruiterDecisionIntelligencePanel({
  data,
  loading = false,
  compact = false,
  onOpenVariant,
}: RecruiterDecisionIntelligencePanelProps) {
  if (loading && !data) {
    return (
      <section className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4 text-sm text-zinc-500">
        Loading recruiter decision intelligence…
      </section>
    );
  }
  if (!data) return null;

  const territory = data.territory;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-teal-500/25 bg-teal-500/5 p-4 sm:p-5">
        <header className="mb-3">
          <h3 className="text-base font-semibold text-zinc-50">Territory intelligence</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {territory.territoryLabel} · Staffing pressure {territory.staffingPressureScore}/100 ·
            Recommendations only (no automation)
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <IntelStat label="Best conversion" value={territory.bestConversionTerritory ?? "—"} />
          <IntelStat label="Highest risk" value={territory.highestRiskTerritory ?? "—"} />
          <IntelStat
            label="Top risk city"
            value={territory.topRiskCities[0]?.label ?? "—"}
          />
          <IntelStat
            label="Top opportunity"
            value={territory.topOpportunityCities[0]?.label ?? "—"}
          />
        </div>
        {!compact ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <MarketList title="Strongest markets" rows={territory.strongestMarkets} />
            <MarketList title="Weakest markets" rows={territory.weakestMarkets} />
            <MarketList title="Highest escalation zones" rows={territory.highestEscalationZones} />
            <MarketList title="Fastest growing" rows={territory.fastestGrowingMarkets} />
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-zinc-50">Suggested operational actions</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Rules-based, explainable cards — recruiter must act manually.
        </p>
        {data.recommendedNextActions.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No suggested actions for current filters.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.recommendedNextActions.slice(0, compact ? 6 : 12).map((action) => (
              <li
                key={action.id}
                className={`rounded-lg border px-3 py-2 text-sm ${URGENCY_CLASS[action.urgency] ?? URGENCY_CLASS.medium}`}
              >
                <p className="font-medium text-zinc-100">{action.title}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{action.reason}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-teal-400/80">
                  {action.type.replace(/-/g, " ")} · {action.impactEstimate}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!compact ? (
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
          <h3 className="text-base font-semibold text-zinc-50">Coverage recommendations</h3>
          <div className="mt-3 space-y-3">
            {data.coverageRecommendations.slice(0, 8).map((row) => (
              <article
                key={row.jobId}
                className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 text-sm"
              >
                <p className="font-medium text-zinc-100">
                  {row.jobTitle} · {row.city}, {row.state}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Risk {row.staffingRiskScore} · {row.nearbyActiveReps25Mi} reps ≤25mi ·{" "}
                  {row.pendingVariantsNearby} pending / {row.publishedVariantsNearby} published variants
                </p>
                <ul className="mt-2 list-inside list-disc text-xs text-zinc-400">
                  {row.summaryBullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-zinc-50">Variant performance</h3>
        <p className="mt-1 text-xs text-zinc-500">
          From cached applicants + local drafts — no additional Breezy scans.
        </p>
        {data.variantPerformance.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No variant drafts to analyze.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-500">
                  <th className="pb-2 pr-2">Variant</th>
                  <th className="pb-2 pr-2">City</th>
                  <th className="pb-2 pr-2">Status</th>
                  <th className="pb-2 pr-2">Applicants</th>
                  <th className="pb-2 pr-2">Interviews</th>
                  <th className="pb-2 pr-2">Hires</th>
                  <th className="pb-2 pr-2">Conv.</th>
                  <th className="pb-2">Marker</th>
                </tr>
              </thead>
              <tbody>
                {data.variantPerformance.slice(0, compact ? 8 : 20).map((row) => (
                  <tr key={row.draftId} className="border-b border-zinc-800/60 text-zinc-300">
                    <td className="py-2 pr-2">
                      #{row.variantIndex + 1} {row.title}
                      {onOpenVariant ? (
                        <button
                          type="button"
                          onClick={() => onOpenVariant(row.draftId)}
                          className="ml-2 rounded border border-zinc-700 px-1 py-0.5 text-[10px] text-zinc-400"
                        >
                          Open
                        </button>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2">
                      {row.cityTarget}, {row.state}
                    </td>
                    <td className="py-2 pr-2">{row.queueStatus}</td>
                    <td className="py-2 pr-2 tabular-nums">{row.applicants}</td>
                    <td className="py-2 pr-2 tabular-nums">{row.interviews}</td>
                    <td className="py-2 pr-2 tabular-nums">{row.hires}</td>
                    <td className="py-2 pr-2 tabular-nums">
                      {row.conversionPercent != null ? `${row.conversionPercent}%` : "—"}
                    </td>
                    <td className="py-2 text-zinc-400">
                      {row.marker ?? "—"}
                      {row.warning ? (
                        <span className="mt-0.5 block text-[10px] text-amber-300/80">{row.warning}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function IntelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-100">{value}</p>
    </div>
  );
}

function MarketList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; applicants7d: number; escalationCount: number }>;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-600">None</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs text-zinc-400">
          {rows.slice(0, 4).map((row) => (
            <li key={row.label}>
              {row.label} · {row.applicants7d} appl (7d)
              {row.escalationCount > 0 ? ` · ${row.escalationCount} escalations` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
