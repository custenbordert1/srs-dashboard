import type { DistrictManager } from "@/lib/dm-territory-map";
import type { TerritoryIntelligenceTerritoryRow } from "@/lib/territory-intelligence";
import type { TerritoryPlaybook } from "@/lib/territory-action-engine/types";

const PLAYBOOK_LIMIT = 12;

function territoryLabel(states: string[]): string {
  if (states.length === 0) return "Territory";
  if (states.length <= 3) return states.join(", ");
  return `${states.slice(0, 2).join(", ")} +${states.length - 2}`;
}

function buildPlaybookSteps(
  row: TerritoryIntelligenceTerritoryRow,
): TerritoryPlaybook["recommendedActions"] {
  const metrics = row.metrics;
  const steps: TerritoryPlaybook["recommendedActions"] = [];
  let order = 1;

  if (metrics.zeroApplicantJobs > 0) {
    const adCount = Math.min(20, Math.max(3, metrics.zeroApplicantJobs * 2));
    steps.push({
      order: order++,
      action: `Refresh ${adCount} ads in zero-applicant markets`,
      automationKind: "create-job-ad",
    });
  }

  if (metrics.coveragePercent < 70) {
    const inactiveEstimate = Math.max(2, Math.round((100 - metrics.coveragePercent) / 12));
    steps.push({
      order: order++,
      action: `Contact ${inactiveEstimate} inactive reps to recover coverage`,
    });
  }

  if (metrics.recruiterWorkloadScore >= 70) {
    steps.push({
      order: order++,
      action: "Reassign recruiter workload across territory owners",
      automationKind: "assign-recruiter",
    });
  }

  if (metrics.coverageRiskScore >= 60) {
    steps.push({
      order: order++,
      action: "Increase pay rate review for understaffed markets",
    });
  }

  if (metrics.coveragePercent < 50 || metrics.coverageRiskScore >= 75) {
    steps.push({
      order: order++,
      action: "Escalate to DM with coverage recovery plan",
      automationKind: "create-dm-escalation",
    });
  }

  if (metrics.applicantVelocity.direction === "down") {
    steps.push({
      order: order++,
      action: "Audit sourcing channels and boost applicant velocity",
    });
  }

  if (steps.length === 0) {
    steps.push({
      order: 1,
      action: "Monitor territory KPIs weekly and confirm rep assignments",
    });
  }

  return steps.slice(0, 5);
}

function problemStatement(row: TerritoryIntelligenceTerritoryRow): string {
  const metrics = row.metrics;
  if (metrics.coveragePercent < 40) {
    return `Coverage risk ${metrics.coverageRiskScore} — ${metrics.coveragePercent}% staffed`;
  }
  if (metrics.zeroApplicantJobs > 0) {
    return `${metrics.zeroApplicantJobs} published jobs with zero applicants`;
  }
  if (metrics.recruiterWorkloadScore >= 75) {
    return `Recruiter workload score ${metrics.recruiterWorkloadScore} exceeds sustainable threshold`;
  }
  return `Territory attention score ${row.attentionScore} requires intervention`;
}

function whyItMatters(row: TerritoryIntelligenceTerritoryRow): string {
  const metrics = row.metrics;
  const parts: string[] = [];
  if (metrics.openCalls > 0) {
    parts.push(`${metrics.openCalls} open store calls depend on timely staffing`);
  }
  if (metrics.coveragePercent < 60) {
    parts.push("Low coverage increases client SLA risk and rep burnout");
  }
  if (metrics.zeroApplicantJobs > 0) {
    parts.push("Zero-applicant jobs stall the hiring funnel before recruiters can act");
  }
  if (metrics.applicantVelocity.direction === "down") {
    parts.push("Declining applicant velocity signals sourcing fatigue");
  }
  return parts.length > 0
    ? parts.join(". ")
    : "Unresolved territory friction compounds into missed fills and escalations.";
}

export function buildTerritoryPlaybooks(
  territories: TerritoryIntelligenceTerritoryRow[],
): TerritoryPlaybook[] {
  return territories
    .filter((row) => row.attentionScore >= 35 || row.metrics.coverageRiskScore >= 50)
    .map((row) => ({
      id: `playbook:${row.dmName}`,
      dmName: row.dmName as DistrictManager,
      territoryLabel: territoryLabel(row.states),
      problem: problemStatement(row),
      whyItMatters: whyItMatters(row),
      impactScore: row.attentionScore,
      recommendedActions: buildPlaybookSteps(row),
    }))
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, PLAYBOOK_LIMIT);
}
