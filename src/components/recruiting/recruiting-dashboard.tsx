import { AppShell } from "@/components/auth/app-shell";
import type { UserPublic } from "@/lib/auth/types";
import {
  dmLeaderboard,
  newHireMetrics,
  openJobs,
  pipelineStages,
  weeklyTrends,
} from "@/lib/recruiting-sample-data";
import { RecruitingDashboardContent } from "./recruiting-dashboard-content";

type RecruitingDashboardProps = {
  user: UserPublic;
};

export function RecruitingDashboard({ user }: RecruitingDashboardProps) {
  return (
    <AppShell
      user={user}
      title="Command center"
      subtitle="Overview KPIs, needs attention, DM scorecards, live sheet, and automation."
    >
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-zinc-100 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-zinc-900"
      >
        Skip to dashboard content
      </a>

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

      <RecruitingDashboardContent
        openJobs={openJobs}
        weeklyTrends={weeklyTrends}
        pipelineStages={pipelineStages}
        newHireMetrics={newHireMetrics}
        dmLeaderboard={dmLeaderboard}
      />

      <footer className="border-t border-zinc-800/80 pt-8 text-center text-xs text-zinc-600">
        SRS recruiting dashboard · KPIs + live sections from Google Sheet CSV · sample charts on
        Overview
      </footer>
    </AppShell>
  );
}
