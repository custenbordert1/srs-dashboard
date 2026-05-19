"use client";

import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import { useRecruitingIntelligence } from "@/hooks/use-recruiting-intelligence";
import type { JobCandidateRanking, SuggestedAction, SmartTerritoryAlert } from "@/lib/recruiting-automation";

type RecruitingAutomationSectionProps = {
  compact?: boolean;
};

function actionTypeLabel(type: SuggestedAction["type"]): string {
  const labels: Record<SuggestedAction["type"], string> = {
    "increase-pay": "Increase pay",
    "repost-ad": "Repost ad",
    "expand-radius": "Expand radius",
    "add-nearby-cities": "Add nearby cities",
    "prioritize-follow-up": "Recruiter follow-up",
    "alternate-candidate-pools": "Alternate pools",
  };
  return labels[type];
}

function AlertList({ alerts, empty }: { alerts: SmartTerritoryAlert[]; empty: string }) {
  if (alerts.length === 0) return <p className="text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className={`rounded-lg border px-3 py-2 text-sm ${
            alert.severity === "critical"
              ? "border-red-500/30 bg-red-500/10 text-red-100"
              : "border-amber-500/30 bg-amber-500/10 text-amber-100"
          }`}
        >
          <p className="font-medium">{alert.title}</p>
          <p className="mt-0.5 text-xs opacity-90">{alert.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function JobRankingsTable({ rankings, maxJobs }: { rankings: JobCandidateRanking[]; maxJobs: number }) {
  if (rankings.length === 0) {
    return <p className="text-sm text-zinc-500">No job rankings available.</p>;
  }
  return (
    <div className="space-y-4">
      {rankings.slice(0, maxJobs).map((job) => (
        <article key={job.jobId} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
          <div>
            <p className="font-medium text-zinc-100">{job.jobName}</p>
            <p className="text-xs text-zinc-500">
              {job.city}, {job.state} · {job.applicantCount} applicants
            </p>
          </div>
          {job.topCandidates.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-600">No ranked candidates yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {job.topCandidates.map((row, index) => (
                <li
                  key={row.candidateId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-900/60 px-2 py-1.5 text-xs"
                >
                  <span className="text-zinc-300">
                    #{index + 1} {row.name}
                  </span>
                  <span className="tabular-nums text-teal-300">
                    {row.numericScore} · {row.tierLabel}
                  </span>
                  <span className="w-full text-zinc-500">{row.highlights.join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

export function RecruitingAutomationSection({ compact = false }: RecruitingAutomationSectionProps) {
  const { data, meta, error, loading, refreshing, refresh } = useRecruitingIntelligence();

  if (loading && !data) {
    return <p className="text-sm text-zinc-500">Loading AI recommendations and automation insights…</p>;
  }

  if (error && !data) {
    return (
      <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
        {error}
      </p>
    );
  }

  if (!data) return null;

  const alertLimit = compact ? 8 : 15;
  const actionLimit = compact ? 8 : 15;
  const jobLimit = compact ? 6 : 12;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">AI recruiting automation</h2>
          <p className="text-sm text-zinc-500">
            Territory: {data.territoryLabel}
            {refreshing ? <span className="ml-2 text-teal-400/90">Updating…</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      {meta?.partialSync ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Partial Breezy sync — rankings may update as more positions load.
        </p>
      ) : null}

      {!compact ? (
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
          <h3 className="text-base font-semibold text-zinc-50">Daily executive snapshot</h3>
          <ul className="mt-3 space-y-1.5 text-sm text-zinc-400">
            {data.dailySnapshot.summaryBullets.map((bullet) => (
              <li key={bullet}>• {bullet}</li>
            ))}
          </ul>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <IntelligenceBarChart
              title="Hottest territories"
              data={data.dailySnapshot.hottestTerritories}
              barClassName="bg-teal-500/80"
            />
            <IntelligenceBarChart
              title="Highest risk territories"
              data={data.dailySnapshot.highestRiskTerritories}
              barClassName="bg-red-500/70"
            />
            <IntelligenceBarChart
              title="Best recruiting sources"
              data={data.dailySnapshot.bestRecruitingSources}
              barClassName="bg-violet-500/80"
            />
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
          <h3 className="text-base font-semibold text-zinc-50">Smart territory alerts</h3>
          <p className="mt-1 text-xs text-zinc-500">48h gaps, conversion, aging, dropoff, response time</p>
          <div className="mt-3">
            <AlertList
              alerts={data.smartAlerts.slice(0, alertLimit)}
              empty="No smart alerts for this territory."
            />
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
          <h3 className="text-base font-semibold text-zinc-50">Auto suggested actions</h3>
          <p className="mt-1 text-xs text-zinc-500">Pay, repost, radius, cities, follow-up, pools</p>
          <ul className="mt-3 space-y-2">
            {data.suggestedActions.slice(0, actionLimit).map((action) => (
              <li
                key={action.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm"
              >
                <p className="font-medium text-zinc-200">
                  {action.title}{" "}
                  <span className="text-xs font-normal text-zinc-500">
                    · {actionTypeLabel(action.type)}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{action.detail}</p>
              </li>
            ))}
            {data.suggestedActions.length === 0 ? (
              <li className="text-sm text-zinc-500">No actions suggested right now.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-zinc-50">AI candidate ranking by job</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Merchandising, resume keywords, proximity, responsiveness, interview stage, retail/reset
        </p>
        <div className="mt-4">
          <JobRankingsTable rankings={data.jobRankings} maxJobs={jobLimit} />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-zinc-50">Recruiter productivity</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Recruiter</th>
                <th className="pb-2 pr-3">Reviewed</th>
                <th className="pb-2 pr-3">Interviews</th>
                <th className="pb-2 pr-3">Hires</th>
                <th className="pb-2 pr-3">Response</th>
                <th className="pb-2">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {data.productivity.slice(0, compact ? 6 : 12).map((row) => (
                <tr key={row.recruiter} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.recruiter}</td>
                  <td className="py-2 pr-3 text-zinc-400">{row.candidatesReviewed}</td>
                  <td className="py-2 pr-3 text-zinc-400">{row.interviewsScheduled}</td>
                  <td className="py-2 pr-3 text-zinc-400">{row.hires}</td>
                  <td className="py-2 pr-3 text-zinc-400">{row.responseSpeedLabel}</td>
                  <td className="py-2 text-zinc-400">
                    {row.conversionPercent != null ? `${row.conversionPercent}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <IntelligenceBarChart
          title="Applicants per day"
          subtitle="Last 14 days"
          data={data.trends.applicantsPerDay}
          barClassName="bg-sky-500/80"
        />
        <IntelligenceBarChart
          title="Hires per week"
          subtitle="Rolling 8 weeks"
          data={data.trends.hiresPerWeek}
          barClassName="bg-emerald-500/80"
        />
        <IntelligenceBarChart
          title="Source conversion"
          subtitle="Hire rate % by source"
          data={data.trends.sourceConversion}
          valueLabel="%"
          barClassName="bg-violet-500/80"
        />
        <IntelligenceBarChart
          title="Territory fill velocity"
          subtitle="Hires per open job % by DM"
          data={data.trends.territoryFillVelocity}
          valueLabel="%"
          barClassName="bg-teal-500/80"
        />
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-zinc-50">Automation hooks (integration prep)</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.automationHooks.map((hook) => (
            <div
              key={hook.id}
              className={`rounded-lg border px-3 py-2 text-xs ${
                hook.status === "ready"
                  ? "border-teal-500/30 bg-teal-500/5 text-teal-200"
                  : "border-zinc-700 bg-zinc-950/40 text-zinc-400"
              }`}
            >
              <p className="font-medium">{hook.label}</p>
              <p className="mt-0.5 text-zinc-500">{hook.description}</p>
              <p className="mt-1 uppercase tracking-wide text-[10px] text-zinc-600">{hook.status}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
