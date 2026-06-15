import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isMelReadyStatus } from "@/lib/candidate-action-sla";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { isHiredStage, parseDate } from "@/lib/dm-dashboard/territory-shared";
import type { RecruiterPlacementScorecardRow } from "@/lib/placement-command-center/types";

const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;

export function buildRecruiterPlacementScorecard(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
  fetchedAt: string;
}): RecruiterPlacementScorecardRow[] {
  const referenceMs = Date.parse(input.fetchedAt);
  const groups = new Map<string, BreezyCandidate[]>();

  for (const candidate of input.candidates) {
    const row = buildBaselineWorkflowRow(candidate, input.workflows?.[candidate.candidateId]);
    const recruiter = row.assignedRecruiter?.trim() || "Unassigned";
    if (recruiter === "Unassigned") continue;
    const list = groups.get(recruiter) ?? [];
    list.push(candidate);
    groups.set(recruiter, list);
  }

  return [...groups.entries()]
    .map(([recruiterName, rows]) => {
      let placements = 0;
      let melReadyCount = 0;
      let projectCompletions = 0;
      const durations: number[] = [];

      for (const candidate of rows) {
        const row = buildBaselineWorkflowRow(candidate, input.workflows?.[candidate.candidateId]);
        if (isMelReadyStatus(row.workflowStatus)) melReadyCount += 1;
        if (
          row.workflowStatus === "Loaded in MEL" ||
          row.workflowStatus === "Active Rep" ||
          isHiredStage(candidate.stage)
        ) {
          placements += 1;
        }
        if (row.workflowStatus === "Active Rep") projectCompletions += 1;

        const applied = parseDate(candidate.appliedDate);
        const placedAt = parseDate(row.lastActionAt ?? candidate.updatedDate);
        if (applied && placedAt && (row.workflowStatus === "Active Rep" || isHiredStage(candidate.stage))) {
          durations.push(Math.max(0, Math.round((placedAt.getTime() - applied.getTime()) / (24 * 60 * 60 * 1000))));
        }
      }

      const recentPlacements = rows.filter((candidate) => {
        const row = buildBaselineWorkflowRow(candidate, input.workflows?.[candidate.candidateId]);
        const anchor = parseDate(row.lastActionAt ?? candidate.updatedDate);
        if (!anchor) return false;
        return referenceMs - anchor.getTime() <= MS_30_DAYS && isHiredStage(candidate.stage);
      }).length;

      const conversionRatePercent =
        rows.length > 0 ? Math.round((placements / rows.length) * 100) : 0;
      const avgTimeToPlacementDays =
        durations.length > 0
          ? Math.round(durations.reduce((sum, days) => sum + days, 0) / durations.length)
          : null;
      const score = Math.min(
        100,
        placements * 6 + melReadyCount * 3 + conversionRatePercent * 0.4 + recentPlacements * 4,
      );

      return {
        recruiterName,
        placements,
        conversionRatePercent,
        avgTimeToPlacementDays,
        melReadyCount,
        projectCompletions,
        score: Math.round(score),
      };
    })
    .sort((a, b) => b.score - a.score || b.placements - a.placements)
    .slice(0, 25);
}
