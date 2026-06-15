import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isMelReadyStatus, isPaperworkPendingStatus } from "@/lib/candidate-action-sla";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { isHiredStage } from "@/lib/dm-dashboard/territory-shared";
import { calendarDaysSince } from "@/lib/candidate-action-sla";
import type { PlacementFunnelStageId, PlacementFunnelStageRow } from "@/lib/placement-command-center/types";

const STAGE_ORDER: PlacementFunnelStageId[] = [
  "applied",
  "reviewed",
  "contacted",
  "paperwork",
  "signed",
  "ready-for-mel",
  "placed",
  "completed-first-project",
];

const STAGE_LABELS: Record<PlacementFunnelStageId, string> = {
  applied: "Applied",
  reviewed: "Reviewed",
  contacted: "Contacted",
  paperwork: "Paperwork",
  signed: "Signed",
  "ready-for-mel": "Ready For MEL",
  placed: "Placed",
  "completed-first-project": "Completed First Project",
};

function resolveFunnelStage(
  candidate: BreezyCandidate,
  workflows: CandidateWorkflowState | null,
): PlacementFunnelStageId {
  const row = buildBaselineWorkflowRow(candidate, workflows?.[candidate.candidateId]);
  if (row.workflowStatus === "Active Rep") return "completed-first-project";
  if (row.workflowStatus === "Loaded in MEL" || isHiredStage(candidate.stage)) return "placed";
  if (isMelReadyStatus(row.workflowStatus)) return "ready-for-mel";
  if (row.workflowStatus === "Signed" || row.paperworkStatus === "signed") return "signed";
  if (isPaperworkPendingStatus(row.workflowStatus)) return "paperwork";
  if (row.lastActionAt || row.history.length > 0 || row.recruitingActions.needsFollowUp) {
    return "contacted";
  }
  if (row.workflowStatus === "Needs Review" || row.workflowStatus === "Qualified") {
    return "reviewed";
  }
  return "applied";
}

function avgDaysForStage(
  candidates: BreezyCandidate[],
  workflows: CandidateWorkflowState | null,
  stage: PlacementFunnelStageId,
  referenceMs: number,
): number | null {
  const days: number[] = [];
  for (const candidate of candidates) {
    if (resolveFunnelStage(candidate, workflows) !== stage) continue;
    const row = buildBaselineWorkflowRow(candidate, workflows?.[candidate.candidateId]);
    const anchor = row.lastActionAt ?? candidate.appliedDate;
    const d = calendarDaysSince(anchor, referenceMs);
    if (d !== null) days.push(d);
  }
  if (days.length === 0) return null;
  return Math.round(days.reduce((sum, value) => sum + value, 0) / days.length);
}

export function buildPlacementFunnel(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
  fetchedAt: string;
}): PlacementFunnelStageRow[] {
  const referenceMs = Date.parse(input.fetchedAt);
  const counts = new Map<PlacementFunnelStageId, number>();
  for (const stage of STAGE_ORDER) counts.set(stage, 0);

  for (const candidate of input.candidates) {
    const stage = resolveFunnelStage(candidate, input.workflows);
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }

  return STAGE_ORDER.map((id, index) => {
    const count = counts.get(id) ?? 0;
    const nextCount = index < STAGE_ORDER.length - 1 ? (counts.get(STAGE_ORDER[index + 1]!) ?? 0) : null;
    const conversionPercent =
      nextCount !== null && count > 0 ? Math.round((nextCount / count) * 100) : null;
    const dropOffPercent =
      conversionPercent !== null ? Math.max(0, 100 - conversionPercent) : null;
    const avgDays = avgDaysForStage(input.candidates, input.workflows, id, referenceMs);

    let trend: PlacementFunnelStageRow["trend"] = "flat";
    if (avgDays !== null) {
      if (avgDays >= 7) trend = "down";
      else if (avgDays <= 2) trend = "up";
    }

    return {
      id,
      label: STAGE_LABELS[id],
      count,
      conversionPercent,
      dropOffPercent,
      avgDaysInStage: avgDays,
      trend,
    };
  });
}
