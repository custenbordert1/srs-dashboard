"use client";

import type { DashboardTabId } from "@/components/recruiting/dashboard-tabs";
import { TabSkeleton } from "@/components/ui/tab-skeleton";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

function tabLoading(message: string) {
  function TabLoadingFallback() {
    return <TabSkeleton message={message} />;
  }
  return TabLoadingFallback;
}

export const LazyRecruiterDashboardSection = dynamic(
  () =>
    import("@/components/recruiting/recruiter-dashboard-section").then((m) => ({
      default: m.RecruiterDashboardSection,
    })),
  { loading: tabLoading("Loading recruiter dashboard…"), ssr: false },
);

export const LazyRecruitingCommandCenter = dynamic(
  () =>
    import("@/components/recruiting/recruiting-command-center").then((m) => ({
      default: m.RecruitingCommandCenter,
    })),
  { loading: tabLoading("Loading Command Center…"), ssr: false },
);

export const LazyRecruitingDataSourcesPanel = dynamic(
  () =>
    import("@/components/recruiting/recruiting-data-sources-panel").then((m) => ({
      default: m.RecruitingDataSourcesPanel,
    })),
  { loading: tabLoading("Loading data source status…"), ssr: false },
);

export const LazyBreezyDashboardSummary = dynamic(
  () =>
    import("@/components/recruiting/breezy-dashboard-summary").then((m) => ({
      default: m.BreezyDashboardSummary,
    })),
  { loading: tabLoading("Loading Breezy summary…"), ssr: false },
);

export const LazyBreezyOverviewJobsTable = dynamic(
  () =>
    import("@/components/recruiting/breezy-overview-jobs-table").then((m) => ({
      default: m.BreezyOverviewJobsTable,
    })),
  { loading: tabLoading("Loading Breezy jobs…"), ssr: false },
);

export const LazyDmLeaderboard = dynamic(
  () =>
    import("@/components/recruiting/dm-leaderboard").then((m) => ({
      default: m.DmLeaderboard,
    })),
  { loading: tabLoading("Loading DM scorecards…"), ssr: false },
);

export const LazyNeedsAttentionSection = dynamic(
  () =>
    import("@/components/recruiting/needs-attention-section").then((m) => ({
      default: m.NeedsAttentionSection,
    })),
  { loading: tabLoading("Loading needs attention…") },
);

export const LazyLiveSheetSection = dynamic(
  () =>
    import("@/components/recruiting/live-sheet-section").then((m) => ({
      default: m.LiveSheetSection,
    })),
  { loading: tabLoading("Loading recruiting sheet (archive)…") },
);

export const LazyCandidatesSection = dynamic(
  () =>
    import("@/components/recruiting/candidates-section").then((m) => ({
      default: m.CandidatesSection,
    })),
  { loading: tabLoading("Loading candidates…"), ssr: false },
);

export const LazyMelProjectsSection = dynamic(
  () =>
    import("@/components/recruiting/mel-projects-section").then((m) => ({
      default: m.MelProjectsSection,
    })),
  { loading: tabLoading("Loading MEL projects…") },
);

export const LazyDataHealthSection = dynamic(
  () =>
    import("@/components/recruiting/data-health-section").then((m) => ({
      default: m.DataHealthSection,
    })),
  { loading: tabLoading("Loading data health…") },
);

export const LazyRecruitingIntelligenceSection = dynamic(
  () =>
    import("@/components/recruiting/recruiting-intelligence-section").then((m) => ({
      default: m.RecruitingIntelligenceSection,
    })),
  { loading: tabLoading("Loading recruiting intelligence…"), ssr: false },
);

export const LazyRecruitingAutomationSection = dynamic(
  () =>
    import("@/components/recruiting/recruiting-automation-section").then((m) => ({
      default: m.RecruitingAutomationSection,
    })),
  { loading: tabLoading("Loading automation…") },
);

export const LazyWorkforceOperationsSection = dynamic(
  () =>
    import("@/components/recruiting/workforce-operations-section").then((m) => ({
      default: m.WorkforceOperationsSection,
    })),
  { loading: tabLoading("Loading workforce…"), ssr: false },
);

export const LazyJobManagementSection = dynamic(
  () =>
    import("@/components/recruiting/job-management-section").then((m) => ({
      default: m.JobManagementSection,
    })),
  { loading: tabLoading("Loading job management…"), ssr: false },
);

export const LazyExecutiveHomePanel = dynamic(
  () =>
    import("@/components/executive/executive-home-panel").then((m) => ({
      default: m.ExecutiveHomePanel,
    })),
  { loading: tabLoading("Loading executive home…"), ssr: false },
);

export const LazyExecutiveRecruitingForecastPanel = dynamic(
  () =>
    import("@/components/executive/executive-recruiting-forecast-panel").then((m) => ({
      default: m.ExecutiveRecruitingForecastPanel,
    })),
  { loading: tabLoading("Loading executive forecast…"), ssr: false },
);

export const LazyExecutiveAccountabilityPanel = dynamic(
  () =>
    import("@/components/executive/executive-accountability-panel").then((m) => ({
      default: m.ExecutiveAccountabilityPanel,
    })),
  { loading: tabLoading("Loading executive accountability…"), ssr: false },
);

export const LazyPipelineIntelligencePanel = dynamic(
  () =>
    import("@/components/recruiting/pipeline-intelligence-panel").then((m) => ({
      default: m.PipelineIntelligencePanel,
    })),
  { loading: tabLoading("Loading pipeline intelligence…"), ssr: false },
);

export const LazyRecruitingAutopilotPanel = dynamic(
  () =>
    import("@/components/recruiting/recruiting-autopilot-panel").then((m) => ({
      default: m.RecruitingAutopilotPanel,
    })),
  { loading: tabLoading("Loading recruiting autopilot…"), ssr: false },
);

export const LazyRecruitingExecutionCenter = dynamic(
  () =>
    import("@/components/recruiting/recruiting-execution-center").then((m) => ({
      default: m.RecruitingExecutionCenter,
    })),
  { loading: tabLoading("Loading execution center…"), ssr: false },
);

export const LazyRecruitingAutopilotOpsPanel = dynamic(
  () =>
    import("@/components/recruiting/recruiting-autopilot-ops-panel").then((m) => ({
      default: m.RecruitingAutopilotOpsPanel,
    })),
  { loading: tabLoading("Loading autopilot operations…"), ssr: false },
);

export const LazyPlacementCommandCenterPanel = dynamic(
  () =>
    import("@/components/recruiting/placement-command-center-panel").then((m) => ({
      default: m.PlacementCommandCenterPanel,
    })),
  { loading: tabLoading("Loading hiring & placement…"), ssr: false },
);

export const LazyApprovalQueueCommandCenterPanel = dynamic(
  () =>
    import("@/components/recruiting/approval-queue-command-center-panel").then((m) => ({
      default: m.ApprovalQueueCommandCenterPanel,
    })),
  { loading: tabLoading("Loading approval queue…"), ssr: false },
);

export const LazyRecruiterCommandCenterPanel = dynamic(
  () =>
    import("@/components/recruiting/recruiter-command-center-panel").then((m) => ({
      default: m.RecruiterCommandCenterPanel,
    })),
  { loading: tabLoading("Loading recruiter operations…"), ssr: false },
);

type DashboardTabPanelProps = {
  tabId: DashboardTabId;
  activeTab: DashboardTabId;
  children: ReactNode;
};

/** Mount tab content only while active — avoids hidden heavy trees and duplicate fetches. */
export function DashboardTabPanel({ tabId, activeTab, children }: DashboardTabPanelProps) {
  if (activeTab !== tabId) return null;
  return <>{children}</>;
}
