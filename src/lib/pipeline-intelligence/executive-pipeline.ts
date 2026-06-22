import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { calendarDaysSince } from "@/lib/candidate-action-sla";
import { buildFunnelTransitionMetrics } from "@/lib/pipeline-intelligence/funnel-conversion";
import { buildRecruiterPipelinePerformance } from "@/lib/pipeline-intelligence/recruiter-performance";
import { severityRank } from "@/lib/pipeline-intelligence/bottleneck-engine";
import type {
  ExecutivePipelineHealth,
  PipelineBottleneck,
  TerritoryPipelineFunnel,
} from "@/lib/pipeline-intelligence/types";
import { dmForCandidate, stageAtOrBeyond } from "@/lib/pipeline-intelligence/territory-funnel";
import {
  isActivePipelineCandidate,
  mapToCanonicalPipelineStage,
} from "@/lib/pipeline-intelligence/stage-mapping";

type TerritoryScoreRow = {
  territoryLabel: string;
  dmName: string;
  conversionPct: number;
  avgDaysToMel: number | null;
  mostActiveRecruiter: string | null;
};

function buildTerritoryScoreRows(input: {
  territories: TerritoryPipelineFunnel[];
  candidates: ScoredCandidateWorkflowRow[];
  referenceMs: number;
}): TerritoryScoreRow[] {
  const recruiterRows = buildRecruiterPipelinePerformance(input.candidates, input.referenceMs);

  return input.territories
    .filter((territory) => territory.totalActive > 0)
    .map((territory) => {
      const territoryCandidates = input.candidates.filter(
        (row) => dmForCandidate(row) === territory.dmName && isActivePipelineCandidate(row),
      );
      const transitions = buildFunnelTransitionMetrics(territoryCandidates, input.referenceMs);
      const appliedToMel =
        transitions.find((row) => row.id === "mel-active")?.conversionPct ??
        transitions.find((row) => row.id === "paperwork-mel")?.conversionPct ??
        0;

      const melDays: number[] = [];
      for (const row of territoryCandidates) {
        const stage = mapToCanonicalPipelineStage(row);
        if (!stageAtOrBeyond(stage, "Ready for MEL")) continue;
        const days = calendarDaysSince(row.appliedDate, input.referenceMs);
        if (days !== null) melDays.push(days);
      }
      const avgDaysToMel =
        melDays.length > 0
          ? Math.round((melDays.reduce((sum, value) => sum + value, 0) / melDays.length) * 10) / 10
          : null;

      const recruiterByTerritory = recruiterRows
        .filter((row) => row.recruiter !== "Unassigned")
        .map((row) => {
          const touches = input.candidates.filter(
            (candidate) =>
              candidate.assignedRecruiter.trim() === row.recruiter &&
              dmForCandidate(candidate) === territory.dmName,
          ).length;
          return { recruiter: row.recruiter, touches };
        })
        .sort((a, b) => b.touches - a.touches);

      return {
        territoryLabel: territory.territoryLabel,
        dmName: territory.dmName,
        conversionPct: appliedToMel,
        avgDaysToMel,
        mostActiveRecruiter: recruiterByTerritory[0]?.recruiter ?? null,
      };
    });
}

export function buildExecutivePipelineHealth(input: {
  territories: TerritoryPipelineFunnel[];
  bottlenecks: PipelineBottleneck[];
  candidates: ScoredCandidateWorkflowRow[];
  recruiters: ReturnType<typeof buildRecruiterPipelinePerformance>;
  referenceMs?: number;
}): ExecutivePipelineHealth {
  const referenceMs = input.referenceMs ?? Date.now();
  const territoryScores = buildTerritoryScoreRows({
    territories: input.territories,
    candidates: input.candidates,
    referenceMs,
  });

  const bestConversionTerritories = [...territoryScores]
    .sort(
      (a, b) =>
        b.conversionPct - a.conversionPct ||
        (a.avgDaysToMel ?? 999) - (b.avgDaysToMel ?? 999),
    )
    .slice(0, 5);

  const worstConversionTerritories = [...territoryScores]
    .sort(
      (a, b) =>
        a.conversionPct - b.conversionPct ||
        (b.avgDaysToMel ?? 0) - (a.avgDaysToMel ?? 0),
    )
    .slice(0, 5);

  const fastestTimeToMel = territoryScores
    .filter((row) => row.avgDaysToMel !== null)
    .sort((a, b) => (a.avgDaysToMel ?? 999) - (b.avgDaysToMel ?? 999))
    .slice(0, 5)
    .map((row) => ({
      territoryLabel: row.territoryLabel,
      dmName: row.dmName,
      avgDaysToMel: row.avgDaysToMel!,
      conversionPct: row.conversionPct,
    }));

  const topBottleneckTerritories = input.territories
    .filter((territory) => territory.topBottleneck)
    .map((territory) => ({
      territoryLabel: territory.territoryLabel,
      dmName: territory.dmName,
      bottleneck: territory.topBottleneck!,
    }))
    .sort(
      (a, b) =>
        severityRank(b.bottleneck.severity) - severityRank(a.bottleneck.severity) ||
        b.bottleneck.count - a.bottleneck.count,
    )
    .slice(0, 5);

  const recruitersNeedingHelp = input.recruiters
    .filter((row) => row.recruiter !== "Unassigned" && row.candidatesWaiting > 0)
    .sort(
      (a, b) =>
        b.candidatesWaiting - a.candidatesWaiting ||
        a.conversionPct - b.conversionPct ||
        (b.avgResponseDays ?? 0) - (a.avgResponseDays ?? 0),
    )
    .slice(0, 5)
    .map((row) => ({
      recruiter: row.recruiter,
      candidatesWaiting: row.candidatesWaiting,
      assigned: row.assigned,
      conversionPct: row.conversionPct,
      avgResponseDays: row.avgResponseDays,
    }));

  return {
    topBottlenecks: input.bottlenecks.slice(0, 8),
    topBottleneckTerritories,
    bestConversionTerritories,
    worstConversionTerritories,
    fastestTimeToMel,
    recruitersNeedingHelp,
    bestTerritories: bestConversionTerritories,
  };
}

export function overallConversionToMel(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): number {
  const transitions = buildFunnelTransitionMetrics(candidates, referenceMs);
  return transitions.find((row) => row.id === "mel-active")?.conversionPct ?? 0;
}
