"use client";

import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";
import type { DashboardNavGroupId } from "@/lib/recruiting-tab-groups";
import {
  IconBarChart,
  IconBriefcase,
  IconClipboard,
  IconDatabase,
  IconExecutive,
  IconInbox,
  IconMap,
  IconPipeline,
  IconSettings,
  IconShieldCheck,
  IconSparkles,
  IconUsers,
  IconZap,
} from "@/components/executive/ui/executive-icons";
import type { ReactNode } from "react";

const GROUP_ICONS: Record<DashboardNavGroupId, ReactNode> = {
  executive: <IconExecutive size={15} />,
  operations: <IconBriefcase size={15} />,
  "territory-field": <IconMap size={15} />,
  "admin-data": <IconDatabase size={15} />,
};

const TAB_ICONS: Partial<Record<DashboardTabId, ReactNode>> = {
  "executive-home": <IconExecutive size={14} />,
  "executive-accountability": <IconShieldCheck size={14} />,
  "executive-forecasting": <IconBarChart size={14} />,
  "pipeline-intelligence": <IconPipeline size={14} />,
  "workforce-intelligence": <IconUsers size={14} />,
  "recruiting-autopilot": <IconZap size={14} />,
  "recruiting-autopilot-ops": <IconSettings size={14} />,
  "recruiting-execution": <IconZap size={14} />,
  "placement-command-center": <IconMap size={14} />,
  "command-center": <IconSparkles size={14} />,
  "recruiter-command-center": <IconInbox size={14} />,
  "recruiter-dashboard": <IconUsers size={14} />,
  overview: <IconBarChart size={14} />,
  "needs-attention": <IconShieldCheck size={14} />,
  candidates: <IconUsers size={14} />,
  "job-management": <IconBriefcase size={14} />,
  "approval-queue": <IconClipboard size={14} />,
  "dm-scorecards": <IconMap size={14} />,
  "mel-projects": <IconBriefcase size={14} />,
  workforce: <IconUsers size={14} />,
  "live-sheet": <IconDatabase size={14} />,
  "data-health": <IconShieldCheck size={14} />,
  "recruiting-intelligence": <IconSparkles size={14} />,
  automation: <IconZap size={14} />,
};

export function navGroupIcon(groupId: DashboardNavGroupId): ReactNode {
  return GROUP_ICONS[groupId];
}

export function navTabIcon(tabId: DashboardTabId): ReactNode | null {
  return TAB_ICONS[tabId] ?? null;
}
