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

export const LazyRecruiterProductivityCenter = dynamic(
  () =>
    import("@/components/recruiting/recruiter-productivity-center").then((m) => ({
      default: m.RecruiterProductivityCenter,
    })),
  { loading: tabLoading("Loading recruiter productivity…"), ssr: false },
);

export const LazyTerritoryIntelligenceCenter = dynamic(
  () =>
    import("@/components/recruiting/territory-intelligence-center").then((m) => ({
      default: m.TerritoryIntelligenceCenter,
    })),
  { loading: tabLoading("Loading territory intelligence…"), ssr: false },
);

export const LazyNotificationCenter = dynamic(
  () =>
    import("@/components/notifications/notification-center").then((m) => ({
      default: m.NotificationCenter,
    })),
  { loading: tabLoading("Loading notifications…"), ssr: false },
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

export const LazyRoutingIntelligenceSection = dynamic(
  () =>
    import("@/components/recruiting/routing-intelligence/routing-intelligence-section").then((m) => ({
      default: m.RoutingIntelligenceSection,
    })),
  { loading: tabLoading("Loading routing intelligence…"), ssr: false },
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
