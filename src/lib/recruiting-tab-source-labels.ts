export type DashboardTabId =
  | "executive-summary"
  | "ai-command-center"
  | "command-center"
  | "overview"
  | "needs-attention"
  | "dm-scorecards"
  | "live-sheet"
  | "candidates"
  | "recruiter-productivity"
  | "territory-intelligence"
  | "notifications"
  | "mel-projects"
  | "data-health"
  | "system-admin"
  | "recruiting-intelligence"
  | "automation"
  | "routing-intelligence"
  | "workforce"
  | "placement-command-center"
  | "job-management"
  | "workforce-intelligence"
  | "action-center"
  | "executive-operations-center"
  | "executive-alerts"
  | "predictive-territory-risk"
  | "autopilot-recommendations"
  | "daily-action-plan"
  | "recommendation-intelligence"
  | "automation-control-center"
  | "executive-morning-brief";

/** Visual category for nav badges and tab banners — metadata only, no data routing. */
export type RecruitingTabSourceKind =
  | "live-breezy"
  | "live-mel"
  | "live-workforce"
  | "archive-sheet"
  | "demo"
  | "system"
  | "mixed"
  | "executive";

export type RecruitingTabSourceMeta = {
  /** Primary nav button text */
  navLabel: string;
  /** Short second line under nav label */
  sourceTag: string;
  badgeLabel: string;
  kind: RecruitingTabSourceKind;
  /** Static one-line banner at top of tab panel */
  bannerMessage: string;
};

export const RECRUITING_TAB_SOURCE_BY_ID: Record<DashboardTabId, RecruitingTabSourceMeta> = {
  "executive-summary": {
    navLabel: "Executive Dashboard",
    sourceTag: "Leadership view",
    badgeLabel: "Executive summary",
    kind: "executive",
    bannerMessage: "At-a-glance KPIs, AI briefing, and priority alerts for leadership.",
  },
  "executive-operations-center": {
    navLabel: "Command Center",
    sourceTag: "Unified operations",
    badgeLabel: "Recruiting command center",
    kind: "executive",
    bannerMessage:
      "Unified recruiting command center — alerts, risk, recommendations, follow-ups, and daily actions in one leadership view.",
  },
  "executive-alerts": {
    navLabel: "Executive Alerts",
    sourceTag: "Intelligence alerts",
    badgeLabel: "Action-driven alerts",
    kind: "executive",
    bannerMessage:
      "Prioritized company risks and recommended actions powered by the unified recruiting intelligence snapshot. Manual review only — no automation execution.",
  },
  "predictive-territory-risk": {
    navLabel: "Territory Risk",
    sourceTag: "Predictive forecast",
    badgeLabel: "Predictive territory risk",
    kind: "executive",
    bannerMessage:
      "Forecast recruiting and coverage failures before they happen — powered only by the unified recruiting intelligence cache.",
  },
  "autopilot-recommendations": {
    navLabel: "Autopilot Recommendations",
    sourceTag: "Action engine",
    badgeLabel: "Recruiting autopilot",
    kind: "executive",
    bannerMessage:
      "Prioritized operational recommendations with impact, confidence, and ROI — powered by intelligence cache, alerts, follow-ups, and predictive risk.",
  },
  "daily-action-plan": {
    navLabel: "Daily Action Plan",
    sourceTag: "Morning operating view",
    badgeLabel: "Executive daily plan",
    kind: "executive",
    bannerMessage:
      "Today's top actions from autopilot recommendations — grouped by urgency with one-click follow-up, review, snooze, and resolve.",
  },
  "recommendation-intelligence": {
    navLabel: "Recommendation Intelligence",
    sourceTag: "Validation & learning",
    badgeLabel: "Recommendation validation",
    kind: "executive",
    bannerMessage:
      "Measure recommendation outcomes, rank effectiveness by type and owner, and feed learned confidence back into autopilot forecasts.",
  },
  "automation-control-center": {
    navLabel: "Automation Control Center",
    sourceTag: "Approval workflow",
    badgeLabel: "Recruiting automations",
    kind: "executive",
    bannerMessage:
      "Review, approve, and track recruiting automation drafts — job refreshes, new postings, and follow-up campaigns. Approval required by default; no live Breezy or email execution without sign-off.",
  },
  "executive-morning-brief": {
    navLabel: "Executive Morning Brief",
    sourceTag: "Daily leadership digest",
    badgeLabel: "Morning brief",
    kind: "executive",
    bannerMessage:
      "Single leadership briefing — recruiting health, territory risks, forecasts, automation opportunities, and top priorities for the day. Cache-first intelligence only.",
  },
  "ai-command-center": {
    navLabel: "AI Command Center",
    sourceTag: "AI insights",
    badgeLabel: "AI decision layer",
    kind: "executive",
    bannerMessage: "What needs attention, why it matters, and recommended actions.",
  },
  "command-center": {
    navLabel: "Command Center",
    sourceTag: "Live · Breezy",
    badgeLabel: "Live operational data",
    kind: "live-breezy",
    bannerMessage:
      "KPIs and rankings come from Breezy HR (published jobs and candidates). Use Data sources below for cache diagnostics.",
  },
  overview: {
    navLabel: "Overview",
    sourceTag: "Breezy + demo",
    badgeLabel: "Mixed sources",
    kind: "mixed",
    bannerMessage:
      "KPIs and open jobs are from Breezy HR. Trend, pipeline, and new-hire charts are FY26 sample data for illustration only.",
  },
  "needs-attention": {
    navLabel: "Needs Attention",
    sourceTag: "Sheet workflow",
    badgeLabel: "Archive sheet workflow",
    kind: "archive-sheet",
    bannerMessage:
      "Queue and KPIs use the recruiting Google Sheet (CSV archive) — not Breezy ATS. For live applicants and jobs, use Candidates or Job Management.",
  },
  "dm-scorecards": {
    navLabel: "DM Scorecards",
    sourceTag: "Sheet + MEL",
    badgeLabel: "Sheet + MEL reference",
    kind: "archive-sheet",
    bannerMessage:
      "Open posts and applicants are counted from the recruiting sheet archive; MEL store-call demand comes from the MEL projects sheet.",
  },
  "live-sheet": {
    navLabel: "Recruiting Sheet",
    sourceTag: "Archive",
    badgeLabel: "Recruiting sheet (archive)",
    kind: "archive-sheet",
    bannerMessage:
      "Read-only mirror of the recruiting Google Sheet CSV export. Reference and reconciliation only — Breezy HR is the live ATS.",
  },
  candidates: {
    navLabel: "Candidates",
    sourceTag: "Live · Breezy",
    badgeLabel: "Live operational data",
    kind: "live-breezy",
    bannerMessage:
      "Candidate rows sync from Breezy HR. Workflow buckets are stored locally and keyed by Breezy candidate ID.",
  },
  "recruiter-productivity": {
    navLabel: "Recruiters",
    sourceTag: "Live · Breezy",
    badgeLabel: "Recruiter operations",
    kind: "live-breezy",
    bannerMessage:
      "KPIs, scorecards, aging, and daily tasks from Breezy candidates plus local recruiter workflow overlays.",
  },
  "territory-intelligence": {
    navLabel: "Territories",
    sourceTag: "Breezy + MEL",
    badgeLabel: "Territory intelligence",
    kind: "mixed",
    bannerMessage:
      "Per-DM coverage, applicant velocity, recruiter workload, and heat map signals from Breezy, MEL, and workflow overlays.",
  },
  notifications: {
    navLabel: "Notifications",
    sourceTag: "Automation engine",
    badgeLabel: "Proactive alerts",
    kind: "system",
    bannerMessage:
      "Centralized recruiter, DM, and executive notifications with read/dismiss tracking and automation rules.",
  },
  "mel-projects": {
    navLabel: "MEL Projects",
    sourceTag: "Live · MEL sheet",
    badgeLabel: "MEL sheet (live)",
    kind: "live-mel",
    bannerMessage:
      "Store-call demand from the MEL projects Google Sheet — separate from Breezy recruiting / ATS data.",
  },
  "data-health": {
    navLabel: "Data Health",
    sourceTag: "System checks",
    badgeLabel: "Integration diagnostics",
    kind: "system",
    bannerMessage:
      "Endpoint probes and parity tools for operators — not a recruiter workflow tab. Does not change live or archive data.",
  },
  "system-admin": {
    navLabel: "System Admin",
    sourceTag: "Admin · ops",
    badgeLabel: "Enterprise administration",
    kind: "system",
    bannerMessage:
      "User management, audit trail, integration status, data quality, deployment readiness, and demo mode controls.",
  },
  "recruiting-intelligence": {
    navLabel: "Analytics",
    sourceTag: "Mixed",
    badgeLabel: "Mixed sources",
    kind: "mixed",
    bannerMessage:
      "Summary KPIs and charts use Breezy when legacy sheet-live mode is off. Collapsed sections below may require recruiting sheet rows (archive).",
  },
  automation: {
    navLabel: "Automation",
    sourceTag: "Live · Breezy",
    badgeLabel: "Live operational data",
    kind: "live-breezy",
    bannerMessage:
      "Recommendations and alerts are computed from Breezy jobs and candidates plus local workflow state.",
  },
  "routing-intelligence": {
    navLabel: "Routing Intelligence",
    sourceTag: "MEL + reps",
    badgeLabel: "Territory routing (MEL)",
    kind: "live-mel",
    bannerMessage:
      "Route packs, travel burden, and store clusters use the MEL projects sheet and active rep roster — no live map APIs. All staffing actions are manual-only.",
  },
  workforce: {
    navLabel: "Workforce Ops",
    sourceTag: "MEL + reps",
    badgeLabel: "Workforce operations",
    kind: "mixed",
    bannerMessage:
      "Workforce operations center connects recruiting pipeline to MEL opportunities, rep roster, and execution outcomes.",
  },
  "placement-command-center": {
    navLabel: "Placement Center",
    sourceTag: "Breezy + MEL",
    badgeLabel: "Placement command center",
    kind: "mixed",
    bannerMessage:
      "Placement funnel, store coverage, fill forecasts, and recruiter/DM scorecards from Breezy candidates, MEL opportunities, and workflow overlays.",
  },
  "job-management": {
    navLabel: "Job Management",
    sourceTag: "Live · Breezy",
    badgeLabel: "Live operational data",
    kind: "live-breezy",
    bannerMessage:
      "Published jobs load from Breezy HR. Clone/push drafts are local until pushed to Breezy.",
  },
  "workforce-intelligence": {
    navLabel: "Workforce Intelligence",
    sourceTag: "Executive",
    badgeLabel: "Executive analytics",
    kind: "executive",
    bannerMessage: "Executive workforce analytics — separate from daily Breezy recruiting operations.",
  },
  "action-center": {
    navLabel: "Action Center",
    sourceTag: "Breezy + MEL",
    badgeLabel: "Operational actions",
    kind: "mixed",
    bannerMessage:
      "Prioritized action queue with territory playbooks, project risk, and workload engines. Recommendations only — no ATS or MEL write-back.",
  },
};

export function getRecruitingTabSource(tabId: DashboardTabId): RecruitingTabSourceMeta {
  return RECRUITING_TAB_SOURCE_BY_ID[tabId];
}
