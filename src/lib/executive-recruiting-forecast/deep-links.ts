import type { ExecutiveForecastRecommendation } from "@/lib/executive-recruiting-forecast/types";

export type ForecastNavigationTarget =
  | "candidates"
  | "job-management"
  | "mel-projects"
  | "recruiting-intelligence"
  | "executive-forecasting";

export type ForecastDeepLink = {
  href: string;
  label: string;
};

export const FORECAST_QUICK_LINKS: ForecastDeepLink[] = [
  { href: "/?tab=candidates", label: "Open Candidates" },
  { href: "/?tab=candidates", label: "Open Recruiter Action Center" },
  { href: "/?tab=job-management", label: "Open Job Management" },
  { href: "/?tab=mel-projects", label: "Open Territory Intelligence" },
];

export function dashboardTabHref(tab: ForecastNavigationTarget): string {
  return `/?tab=${tab}`;
}

export function recommendationDeepLink(rec: ExecutiveForecastRecommendation): ForecastDeepLink {
  switch (rec.kind) {
    case "refresh-job-ads":
      return { href: dashboardTabHref("job-management"), label: "Open Job Management" };
    case "prioritize-candidates":
    case "move-recruiter-focus":
      return { href: dashboardTabHref("candidates"), label: "Open Candidates" };
    case "escalate-dm-territory":
      return { href: dashboardTabHref("mel-projects"), label: "Open Territory Intelligence" };
    case "increase-pay":
      return { href: dashboardTabHref("job-management"), label: "Review jobs & pay" };
    case "automation":
      return { href: dashboardTabHref("recruiting-intelligence"), label: "Open Recruiting Intelligence" };
    default:
      return { href: dashboardTabHref("executive-forecasting"), label: "View forecast" };
  }
}

export function projectRiskDeepLink(): ForecastDeepLink {
  return { href: dashboardTabHref("candidates"), label: "Prioritize candidates" };
}
