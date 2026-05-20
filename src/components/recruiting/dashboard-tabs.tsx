"use client";

export type DashboardTabId =
  | "command-center"
  | "overview"
  | "needs-attention"
  | "dm-scorecards"
  | "live-sheet"
  | "candidates"
  | "mel-projects"
  | "data-health"
  | "recruiting-intelligence"
  | "automation"
  | "workforce";

export type DashboardTab = {
  id: DashboardTabId;
  label: string;
};

export const DASHBOARD_TABS: DashboardTab[] = [
  { id: "command-center", label: "Command Center" },
  { id: "overview", label: "Overview" },
  { id: "needs-attention", label: "Needs Attention" },
  { id: "dm-scorecards", label: "DM Scorecards" },
  { id: "live-sheet", label: "Live Sheet" },
  { id: "candidates", label: "Candidates" },
  { id: "mel-projects", label: "MEL Projects" },
  { id: "data-health", label: "Data Health" },
  { id: "recruiting-intelligence", label: "Recruiting Intelligence" },
  { id: "automation", label: "Automation" },
  { id: "workforce", label: "Workforce" },
];

type DashboardTabNavProps = {
  activeTab: DashboardTabId;
  onTabChange: (tab: DashboardTabId) => void;
};

export function DashboardTabNav({ activeTab, onTabChange }: DashboardTabNavProps) {
  return (
    <nav
      aria-label="Dashboard sections"
      className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="-mb-px flex gap-1 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {DASHBOARD_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabChange(tab.id)}
                className={[
                  "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                  isActive
                    ? "border border-teal-500/40 bg-teal-500/10 text-teal-200 shadow-sm shadow-teal-950/20"
                    : "border border-transparent text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
