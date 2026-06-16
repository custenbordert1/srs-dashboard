import {
  calendarDaysSince,
  isFollowUpOverdue,
} from "@/lib/candidate-action-sla";
import { buildScopedCandidateRows } from "@/lib/recruiter-operating-system/build-scoped-rows";
import type {
  PipelineBottleneck,
  PipelineStageBucket,
  RecruiterOperatingSystemScope,
} from "@/lib/recruiter-operating-system/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

const STUCK_DAYS = 7;
const HIGH_VALUE_MATCH = 75;

export function detectPipelineBottlenecks(stages: PipelineStageBucket[]): PipelineBottleneck[] {
  const bottlenecks: PipelineBottleneck[] = [];

  for (const stage of stages) {
    if (stage.stuckCount >= 3 || stage.followUpGapCount >= 2) {
      const severity =
        stage.stuckCount >= 5 || stage.followUpGapCount >= 4
          ? "high"
          : stage.stuckCount >= 3
            ? "medium"
            : "low";
      bottlenecks.push({
        id: `bottleneck:${stage.stage}`,
        stage: stage.stage,
        label: `${stage.stage} bottleneck`,
        severity,
        stuckCandidates: stage.stuckCount,
        avgDaysInStage: stage.avgDaysInStage,
        detail: `${stage.stuckCount} stuck · ${stage.followUpGapCount} follow-up gaps · ${stage.highValueCount} high-value`,
      });
    }
  }

  return bottlenecks.sort((a, b) => {
    const severityRank = { high: 0, medium: 1, low: 2 };
    return severityRank[a.severity] - severityRank[b.severity] || b.stuckCandidates - a.stuckCandidates;
  });
}

export function buildPipelineHealth(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  scope: RecruiterOperatingSystemScope;
  referenceMs: number;
}): {
  stages: PipelineStageBucket[];
  bottlenecks: PipelineBottleneck[];
  totalCandidates: number;
} {
  const rows = buildScopedCandidateRows(input.bundle, input.scope);
  const byStage = new Map<string, ReturnType<typeof buildScopedCandidateRows>>();

  for (const row of rows) {
    const bucket = byStage.get(row.workflowStatus) ?? [];
    bucket.push(row);
    byStage.set(row.workflowStatus, bucket);
  }

  const stages: PipelineStageBucket[] = [...byStage.entries()].map(([stage, scoped]) => {
    const daysInStage = scoped.map((row) => calendarDaysSince(row.lastActionAt ?? row.appliedDate, input.referenceMs) ?? 0);
    const avgDaysInStage =
      daysInStage.length > 0
        ? Math.round((daysInStage.reduce((sum, value) => sum + value, 0) / daysInStage.length) * 10) / 10
        : 0;
    const stuckCount = scoped.filter((row) => (calendarDaysSince(row.lastActionAt ?? row.appliedDate, input.referenceMs) ?? 0) >= STUCK_DAYS).length;
    const followUpGapCount = scoped.filter((row) =>
      isFollowUpOverdue({
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        referenceMs: input.referenceMs,
      }) || row.recruitingActions.needsFollowUp,
    ).length;
    const highValueCount = scoped.filter((row) => (row.matchPercent ?? 0) >= HIGH_VALUE_MATCH).length;
    const advanced = scoped.filter((row) =>
      ["Paperwork Sent", "Signed", "Ready for MEL", "Active Rep"].includes(row.workflowStatus),
    ).length;

    return {
      stage,
      count: scoped.length,
      avgDaysInStage,
      conversionRatePercent: scoped.length > 0 ? Math.round((advanced / scoped.length) * 100) : null,
      stuckCount,
      followUpGapCount,
      highValueCount,
    };
  });

  stages.sort((a, b) => b.count - a.count);
  const bottlenecks = detectPipelineBottlenecks(stages);

  return {
    stages,
    bottlenecks,
    totalCandidates: rows.length,
  };
}
