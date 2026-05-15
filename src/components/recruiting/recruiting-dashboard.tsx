import {
  dmLeaderboard,
  newHireMetrics,
  openJobs,
  pipelineStages,
  weeklyTrends,
} from "@/lib/recruiting-sample-data";
import { RecruitingDashboardContent } from "./recruiting-dashboard-content";

export function RecruitingDashboard() {
  return (
    <div className="min-h-screen bg-zinc-950 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgb(39_39_42_/_0.55),transparent_55%),radial-gradient(900px_500px_at_100%_0%,rgb(20_83_45_/_0.18),transparent_50%)] text-zinc-50">
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-zinc-100 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-zinc-900"
      >
        Skip to dashboard content
      </a>

      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300/90">
              SRS · Recruiting operations
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Command center
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
              Use the tabs to switch between overview KPIs, needs attention, DM scorecards, the live
              sheet, and automation. Live sections pull from your Google Sheet export.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-zinc-700/80 bg-zinc-900/60 px-3 py-1 text-xs font-medium text-zinc-300">
              FY26 Q1
            </span>
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
              Live sheet (client)
            </span>
            <span className="rounded-full border border-zinc-700/80 bg-zinc-900/60 px-3 py-1 text-xs font-medium text-zinc-300">
              Sample charts
            </span>
          </div>
        </div>
      </header>

      <RecruitingDashboardContent
        openJobs={openJobs}
        weeklyTrends={weeklyTrends}
        pipelineStages={pipelineStages}
        newHireMetrics={newHireMetrics}
        dmLeaderboard={dmLeaderboard}
      />

      <footer className="border-t border-zinc-800/80 py-8 text-center text-xs text-zinc-600">
        SRS recruiting dashboard · KPIs + live sections from Google Sheet CSV · sample charts on
        Overview
      </footer>
    </div>
  );
}
