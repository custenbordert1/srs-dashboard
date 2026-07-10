"use client";

import {
  CardSkeleton,
  EmptyState,
  ExecutiveCard,
  ExecutiveButton,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import { useCandidateAdvancementIntelligence } from "@/hooks/use-candidate-advancement-intelligence";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import type { CandidateAdvancementEvaluation } from "@/lib/recruiting/candidate-advancement-engine";

function EvaluationRow({ evaluation }: { evaluation: CandidateAdvancementEvaluation }) {
  return (
    <tr className="border-b border-zinc-800/60">
      <td className="py-2 pr-3">
        <p className="font-medium text-zinc-100">{evaluation.candidateName}</p>
        <p className="text-xs text-zinc-500">{evaluation.positionName}</p>
      </td>
      <td className="py-2 pr-3 tabular-nums text-zinc-200">{evaluation.advancementScore}</td>
      <td className="py-2 pr-3 tabular-nums text-zinc-200">{evaluation.estimatedHireProbability}%</td>
      <td className="py-2 pr-3 tabular-nums text-zinc-200">{evaluation.confidence}%</td>
      <td className="py-2 pr-3 text-zinc-200">{evaluation.nextAction}</td>
      <td className="py-2 pr-3 text-xs text-zinc-400">{evaluation.blockers.join(", ") || "—"}</td>
      <td className="py-2 text-center">
        {evaluation.automationEligible ? (
          <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs text-teal-100 ring-1 ring-teal-500/30">
            Ready
          </span>
        ) : (
          <span className="text-xs text-zinc-500">—</span>
        )}
      </td>
    </tr>
  );
}

export function CandidateAdvancementIntelligencePanel() {
  const { data, loading, error, showingCachedSnapshot, meta, refresh, refreshing } =
    useCandidateAdvancementIntelligence();
  const loadingCeilingHit = useLoadingCeiling(loading && !data, EXECUTIVE_PANEL_LOADING_CEILING_MS);
  const showLoading = loading && !data && !loadingCeilingHit;

  const topCandidates = data?.evaluations
    .slice()
    .sort((a, b) => b.advancementScore - a.advancementScore)
    .slice(0, 25);

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Candidate advancement intelligence"
        subtitle="P144 — read-only recruiter-style evaluation for every applicant (no Breezy writes)."
        actions={
          <ExecutiveButton onClick={() => refresh()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </ExecutiveButton>
        }
      />

      {showingCachedSnapshot || meta?.partialSync ? (
        <p className="mt-2 text-xs text-amber-200/90">
          {showingCachedSnapshot
            ? "Showing cached advancement intelligence."
            : "Partial data — some sources unavailable; evaluations use best available cache."}
        </p>
      ) : null}

      {showLoading ? (
        <div className="mt-6">
          <CardSkeleton lines={5} />
        </div>
      ) : null}

      {(error || loadingCeilingHit) && !data ? (
        <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-4 py-4 text-sm text-zinc-300">
          <p className="font-medium text-zinc-100">Advancement intelligence unavailable</p>
          <p className="mt-1 text-zinc-500">{error ?? "Loading timed out."}</p>
          <ExecutiveButton onClick={() => refresh()}>Retry</ExecutiveButton>
        </div>
      ) : null}

      {data ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Automation candidates today"
              value={data.executive.automationCandidatesToday.toLocaleString()}
            />
            <MetricCard label="Ready to advance" value={data.executive.readyToAdvance.toLocaleString()} />
            <MetricCard label="Manual review queue" value={data.executive.manualReviewQueue.toLocaleString()} />
            <MetricCard
              label="Avg advancement score"
              value={`${data.executive.averageAdvancementScore}/100`}
            />
            <MetricCard
              label="Highest probability hires"
              value={data.executive.highestProbabilityHires.toLocaleString()}
            />
            <MetricCard
              label="Highest risk candidates"
              value={data.executive.highestRiskCandidates.toLocaleString()}
            />
            <MetricCard
              label="Avg hire probability"
              value={`${data.executive.averageHireProbability}%`}
            />
            <MetricCard
              label="Pipeline health"
              value={`${data.executive.pipelineHealthScore}/100`}
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-300">Top candidates by advancement score</h3>
            {topCandidates && topCandidates.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                      <th className="pb-2 pr-3">Candidate</th>
                      <th className="pb-2 pr-3">Score</th>
                      <th className="pb-2 pr-3">Hire %</th>
                      <th className="pb-2 pr-3">Confidence</th>
                      <th className="pb-2 pr-3">Next action</th>
                      <th className="pb-2 pr-3">Blockers</th>
                      <th className="pb-2">Automation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCandidates.map((evaluation) => (
                      <EvaluationRow key={evaluation.candidateId} evaluation={evaluation} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No candidates evaluated"
                description="Candidate cache is empty or still warming."
              />
            )}
          </div>
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
