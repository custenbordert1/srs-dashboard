"use client";

import type { DmLeaderboardRow, NewHireMetric, PipelineStage, TrendWeek } from "@/lib/recruiting-sample-data";
import { warmBreezyCandidatesCache } from "@/lib/breezy-candidates-warm";
import { useEffect, useState, type ReactNode } from "react";
import { ApplicantPipeline } from "./applicant-pipeline";
import {
  DashboardTabPanel,
  LazyExecutiveSummaryDashboard,
  LazyExecutiveOperationsCenter,
  LazyAiCommandCenterHub,
  LazyBreezyDashboardSummary,
  LazyBreezyOverviewJobsTable,
  LazyCandidatesSection,
  LazyRecruiterProductivityCenter,
  LazyTerritoryIntelligenceCenter,
  LazyTerritoryActionCenter,
  LazyNotificationCenter,
  LazyDataHealthSection,
  LazySystemAdminCenter,
  LazyDmLeaderboard,
  LazyLiveSheetSection,
  LazyMelProjectsSection,
  LazyNeedsAttentionSection,
  LazyRecruitingAutomationSection,
  LazyRoutingIntelligenceSection,
  LazyRecruitingCommandCenter,
  LazyRecruitingDataSourcesPanel,
  LazyRecruitingIntelligenceSection,
  LazyWorkforceOperationsSection,
  LazyJobManagementSection,
} from "./dashboard-tab-panels";
import { RecruitingTabSourceBanner } from "./recruiting-tab-source-banner";
import {
  DashboardTabNav,
  type DashboardTabId,
} from "./dashboard-tabs";
import type { UserRole } from "@/lib/auth/types";
import { isAdminRole } from "@/lib/auth/roles";
import {
  RECRUITING_NAVIGATE_EVENT,
  type RecruitingNavigateDetail,
} from "@/lib/recruiting-tab-navigation";
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
  hideBanner = false,
}: {
  tabId: DashboardTabId;
  children: ReactNode;
  hideBanner?: boolean;
}) {
  return (
    <div className="space-y-4">
      {!hideBanner ? <RecruitingTabSourceBanner tabId={tabId} /> : null}
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
    userRole && isAdminRole(userRole) ? "executive-operations-center" : "executive-summary",
  );

  useEffect(() => {
    const id = window.setTimeout(() => warmBreezyCandidatesCache(), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<RecruitingNavigateDetail>).detail;
      if (!detail?.tab) return;
      setActiveTab(detail.tab);
      if (detail.elementId) {
        window.setTimeout(() => {
          document.getElementById(detail.elementId!)?.scrollIntoView({ behavior: "smooth" });
        }, 120);
      }
    };
    window.addEventListener(RECRUITING_NAVIGATE_EVENT, handler);
    return () => window.removeEventListener(RECRUITING_NAVIGATE_EVENT, handler);
  }, []);

  return (
    <>
      <DashboardTabNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userRole={userRole}
      />

      <main
        id="dashboard-main"
        role="tabpanel"
        className={`mx-auto space-y-5 py-4 sm:py-6 ${
          activeTab === "candidates"
            ? "max-w-none px-2 sm:px-3 lg:px-4"
            : "max-w-7xl px-4 sm:px-6 lg:px-8"
        }`}
      >
        <DashboardTabPanel tabId="executive-operations-center" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="executive-operations-center" hideBanner>
            <LazyExecutiveOperationsCenter />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="executive-summary" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="executive-summary" hideBanner>
            <LazyExecutiveSummaryDashboard />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="ai-command-center" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="ai-command-center" hideBanner>
            <LazyAiCommandCenterHub />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="command-center" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="command-center">
            <LazyRecruitingCommandCenter />
            <LazyRecruitingDataSourcesPanel />
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

        <DashboardTabPanel tabId="recruiter-productivity" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="recruiter-productivity">
            <LazyRecruiterProductivityCenter />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="territory-intelligence" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="territory-intelligence">
            <LazyTerritoryIntelligenceCenter />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="notifications" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="notifications">
            <LazyNotificationCenter />
          </TabPanelWithSourceBanner>
        </DashboardTabPanel>

        <DashboardTabPanel tabId="action-center" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="action-center">
            <LazyTerritoryActionCenter />
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

        <DashboardTabPanel tabId="system-admin" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="system-admin">
            <LazySystemAdminCenter />
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

        <DashboardTabPanel tabId="routing-intelligence" activeTab={activeTab}>
          <TabPanelWithSourceBanner tabId="routing-intelligence">
            <LazyRoutingIntelligenceSection />
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
      </main>
    </>
  );
}
