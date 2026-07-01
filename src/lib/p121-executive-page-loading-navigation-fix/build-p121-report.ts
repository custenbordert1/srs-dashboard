import { getRecruitingTabSource } from "@/lib/recruiting-tab-source-labels";
import {
  P121_EXECUTIVE_TAB_IDS,
  type P121ExecutiveTabAuditEntry,
  type P121Report,
} from "@/lib/p121-executive-page-loading-navigation-fix/types";

function buildTabAudit(): P121ExecutiveTabAuditEntry[] {
  return P121_EXECUTIVE_TAB_IDS.map((tabId) => {
    const meta = getRecruitingTabSource(tabId);
    const issues: string[] = [];
    const fixes: string[] = [];

    if (tabId === "workforce-intelligence") {
      issues.push("Nav used external Link to /executive/workforce-intelligence; tab never activated in dashboard.");
      fixes.push("Inline DashboardTabPanel with WorkforceIntelligencePanel; removed external href.");
    }

    if (
      tabId === "executive-accountability" ||
      tabId === "executive-forecasting" ||
      tabId === "pipeline-intelligence"
    ) {
      issues.push("Panel could remain on loading skeleton when lazy chunk or API hung.");
      fixes.push("Loading ceiling fallback with source label and retry; API fetch watchdog via shared degraded state.");
    }

    if (tabId === "executive-home") {
      issues.push("Heavy lazy bundle and command summary fetch without timeout caused long rendering.");
      fixes.push("Lazy tab loading ceiling; command summary uses fetchWithTimeout and loading ceiling.");
    }

    return {
      tabId,
      label: meta.navLabel,
      routeMechanism: tabId === "workforce-intelligence" ? "dashboard-tab" : "dashboard-tab",
      issuesFound: issues,
      fixesApplied: fixes,
    };
  });
}

export function buildP121Report(): P121Report {
  const tabsAudited = buildTabAudit();
  const issuesFound = [
    ...new Set(tabsAudited.flatMap((entry) => entry.issuesFound)),
  ];
  const fixesApplied = [
    "Normalize executive tab URL aliases (executive-forecast, autopilot-ops, execution-center, hiring-placement).",
    "Inline workforce-intelligence as dashboard tab panel.",
    "Executive lazy tab loading fallbacks with 5s ceiling and retry.",
    "Degraded panel states for accountability, forecast, and pipeline intelligence APIs.",
    "Executive command summary fetch timeout and loading ceiling.",
    ...new Set(tabsAudited.flatMap((entry) => entry.fixesApplied)),
  ];

  return {
    phase: "P121",
    title: "Executive Page Loading & Navigation Fix",
    generatedAt: new Date().toISOString(),
    tabsAudited,
    issuesFound,
    fixesApplied,
    degradedStatesAdded: [
      "executive-accountability",
      "executive-forecasting",
      "pipeline-intelligence",
      "executive-home",
      "workforce-intelligence",
    ],
    testsAdded: [
      "src/lib/p121-executive-page-loading-navigation-fix/p121-executive-page-loading-navigation-fix.test.ts",
    ],
    safetyConfirmation: {
      automationBehaviorUnchanged: true,
      noPaperworkSends: true,
      noBreezyWrites: true,
      liveModeUnchanged: true,
      executeOneUnchanged: true,
      runnerSchedulingUnchanged: true,
      p120LayoutPreserved: true,
    },
  };
}
