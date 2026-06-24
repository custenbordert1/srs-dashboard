import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CoverageStatus, TerritoryCoverageNeed } from "@/lib/autonomous-recruiting-engine/types";
import type { CandidateOnboardingPolicy, CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import {
  classifyPaperworkStage,
  detectPaperworkDrift,
  resolveAgeInStageHours,
} from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import type { PaperworkApprovalStatus } from "@/lib/executive-paperwork-dashboard/types";
import { scoreApprovalPriority } from "@/lib/approval-queue-command-center/score-approval-priority";
import {
  APPROVAL_QUEUE_AGING_BUCKET_ORDER,
  type ApprovalQueueAgingBucket,
  type ApprovalQueueAgingBucketId,
  type ApprovalQueueCandidateRow,
  type ApprovalQueueCommandCenter,
  type ApprovalQueueExecutiveSummary,
  type ApprovalQueueRecruiterGroup,
  type ApprovalQueueRecruiterRollup,
} from "@/lib/approval-queue-command-center/types";

type OnboardingRecordWithApproval = CandidateOnboardingRecord & {
  approvalStatus?: PaperworkApprovalStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  approvalReason?: string | null;
};

function candidateDisplayName(row: ScoredCandidateWorkflowRow): string {
  const parts = [row.firstName, row.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : row.candidateId;
}

function pickActiveOnboardingRecord(
  records: CandidateOnboardingRecord[],
  candidateId: string,
): CandidateOnboardingRecord | null {
  const forCandidate = records.filter((record) => record.candidateId === candidateId);
  if (forCandidate.length === 0) return null;

  const active = forCandidate.find(
    (record) =>
      record.status !== "failed" &&
      record.status !== "declined" &&
      record.status !== "expired",
  );
  return active ?? forCandidate[0] ?? null;
}

function resolvePositionUrgency(
  row: ScoredCandidateWorkflowRow,
  coverageNeeds: TerritoryCoverageNeed[],
): CoverageStatus {
  const state = normalizeStateCode(row.state ?? "");
  const dm = getDmForState(state) ?? "Unassigned";
  const need = coverageNeeds.find((entry) => entry.dmName === dm || entry.states.includes(state));
  return need?.coverageStatus ?? "Healthy";
}

function resolveAgingBucket(ageHours: number | null): ApprovalQueueAgingBucketId {
  if (ageHours == null) return "0-24h";
  if (ageHours >= 72) return "72h+";
  if (ageHours >= 48) return "48-72h";
  if (ageHours >= 24) return "24-48h";
  return "0-24h";
}

function buildAgingBuckets(rows: ApprovalQueueCandidateRow[]): ApprovalQueueAgingBucket[] {
  const counts = new Map<ApprovalQueueAgingBucketId, number>(
    APPROVAL_QUEUE_AGING_BUCKET_ORDER.map((id) => [id, 0]),
  );

  for (const row of rows) {
    const bucket = resolveAgingBucket(row.queueAgeHours);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const labels: Record<ApprovalQueueAgingBucketId, string> = {
    "0-24h": "0–24h",
    "24-48h": "24–48h",
    "48-72h": "48–72h",
    "72h+": "72h+",
  };

  return APPROVAL_QUEUE_AGING_BUCKET_ORDER.map((id) => ({
    id,
    label: labels[id],
    count: counts.get(id) ?? 0,
  }));
}

function buildRecruiterRollups(rows: ApprovalQueueCandidateRow[]): ApprovalQueueRecruiterRollup[] {
  const byRecruiter = new Map<
    string,
    { queueCount: number; ages: number[]; highPriorityCount: number; oldestAgeHours: number | null }
  >();

  for (const row of rows) {
    const key = row.recruiter.trim() || "Unassigned";
    const existing = byRecruiter.get(key) ?? {
      queueCount: 0,
      ages: [],
      highPriorityCount: 0,
      oldestAgeHours: null,
    };
    existing.queueCount += 1;
    if (row.queueAgeHours != null) existing.ages.push(row.queueAgeHours);
    if (row.priority === "high") existing.highPriorityCount += 1;
    if (row.queueAgeHours != null) {
      existing.oldestAgeHours =
        existing.oldestAgeHours == null
          ? row.queueAgeHours
          : Math.max(existing.oldestAgeHours, row.queueAgeHours);
    }
    byRecruiter.set(key, existing);
  }

  return [...byRecruiter.entries()]
    .map(([recruiter, stats]) => ({
      recruiter,
      queueCount: stats.queueCount,
      averageAgeHours:
        stats.ages.length > 0
          ? Math.round(stats.ages.reduce((sum, age) => sum + age, 0) / stats.ages.length)
          : null,
      highPriorityCount: stats.highPriorityCount,
      oldestAgeHours: stats.oldestAgeHours,
    }))
    .sort((a, b) => b.queueCount - a.queueCount || a.recruiter.localeCompare(b.recruiter));
}

function buildBottlenecks(
  rollups: ApprovalQueueRecruiterRollup[],
  rows: ApprovalQueueCandidateRow[],
): string[] {
  const bottlenecks: string[] = [];
  const unassigned = rollups.find((row) => row.recruiter === "Unassigned");
  if (unassigned && unassigned.queueCount >= 10) {
    bottlenecks.push(`${unassigned.queueCount} approvals waiting with no assigned recruiter`);
  }

  for (const rollup of rollups.filter((row) => row.queueCount >= 20)) {
    bottlenecks.push(
      `${rollup.recruiter}: ${rollup.queueCount} in queue (${rollup.highPriorityCount} high priority)`,
    );
  }

  const driftCount = rows.filter((row) => row.hasDrift).length;
  if (driftCount > 0) {
    bottlenecks.push(`${driftCount} candidates with workflow/onboarding store drift`);
  }

  const aging72 = rows.filter((row) => (row.queueAgeHours ?? 0) >= 72).length;
  if (aging72 > 0) {
    bottlenecks.push(`${aging72} approvals aging 72h+ in queue`);
  }

  return bottlenecks.slice(0, 6);
}

function groupByRecruiter(rows: ApprovalQueueCandidateRow[]): ApprovalQueueRecruiterGroup[] {
  const groups = new Map<string, ApprovalQueueCandidateRow[]>();
  for (const row of rows) {
    const key = row.recruiter.trim() || "Unassigned";
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([recruiter, candidates]) => ({
      recruiter,
      candidates: candidates.sort((a, b) => b.priorityScore - a.priorityScore),
    }))
    .sort((a, b) => b.candidates.length - a.candidates.length || a.recruiter.localeCompare(b.recruiter));
}

function buildExecutiveSummary(
  rows: ApprovalQueueCandidateRow[],
  rollups: ApprovalQueueRecruiterRollup[],
): ApprovalQueueExecutiveSummary {
  return {
    totalQueue: rows.length,
    highPriorityCount: rows.filter((row) => row.priority === "high").length,
    mediumPriorityCount: rows.filter((row) => row.priority === "medium").length,
    lowPriorityCount: rows.filter((row) => row.priority === "low").length,
    byRecruiter: rollups,
    agingBuckets: buildAgingBuckets(rows),
    bottlenecks: buildBottlenecks(rollups, rows),
  };
}

export function buildApprovalQueueCommandCenter(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  coverageNeeds?: TerritoryCoverageNeed[];
  fetchedAt?: string;
}): ApprovalQueueCommandCenter {
  const referenceMs = Date.parse(input.fetchedAt ?? new Date().toISOString());
  const coverageNeeds = input.coverageNeeds ?? [];
  const queueRows: ApprovalQueueCandidateRow[] = [];

  const approvalQueueCounts = new Map<string, number>();
  const preliminaryRows: Array<{
    row: ScoredCandidateWorkflowRow;
    onboarding: CandidateOnboardingRecord | null;
  }> = [];

  for (const candidate of input.candidates) {
    const onboarding = pickActiveOnboardingRecord(input.onboardingRecords, candidate.candidateId);
    const stage = classifyPaperworkStage({ row: candidate, onboarding });
    if (stage !== "approvalQueue") continue;
    preliminaryRows.push({ row: candidate, onboarding });
    const recruiterKey = candidate.assignedRecruiter.trim() || "Unassigned";
    approvalQueueCounts.set(recruiterKey, (approvalQueueCounts.get(recruiterKey) ?? 0) + 1);
  }

  for (const { row, onboarding } of preliminaryRows) {
    const stageInput = { row, onboarding };
    const drift = detectPaperworkDrift(stageInput);
    const queueAgeHours = resolveAgeInStageHours("approvalQueue", stageInput, referenceMs);
    const recruiterKey = row.assignedRecruiter.trim() || "Unassigned";
    const scored = scoreApprovalPriority({
      row,
      queueAgeHours,
      positionUrgency: resolvePositionUrgency(row, coverageNeeds),
      recruiterQueueCount: approvalQueueCounts.get(recruiterKey) ?? 1,
      hasDrift: drift.hasDrift,
    });

    const extended = onboarding as OnboardingRecordWithApproval | null;
    const approvalStatus: PaperworkApprovalStatus | null =
      extended?.approvalStatus ??
      (input.policy.send.requireApproval ? "pending" : null);

    queueRows.push({
      candidateId: row.candidateId,
      candidateName: candidateDisplayName(row),
      email: row.email?.trim() || null,
      recruiter: recruiterKey,
      positionName: row.positionName ?? "—",
      positionId: row.positionId ?? "",
      grade: row.aiGrade,
      confidenceScore: scored.confidenceScore,
      queueAgeHours,
      positionUrgency: resolvePositionUrgency(row, coverageNeeds),
      priority: scored.priority,
      priorityScore: scored.priorityScore,
      priorityReasons: scored.priorityReasons,
      exceptionFlags: scored.exceptionFlags,
      onboardingId: onboarding?.onboardingId ?? null,
      workflowStatus: row.workflowStatus,
      hasDrift: drift.hasDrift,
      driftReason: drift.driftReason,
      approvalStatus,
      approvedBy: extended?.approvedBy ?? null,
      approvedAt: extended?.approvedAt ?? null,
      approvalReason: extended?.approvalReason ?? null,
    });
  }

  const sortedRows = queueRows.sort((a, b) => b.priorityScore - a.priorityScore);
  const recruiterRollups = buildRecruiterRollups(sortedRows);

  return {
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    scope: "mtd",
    readOnly: true,
    executiveSummary: buildExecutiveSummary(sortedRows, recruiterRollups),
    recruiterRollups,
    candidatesByRecruiter: groupByRecruiter(sortedRows),
    highPriority: sortedRows.filter((row) => row.priority === "high"),
    mediumPriority: sortedRows.filter((row) => row.priority === "medium"),
    lowPriority: sortedRows.filter((row) => row.priority === "low"),
  };
}
