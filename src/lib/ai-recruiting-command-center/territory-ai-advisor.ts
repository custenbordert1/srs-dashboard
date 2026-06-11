import type { CommandCenterDmInsightsSnapshot } from "@/lib/command-center-dm-insights";
import type { TerritoryIntelligenceCenterSnapshot } from "@/lib/territory-intelligence";
import type { TerritoryAiAdvisorEntry } from "@/lib/ai-recruiting-command-center/types";

export function buildTerritoryAiAdvisor(input: {
  dmInsights: CommandCenterDmInsightsSnapshot;
  territoryCenter: TerritoryIntelligenceCenterSnapshot;
}): TerritoryAiAdvisorEntry[] {
  const dmByName = new Map(input.territoryCenter.territories.map((row) => [row.dmName, row]));

  return input.dmInsights.territories.map((territory) => {
    const intel = dmByName.get(territory.dmName);
    const metrics = intel?.metrics;
    const recommendations = intel?.recommendations ?? [];

    const coverageRiskExplanation =
      territory.coveragePercent < 50
        ? `${territory.dmName} is in critical coverage territory at ${territory.coveragePercent}% — ${territory.openCalls} open calls with ${territory.activeReps} active reps.`
        : territory.coveragePercent < 70
          ? `${territory.dmName} coverage is below target (${territory.coveragePercent}%) with ${territory.openJobs} open jobs.`
          : `${territory.dmName} coverage is stable at ${territory.coveragePercent}% across ${territory.states.join(", ")}.`;

    const zeroJobs = metrics?.zeroApplicantJobs ?? 0;
    const lowFlow = metrics?.lowApplicantFlowJobs ?? 0;
    const applicantShortageExplanation =
      zeroJobs + lowFlow > 0
        ? `${zeroJobs} jobs have zero applicants and ${lowFlow} have low flow — applicant pipeline is thin in this territory.`
        : `Applicant velocity ${(metrics?.applicantVelocity.delta ?? 0) >= 0 ? "+" : ""}${metrics?.applicantVelocity.delta ?? 0} vs prior week.`;

    const recommendedActions =
      recommendations.length > 0
        ? recommendations.slice(0, 4).map((row) => row.message)
        : territory.coveragePercent < 70
          ? ["Increase sourcing in under-covered states.", "Review rep assignments for open MEL calls."]
          : ["Maintain current coverage cadence.", "Monitor zero-applicant job postings weekly."];

    const predictedIssues: string[] = [];
    if (metrics && metrics.coverageRiskScore >= 60) {
      predictedIssues.push(`Coverage risk score ${metrics.coverageRiskScore} — staffing gaps likely within 2 weeks.`);
    }
    if (metrics && metrics.recruiterWorkloadScore >= 75) {
      predictedIssues.push("Recruiter workload is elevated — follow-up delays may increase.");
    }
    if (metrics && metrics.applicantVelocity.delta < -10) {
      predictedIssues.push("Applicant velocity is declining — expect slower fills unless sourcing improves.");
    }
    if (predictedIssues.length === 0) {
      predictedIssues.push("No major issues predicted in the next 14 days based on current signals.");
    }

    return {
      dmName: territory.dmName,
      coverageRiskExplanation,
      applicantShortageExplanation,
      recommendedActions,
      predictedIssues,
      attentionScore: territory.attentionScore,
    };
  });
}
