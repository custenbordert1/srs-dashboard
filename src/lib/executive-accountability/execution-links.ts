import type { ExecutiveForecastRecommendation } from "@/lib/executive-recruiting-forecast/types";

export type AccountabilityExecutionLink = {
  href: string;
  label: string;
};

export const ACCOUNTABILITY_EXECUTION_LINKS: AccountabilityExecutionLink[] = [
  { href: "/?tab=job-management", label: "Open Job Management" },
  { href: "/?tab=candidates", label: "Open Candidate Queue" },
  { href: "/?tab=mel-projects", label: "Open Territory Intelligence" },
  { href: "/?tab=data-health", label: "Open Coverage Optimization" },
  { href: "/?tab=candidates", label: "Open Recruiter Action Center" },
];

export function accountabilityExecutionLinksForKind(
  kind: ExecutiveForecastRecommendation["kind"] | string | undefined,
): AccountabilityExecutionLink[] {
  const primary = ACCOUNTABILITY_EXECUTION_LINKS.filter((link) => {
    if (kind === "refresh-job-ads" || kind === "increase-pay") {
      return link.label.includes("Job Management");
    }
    if (kind === "prioritize-candidates" || kind === "move-recruiter-focus" || kind === "pipeline-bottleneck") {
      return link.label.includes("Candidate") || link.label.includes("Recruiter");
    }
    if (kind === "escalate-dm-territory") {
      return link.label.includes("Territory") || link.label.includes("Coverage");
    }
    return true;
  });
  return primary.length > 0 ? primary : ACCOUNTABILITY_EXECUTION_LINKS;
}
