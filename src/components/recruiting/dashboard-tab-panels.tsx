"use client";

import type { DashboardTabId } from "@/components/recruiting/dashboard-tabs";
import { TabSkeleton } from "@/components/ui/tab-skeleton";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const loading = () => <TabSkeleton />;

export const LazyRecruitingCommandCenter = dynamic(
  () =>
    import("@/components/recruiting/recruiting-command-center").then((m) => ({
      default: m.RecruitingCommandCenter,
    })),
  { loading },
);

export const LazyNeedsAttentionSection = dynamic(
  () =>
    import("@/components/recruiting/needs-attention-section").then((m) => ({
      default: m.NeedsAttentionSection,
    })),
  { loading },
);

export const LazyLiveSheetSection = dynamic(
  () =>
    import("@/components/recruiting/live-sheet-section").then((m) => ({
      default: m.LiveSheetSection,
    })),
  { loading },
);

export const LazyCandidatesSection = dynamic(
  () =>
    import("@/components/recruiting/candidates-section").then((m) => ({
      default: m.CandidatesSection,
    })),
  { loading },
);

export const LazyMelProjectsSection = dynamic(
  () =>
    import("@/components/recruiting/mel-projects-section").then((m) => ({
      default: m.MelProjectsSection,
    })),
  { loading },
);

export const LazyDataHealthSection = dynamic(
  () =>
    import("@/components/recruiting/data-health-section").then((m) => ({
      default: m.DataHealthSection,
    })),
  { loading },
);

export const LazyRecruitingIntelligenceSection = dynamic(
  () =>
    import("@/components/recruiting/recruiting-intelligence-section").then((m) => ({
      default: m.RecruitingIntelligenceSection,
    })),
  { loading, ssr: false },
);

export const LazyRecruitingAutomationSection = dynamic(
  () =>
    import("@/components/recruiting/recruiting-automation-section").then((m) => ({
      default: m.RecruitingAutomationSection,
    })),
  { loading },
);

export const LazyWorkforceOperationsSection = dynamic(
  () =>
    import("@/components/recruiting/workforce-operations-section").then((m) => ({
      default: m.WorkforceOperationsSection,
    })),
  { loading, ssr: false },
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
