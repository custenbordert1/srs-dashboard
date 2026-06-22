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
  | "workforce"
  | "job-management"
  | "workforce-intelligence"
  | "executive-home"
  | "executive-forecasting"
  | "executive-accountability";

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
  "recruiting-intelligence": {
    navLabel: "Recruiting Intelligence",
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
  workforce: {
    navLabel: "Workforce",
    sourceTag: "Rep roster",
    badgeLabel: "Imported rep data",
    kind: "live-workforce",
    bannerMessage:
      "Rep import, geocoding, and staffing models use workforce CSV / local store — not Breezy candidate or job APIs.",
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
  "executive-home": {
    navLabel: "Executive Home",
    sourceTag: "Executive",
    badgeLabel: "Company overview",
    kind: "executive",
    bannerMessage:
      "Nationwide KPIs, ATS health, territory risk, recruiting alerts, and accountability — your primary executive landing.",
  },
  "executive-forecasting": {
    navLabel: "Executive Forecast",
    sourceTag: "Executive",
    badgeLabel: "Forecasting & capacity",
    kind: "executive",
    bannerMessage:
      "30/60/90-day hiring forecast, recruiter/DM capacity, and territory shortage outlook from cached Breezy + MEL intelligence.",
  },
  "executive-accountability": {
    navLabel: "Executive Accountability",
    sourceTag: "Executive",
    badgeLabel: "Operating rhythm",
    kind: "executive",
    bannerMessage:
      "Monday executive packet, overdue escalation, audit center, and durable P44 recommendation tracking.",
  },
};

export function getRecruitingTabSource(tabId: DashboardTabId): RecruitingTabSourceMeta {
  return RECRUITING_TAB_SOURCE_BY_ID[tabId];
}
