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
import { CandidatesSection } from "./candidates-section";
import { DashboardTabNav, type DashboardTabId } from "./dashboard-tabs";
import { DmLeaderboard } from "./dm-leaderboard";
import { LiveSheetSection } from "./live-sheet-section";
import { DataHealthSection } from "./data-health-section";
import { MelProjectsSection } from "./mel-projects-section";
import { NeedsAttentionSection } from "./needs-attention-section";
import { NewHireMetrics } from "./new-hire-metrics";
import { OpenJobsTable } from "./open-jobs-table";
import { RecruitingAutomationSection } from "./recruiting-automation-section";
import { RecruitingCommandCenter } from "./recruiting-command-center";
import { RecruitingIntelligenceSection } from "./recruiting-intelligence-section";
import { RecruitingTrendsChart } from "./recruiting-trends-chart";
import { SheetKpiCards } from "./sheet-kpi-cards";
import { WorkforceOperationsSection } from "./workforce-operations-section";

type RecruitingDashboardContentProps = {
  openJobs: OpenJob[];
  weeklyTrends: TrendWeek[];
  pipelineStages: PipelineStage[];
  newHireMetrics: NewHireMetric[];
  dmLeaderboard: DmLeaderboardRow[];
};

export function RecruitingDashboardContent({
  openJobs,
  weeklyTrends,
  pipelineStages,
  newHireMetrics,
  dmLeaderboard,
}: RecruitingDashboardContentProps) {
  const [activeTab, setActiveTab] = useState<DashboardTabId>("command-center");

  return (
    <>
      <DashboardTabNav activeTab={activeTab} onTabChange={setActiveTab} />

      <main
        id="dashboard-main"
        role="tabpanel"
        className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:space-y-8 sm:px-6 sm:py-10 lg:px-8"
      >
        {activeTab === "command-center" ? <RecruitingCommandCenter /> : null}

        {activeTab === "overview" ? (
          <>
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
          </>
        ) : null}

        {activeTab === "needs-attention" ? <NeedsAttentionSection /> : null}

        {activeTab === "dm-scorecards" ? <DmLeaderboard rows={dmLeaderboard} /> : null}

        {activeTab === "live-sheet" ? <LiveSheetSection /> : null}

        {activeTab === "candidates" ? <CandidatesSection /> : null}

        {activeTab === "mel-projects" ? <MelProjectsSection /> : null}

        {activeTab === "data-health" ? <DataHealthSection /> : null}

        {activeTab === "recruiting-intelligence" ? <RecruitingIntelligenceSection /> : null}

        {activeTab === "automation" ? <RecruitingAutomationSection /> : null}

        {activeTab === "workforce" ? <WorkforceOperationsSection showPasswordPanel /> : null}
      </main>
    </>
  );
}
