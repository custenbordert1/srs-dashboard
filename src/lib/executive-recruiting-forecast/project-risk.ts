import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ProjectCompletionRiskRow } from "@/lib/executive-recruiting-forecast/types";

/**
 * Project risk uses open opportunity clusters grouped by project number.
 * Assumes projects with many open calls and thin pipeline are at completion risk.
 */
export function buildProjectCompletionRisks(input: {
  opportunities: MelOpportunity[];
  pipelineByProject: Map<string, number>;
}): ProjectCompletionRiskRow[] {
  const byProject = new Map<
    string,
    {
      projectName: string;
      dmName: string;
      territoryLabel: string;
      openOpportunities: number;
    }
  >();

  for (const opp of input.opportunities.filter((row) => row.openStatus && !row.isStaffed)) {
    const key = opp.projectNo || opp.projectName;
    const entry = byProject.get(key) ?? {
      projectName: opp.projectName,
      dmName: opp.territoryOwner || "Unassigned",
      territoryLabel: opp.state,
      openOpportunities: 0,
    };
    entry.openOpportunities += 1;
    byProject.set(key, entry);
  }

  return [...byProject.entries()]
    .map(([projectNo, row]) => {
      const pipelineCandidates = input.pipelineByProject.get(projectNo) ?? 0;
      const gap = Math.max(0, row.openOpportunities - pipelineCandidates);
      const riskScore = Math.min(100, Math.round(gap * 18 + row.openOpportunities * 6));
      const reasons: string[] = [];
      if (gap >= 3) reasons.push("Open calls outpace pipeline candidates");
      if (pipelineCandidates === 0 && row.openOpportunities > 0) {
        reasons.push("No pipeline candidates linked to project");
      }
      if (row.openOpportunities >= 5) reasons.push("High open call volume");
      return {
        projectNo,
        projectName: row.projectName,
        dmName: row.dmName,
        territoryLabel: row.territoryLabel,
        riskScore,
        openOpportunities: row.openOpportunities,
        pipelineCandidates,
        nearestDeadlineDays: null,
        reasons: reasons.length > 0 ? reasons : ["Monitor project staffing pace"],
      };
    })
    .filter((row) => row.riskScore >= 35)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 20);
}
