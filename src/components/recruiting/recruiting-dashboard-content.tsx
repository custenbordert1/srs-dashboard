"use client";

import type { DmLeaderboardRow, NewHireMetric, PipelineStage, TrendWeek } from "@/lib/recruiting-sample-data";
import { warmBreezyCandidatesCache } from "@/lib/breezy-candidates-warm";
import { useEffect, useState, type ReactNode } from "react";
import { ApplicantPipeline } from "./applicant-pipeline";
import {
  DashboardTabPanel,
  LazyBreezyDashboardSummary,
  LazyBreezyOverviewJobsTable,
  LazyCandidatesSection,
  LazyDataHealthSection,
  LazyDmLeaderboard,
  LazyLiveSheetSection,
  LazyMelProjectsSection,
  LazyNeedsAttentionSection,
  LazyRecruitingAutomationSection,
  LazyRecruitingCommandCenter,
  LazyRecruiterDashboardSection,
  LazyRecruitingDataSourcesPanel,
  LazyRecruitingIntelligenceSection,
  LazyWorkforceOperationsSection,
  LazyJobManagementSection,
  LazyExecutiveHomePanel,
  LazyExecutiveRecruitingForecastPanel,
  LazyExecutiveAccountabilityPanel,
  LazyPipelineIntelligencePanel,
} from "./dashboard-tab-panels";
import { RecruitingTabSourceBanner } from "./recruiting-tab-source-banner";
import {
  DashboardTabNav,
  type DashboardTabId,
} from "./dashboard-tabs";
import {
  getDefaultDashboardTab,
  isDashboardTabId,
} from "@/lib/recruiting-tab-groups";
import type { UserRole } from "@/lib/auth/types";
import { NewHireMetrics } from "./new-hire-metrics";
import { RecruitingTrendsChart } from "./recruiting-trends-chart";
import { SheetKpiCards } from "./sheet-kpi-cards";

type RecruitingDashboardContentProps = {
  weeklyTrends: TrendWeek[];
  pipelineStages: PipelineStage[];
  newHireMetrics: NewHireMetric[];
  dmLeaderboard: DmLeaderboardRow[];
  userRole?: UserRole;
};

function TabPanelWithSourceBanner({
  tabId,
  children,
}: {
  tabId: DashboardTabId;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <RecruitingTabSourceBanner tabId={tabId} />
      {children}
    </div>
  );
}

export function RecruitingDashboardContent({
  weeklyTrends,
  pipelineStages,
  newHireMetrics,
  dmLeaderboard,
  userRole,
}: RecruitingDashboardContentProps) {
  const [activeTab, setActiveTab] = useState<DashboardTabId>(() =>
    getDefaultDashboardTab(userRole),
  );

  const handleTabChange = (tab: DashboardTabId) => {
    setActiveTab(tab);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (!tab || !isDashboardTabId(tab)) return;
    setActiveTab(tab);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => warmBreezyCandidatesCache(), 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      <DashboardTabNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        userRole={userRole}
      />

      <main
        id="dashboard-main"
        role="tabpanel"
        className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:space-y-8 sm:px-6 sm:py-10 lg:px-8"
      >
        <DashboardTabPanel tabId="command-center" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="command-center">
            <LazyRecruitingCommandCenter />
            <LazyRecruitingDataSourcesPanel />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="recruiter-dashboard" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="recruiter-dashboard">
            <LazyRecruiterDashboardSection />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="overview" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="overview">
            <LazyBreezyDashboardSummary />
            <SheetKpiCards />
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <LazyBreezyOverviewJobsTable />
                <div className="space-y-2">
                  <span className="inline-flex rounded-full border border-zinc-600/60 bg-zinc-900/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    Demo · FY26 sample
                  </span>
                  <RecruitingTrendsChart data={weeklyTrends} />
                </div>
              </div>
              <div className="space-y-6">
                <span className="inline-flex rounded-full border border-zinc-600/60 bg-zinc-900/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Demo · FY26 sample
                </span>
                <ApplicantPipeline stages={pipelineStages} />
                <NewHireMetrics metrics={newHireMetrics} />
              </div>
            </div>
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="needs-attention" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="needs-attention">
            <LazyNeedsAttentionSection />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="dm-scorecards" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="dm-scorecards">
            <LazyDmLeaderboard rows={dmLeaderboard} />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="live-sheet" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="live-sheet">
            <LazyLiveSheetSection />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="candidates" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="candidates">
            <LazyCandidatesSection />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="mel-projects" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="mel-projects">
            <LazyMelProjectsSection />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="data-health" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="data-health">
            <LazyDataHealthSection />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="recruiting-intelligence" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="recruiting-intelligence">
            <LazyRecruitingIntelligenceSection />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="automation" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="automation">
            <LazyRecruitingAutomationSection />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="workforce" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="workforce">
            <LazyWorkforceOperationsSection showPasswordPanel />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="job-management" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="job-management">
            <LazyJobManagementSection />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="pipeline-intelligence" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="pipeline-intelligence">
            <LazyPipelineIntelligencePanel />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="executive-home" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="executive-home">
            <LazyExecutiveHomePanel />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="executive-forecasting" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="executive-forecasting">
            <LazyExecutiveRecruitingForecastPanel />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="executive-accountability" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="executive-accountability">
            <LazyExecutiveAccountabilityPanel />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>
      </main>
    </>
  );
}
