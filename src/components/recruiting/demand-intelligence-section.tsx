"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
import {
  computeDemandIntelligence,
  formatDeadlineDays,
  URGENCY_BADGE_STYLES,
  type DemandIntelligenceSnapshot,
  type DemandRecommendation,
} from "@/lib/demand-intelligence";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import { useMemo, type ReactNode } from "react";
import { IntelligenceBarChart } from "./intelligence-bar-chart";
import { IntelligenceDualChart } from "./intelligence-dual-chart";

type DemandIntelligenceSectionProps = {
  recruiting: SheetDataResult;
  mel: MelProjectsDataResult;
};

function RecommendationTags({ items }: { items: DemandRecommendation[] }) {
  if (items.length === 0) {
    return <span className="text-zinc-500">—</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-md border border-zinc-700/80 bg-zinc-950/60 px-2 py-0.5 text-[11px] text-zinc-300"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function SectionTable({
  title,
  description,
  headingId,
  children,
}: {
  title: string;
  description: string;
  headingId: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
        <h2 id={headingId} className="text-lg font-semibold tracking-tight text-zinc-50">
          {title}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export function DemandIntelligenceSection({ recruiting, mel }: DemandIntelligenceSectionProps) {
  const snapshot = useMemo((): DemandIntelligenceSnapshot | null => {
    if (!recruiting.ok || !mel.ok) return null;
    return computeDemandIntelligence(recruiting.rows, recruiting.headers, mel.rows, mel.headers);
  }, [recruiting, mel]);

  if (!recruiting.ok || !mel.ok) {
    const errors = [
      !recruiting.ok ? `Recruiting: ${recruiting.error}` : null,
      !mel.ok ? `MEL: ${mel.error}` : null,
    ].filter(Boolean);

    return (
      <section className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Demand intelligence</h2>
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          {errors.join(" · ")}
        </div>
      </section>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="space-y-6 border-t border-zinc-800/80 pt-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Demand intelligence</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          MEL project demand joined with recruiting opens by state — demand scores, staffing risk,
          and action recommendations.
        </p>
        <p className="mt-2 text-xs text-zinc-600">{snapshot.columnHint}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <IntelligenceDualChart
          title="Store calls vs applicants"
          subtitle="Top markets by demand score"
          data={snapshot.storeCallsVsApplicants}
          primaryLabel="Open store calls"
          secondaryLabel="Applicants"
          primaryClassName="bg-violet-500/80"
          secondaryClassName="bg-sky-500/80"
        />
        <IntelligenceDualChart
          title="Active reps vs open calls"
          subtitle="Staffing coverage by market"
          data={snapshot.activeRepsVsOpenCalls}
          primaryLabel="Active reps"
          secondaryLabel="Open store calls"
          primaryClassName="bg-teal-500/80"
          secondaryClassName="bg-violet-500/60"
        />
        <IntelligenceBarChart
          title="Completion % by project"
          subtitle="Projects with highest staffing risk"
          data={snapshot.completionByProject}
          valueLabel="%"
          barClassName="bg-amber-500/80"
        />
      </div>

      <SectionTable
        title="Markets needing recruiting support"
        description="State-level demand score from MEL workload and recruiting pipeline"
        headingId="markets-demand-heading"
      >
        {snapshot.markets.length === 0 ? (
          <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No joined market data.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium sm:px-5">Market</th>
                <th className="px-4 py-3 font-medium sm:px-5">Score</th>
                <th className="px-4 py-3 font-medium sm:px-5">Urgency</th>
                <th className="hidden px-4 py-3 font-medium text-right md:table-cell sm:px-5">
                  Open calls
                </th>
                <th className="hidden px-4 py-3 font-medium text-right lg:table-cell sm:px-5">
                  Reps
                </th>
                <th className="hidden px-4 py-3 font-medium text-right lg:table-cell sm:px-5">
                  Done %
                </th>
                <th className="hidden px-4 py-3 font-medium text-right xl:table-cell sm:px-5">
                  Deadline
                </th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Apps</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Open posts</th>
                <th className="min-w-[12rem] px-4 py-3 font-medium sm:px-5">Recommendations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {snapshot.markets.map((row) => (
                <tr key={row.stateCode} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.market}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-teal-300 sm:px-5">
                    {row.demandScore}
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        URGENCY_BADGE_STYLES[row.urgency],
                      ].join(" ")}
                    >
                      {row.urgency}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell sm:px-5">
                    {row.openStoreCalls}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell sm:px-5">
                    {row.activeReps}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell sm:px-5">
                    {row.completionPercent === null ? "—" : `${row.completionPercent}%`}
                  </td>
                  <td className="hidden px-4 py-3 text-right text-zinc-400 xl:table-cell sm:px-5">
                    {formatDeadlineDays(row.nearestDeadlineDays)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums sm:px-5">{row.applicants}</td>
                  <td className="px-4 py-3 text-right tabular-nums sm:px-5">{row.openPositions}</td>
                  <td className="px-4 py-3 sm:px-5">
                    <RecommendationTags items={row.recommendations} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionTable>

      <SectionTable
        title="Projects at staffing risk"
        description="MEL projects with open store calls and low completion or coverage"
        headingId="projects-risk-heading"
      >
        {snapshot.projectsAtRisk.length === 0 ? (
          <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No projects at risk.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium sm:px-5">Project</th>
                <th className="px-4 py-3 font-medium sm:px-5">Risk</th>
                <th className="px-4 py-3 font-medium sm:px-5">Urgency</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell sm:px-5">DM</th>
                <th className="px-4 py-3 font-medium sm:px-5">State</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Open calls</th>
                <th className="hidden px-4 py-3 font-medium text-right lg:table-cell sm:px-5">
                  Reps
                </th>
                <th className="hidden px-4 py-3 font-medium text-right lg:table-cell sm:px-5">
                  Done %
                </th>
                <th className="min-w-[12rem] px-4 py-3 font-medium sm:px-5">Recommendations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {snapshot.projectsAtRisk.map((row) => (
                <tr key={row.projectNo} className="hover:bg-zinc-800/30">
                  <td className="max-w-[10rem] px-4 py-3 sm:max-w-xs sm:px-5">
                    <p className="font-medium text-zinc-100">{row.projectNo}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{row.projectName}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-teal-300 sm:px-5">
                    {row.riskScore}
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        URGENCY_BADGE_STYLES[row.urgency],
                      ].join(" ")}
                    >
                      {row.urgency}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-400 md:table-cell sm:px-5">{row.manager}</td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.state}</td>
                  <td className="px-4 py-3 text-right tabular-nums sm:px-5">{row.openStoreCalls}</td>
                  <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell sm:px-5">
                    {row.activeReps}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell sm:px-5">
                    {row.completionPercent === null ? "—" : `${row.completionPercent}%`}
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <RecommendationTags items={row.recommendations} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionTable>

      <SectionTable
        title="DMs with largest staffing gaps"
        description="Open store calls minus active reps, with recruiting volume in DM territories"
        headingId="dm-gaps-heading"
      >
        {snapshot.dmGaps.length === 0 ? (
          <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No DM staffing data.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium sm:px-5">DM</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Gap</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Open calls</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Reps</th>
                <th className="hidden px-4 py-3 font-medium text-right md:table-cell sm:px-5">
                  Open posts
                </th>
                <th className="hidden px-4 py-3 font-medium text-right md:table-cell sm:px-5">
                  Apps
                </th>
                <th className="hidden px-4 py-3 font-medium text-right lg:table-cell sm:px-5">
                  Done %
                </th>
                <th className="min-w-[12rem] px-4 py-3 font-medium sm:px-5">Recommendations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {snapshot.dmGaps.map((row) => (
                <tr key={row.manager} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.manager}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-300 sm:px-5">
                    {row.staffingGap}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums sm:px-5">{row.openStoreCalls}</td>
                  <td className="px-4 py-3 text-right tabular-nums sm:px-5">{row.activeReps}</td>
                  <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell sm:px-5">
                    {row.openPositions}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell sm:px-5">
                    {row.applicants}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell sm:px-5">
                    {row.completionPercent === null ? "—" : `${row.completionPercent}%`}
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <RecommendationTags items={row.recommendations} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionTable>
    </div>
  );
}
