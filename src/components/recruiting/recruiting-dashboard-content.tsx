"use client";

import type {
  DmLeaderboardRow,
  NewHireMetric,
  OpenJob,
  PipelineStage,
  TrendWeek,
} from "@/lib/recruiting-sample-data";
import { useState } from "react";
import { ApplicantPipeline } from "./applicant-pipeline";
import { BreezyDashboardSummary } from "./breezy-dashboard-summary";
import {
  DashboardTabPanel,
  LazyCandidatesSection,
  LazyDataHealthSection,
  LazyLiveSheetSection,
  LazyMelProjectsSection,
  LazyNeedsAttentionSection,
  LazyRecruitingAutomationSection,
  LazyRecruitingCommandCenter,
  LazyRecruitingIntelligenceSection,
  LazyWorkforceOperationsSection,
} from "./dashboard-tab-panels";
import {
  DashboardTabNav,
  EXECUTIVE_WORKFORCE_INTELLIGENCE_TAB,
  type DashboardTabId,
} from "./dashboard-tabs";
import type { UserRole } from "@/lib/auth/types";
import { DmLeaderboard } from "./dm-leaderboard";
import { NewHireMetrics } from "./new-hire-metrics";
import { OpenJobsTable } from "./open-jobs-table";
import { RecruitingTrendsChart } from "./recruiting-trends-chart";
import { SheetKpiCards } from "./sheet-kpi-cards";

type RecruitingDashboardContentProps = {
  openJobs: OpenJob[];
  weeklyTrends: TrendWeek[];
  pipelineStages: PipelineStage[];
  newHireMetrics: NewHireMetric[];
  dmLeaderboard: DmLeaderboardRow[];
  userRole?: UserRole;
};

export function RecruitingDashboardContent({
  openJobs,
  weeklyTrends,
  pipelineStages,
  newHireMetrics,
  dmLeaderboard,
  userRole,
}: RecruitingDashboardContentProps) {
  const [activeTab, setActiveTab] = useState<DashboardTabId>("command-center");
  const executiveTabs = userRole === "executive" ? [EXECUTIVE_WORKFORCE_INTELLIGENCE_TAB] : [];

  return (
    <>
      <DashboardTabNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        extraTabs={executiveTabs}
      />

      <main
        id="dashboard-main"
        role="tabpanel"
        className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:space-y-8 sm:px-6 sm:py-10 lg:px-8"
      >
        <DashboardTabPanel tabId="command-center" activeTab={activeTab}>
          <LazyRecruitingCommandCenter />
        </DashboardTabPanel>

        <DashboardTabPanel tabId="overview" activeTab={activeTab}>
          <BreezyDashboardSummary />
          <SheetKpiCards />
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <OpenJobsTable jobs={openJobs} />
              <RecruitingTrendsChart data={weeklyTrends} />
            </div>
            <div className="space-y-6">
              <ApplicantPipeline stages={pipelineStages} />
              <NewHireMetrics metrics={newHireMetrics} />
            </div>
          </div>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="needs-attention" activeTab={activeTab}>
          <LazyNeedsAttentionSection />
        </DashboardTabPanel>

        <DashboardTabPanel tabId="dm-scorecards" activeTab={activeTab}>
          <DmLeaderboard rows={dmLeaderboard} />
        </DashboardTabPanel>

        <DashboardTabPanel tabId="live-sheet" activeTab={activeTab}>
          <LazyLiveSheetSection />
        </DashboardTabPanel>

        <DashboardTabPanel tabId="candidates" activeTab={activeTab}>
          <LazyCandidatesSection />
        </DashboardTabPanel>

        <DashboardTabPanel tabId="mel-projects" activeTab={activeTab}>
          <LazyMelProjectsSection />
        </DashboardTabPanel>

        <DashboardTabPanel tabId="data-health" activeTab={activeTab}>
          <LazyDataHealthSection />
        </DashboardTabPanel>

        <DashboardTabPanel tabId="recruiting-intelligence" activeTab={activeTab}>
          <LazyRecruitingIntelligenceSection />
        </DashboardTabPanel>

        <DashboardTabPanel tabId="automation" activeTab={activeTab}>
          <LazyRecruitingAutomationSection />
        </DashboardTabPanel>

        <DashboardTabPanel tabId="workforce" activeTab={activeTab}>
          <LazyWorkforceOperationsSection showPasswordPanel />
        </DashboardTabPanel>
      </main>
    </>
  );
}
