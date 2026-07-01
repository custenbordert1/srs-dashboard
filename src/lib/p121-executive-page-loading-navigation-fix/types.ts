import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";

/** Executive sub-tabs audited in P121 (canonical dashboard tab ids). */
export const P121_EXECUTIVE_TAB_IDS = [
  "executive-home",
  "executive-accountability",
  "executive-forecasting",
  "pipeline-intelligence",
  "workforce-intelligence",
  "recruiting-autopilot",
  "recruiting-autopilot-ops",
  "recruiting-execution",
  "placement-command-center",
] as const satisfies readonly DashboardTabId[];

export type P121ExecutiveTabId = (typeof P121_EXECUTIVE_TAB_IDS)[number];

/** Legacy / friendly URL aliases → canonical tab ids. */
export const P121_EXECUTIVE_TAB_ALIASES: Record<string, DashboardTabId> = {
  "executive-forecast": "executive-forecasting",
  "autopilot-ops": "recruiting-autopilot-ops",
  "execution-center": "recruiting-execution",
  "hiring-placement": "placement-command-center",
};

export type P121DegradedPanelSource =
  | "executive-accountability"
  | "executive-forecasting"
  | "pipeline-intelligence"
  | "executive-home"
  | "workforce-intelligence";

export type P121ExecutiveTabAuditEntry = {
  tabId: P121ExecutiveTabId;
  label: string;
  routeMechanism: "dashboard-tab" | "standalone-page-legacy";
  issuesFound: string[];
  fixesApplied: string[];
};

export type P121Report = {
  phase: "P121";
  title: "Executive Page Loading & Navigation Fix";
  generatedAt: string;
  tabsAudited: P121ExecutiveTabAuditEntry[];
  issuesFound: string[];
  fixesApplied: string[];
  degradedStatesAdded: P121DegradedPanelSource[];
  testsAdded: string[];
  safetyConfirmation: {
    automationBehaviorUnchanged: true;
    noPaperworkSends: true;
    noBreezyWrites: true;
    liveModeUnchanged: true;
    executeOneUnchanged: true;
    runnerSchedulingUnchanged: true;
    p120LayoutPreserved: true;
  };
};
