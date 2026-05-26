import { AppShell } from "@/components/auth/app-shell";
import type { UserPublic } from "@/lib/auth/types";
import { dmLeaderboard, newHireMetrics, pipelineStages, weeklyTrends } from "@/lib/recruiting-sample-data";
import { RecruitingDashboardContent } from "./recruiting-dashboard-content";

type RecruitingDashboardProps = {
  user: UserPublic;
};

export function RecruitingDashboard({ user }: RecruitingDashboardProps) {
  return (
    <AppShell
      user={user}
      title="Command center"
      subtitle="Breezy HR for live recruiting · recruiting sheet and FY26 charts for reference · MEL for store demand."
    >
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-zinc-100 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-zinc-900"
      >
        Skip to dashboard content
      </a>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-teal-500/25 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-200">
          Live · Breezy HR
        </span>
        <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
          Archive · Recruiting sheet
        </span>
        <span className="rounded-full border border-zinc-700/80 bg-zinc-900/60 px-3 py-1 text-xs font-medium text-zinc-300">
          Demo · FY26 sample charts
        </span>
      </div>

      <RecruitingDashboardContent
        weeklyTrends={weeklyTrends}
        pipelineStages={pipelineStages}
        newHireMetrics={newHireMetrics}
        dmLeaderboard={dmLeaderboard}
        userRole={user.role}
      />

      <footer className="border-t border-zinc-800/80 pt-8 text-center text-xs text-zinc-600">
        SRS recruiting dashboard · Breezy HR is the live ATS source · Google Sheet recruiting is
        reference-only · MEL sheet for store demand
      </footer>
    </AppShell>
  );
}
