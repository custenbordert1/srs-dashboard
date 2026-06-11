import type { DemoModeSnapshot } from "@/lib/production-readiness/types";

export function isExecutiveDemoModeEnabled(): boolean {
  return process.env.EXECUTIVE_DEMO_MODE === "true";
}

export function buildDemoModeSnapshot(): DemoModeSnapshot {
  const enabled = isExecutiveDemoModeEnabled();
  return {
    enabled,
    label: enabled ? "Executive demo mode" : "Live data mode",
    sections: [
      {
        id: "executive-dashboard",
        title: "Executive dashboard",
        description: "Sample KPIs, territory rollups, and risk signals for leadership walkthroughs.",
      },
      {
        id: "territory-intelligence",
        title: "Territory intelligence",
        description: "Heat map and attention territories with illustrative coverage metrics.",
      },
      {
        id: "recruiter-productivity",
        title: "Recruiter productivity",
        description: "Sample scorecards, daily tasks, and conversion trends.",
      },
      {
        id: "workforce-ops",
        title: "Workforce operations",
        description: "MEL pipeline and rep readiness demonstration data.",
      },
      {
        id: "ai-command-center",
        title: "AI command center",
        description: "Polished insights feed, briefing, and action recommendations.",
      },
    ],
  };
}
