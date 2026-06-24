import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingPolicy, CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  classifyPaperworkStage,
  detectPaperworkDrift,
  resolveAgeInStageHours,
  resolveExceptionReason,
} from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import {
  EXECUTIVE_PAPERWORK_STAGE_LABELS,
  EXECUTIVE_PAPERWORK_STAGE_ORDER,
  type ApprovalQueueRecruiterRollup,
  type ExecutivePaperworkCandidateRow,
  type ExecutivePaperworkDashboard,
  type ExecutivePaperworkKpiStrip,
  type ExecutivePaperworkStageCard,
  type ExecutivePaperworkStageId,
  type PaperworkApprovalStatus,
} from "@/lib/executive-paperwork-dashboard/types";

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

function deriveApprovalFields(
  stage: ExecutivePaperworkStageId,
  onboarding: OnboardingRecordWithApproval | null,
  policy: CandidateOnboardingPolicy,
): Pick<
  ExecutivePaperworkCandidateRow,
  "approvalStatus" | "approvedBy" | "approvedAt" | "approvalReason"
> {
  if (onboarding?.approvalStatus) {
    return {
      approvalStatus: onboarding.approvalStatus,
      approvedBy: onboarding.approvedBy ?? null,
      approvedAt: onboarding.approvedAt ?? null,
      approvalReason: onboarding.approvalReason ?? null,
    };
  }

  if (stage === "approvalQueue" && policy.send.requireApproval) {
    return {
      approvalStatus: "pending",
      approvedBy: null,
      approvedAt: null,
      approvalReason: null,
    };
  }

  if (!policy.send.requireApproval && stage !== "approvalQueue") {
    return {
      approvalStatus: "not_required",
      approvedBy: null,
      approvedAt: null,
      approvalReason: null,
    };
  }

  return {
    approvalStatus: null,
    approvedBy: null,
    approvedAt: null,
    approvalReason: null,
  };
}

function buildCandidateRow(
  row: ScoredCandidateWorkflowRow,
  onboarding: CandidateOnboardingRecord | null,
  policy: CandidateOnboardingPolicy,
  referenceMs: number,
): ExecutivePaperworkCandidateRow | null {
  const stageInput = { row, onboarding };
  const stage = classifyPaperworkStage(stageInput);
  if (!stage) return null;

  const drift = detectPaperworkDrift(stageInput);
  const approval = deriveApprovalFields(stage, onboarding as OnboardingRecordWithApproval | null, policy);

  return {
    candidateId: row.candidateId,
    candidateName: candidateDisplayName(row),
    email: row.email?.trim() || null,
    recruiter: row.assignedRecruiter,
    stage,
    ageInStageHours: resolveAgeInStageHours(stage, stageInput, referenceMs),
    signatureRequestId: row.signatureRequestId ?? onboarding?.signatureRequestId ?? null,
    exceptionReason: resolveExceptionReason(stage, stageInput),
    onboardingId: onboarding?.onboardingId ?? null,
    onboardingStatus: onboarding?.status ?? null,
    workflowPaperworkStatus: row.paperworkStatus,
    workflowStatus: row.workflowStatus,
    hasDrift: drift.hasDrift,
    driftReason: drift.driftReason,
    sourceOfTruth: drift.sourceOfTruth,
    ...approval,
  };
}

function buildApprovalQueueRecruiterRollup(rows: ExecutivePaperworkCandidateRow[]): ApprovalQueueRecruiterRollup[] {
  const byRecruiter = new Map<string, { count: number; oldestAgeHours: number | null }>();

  for (const row of rows.filter((entry) => entry.stage === "approvalQueue")) {
    const key = row.recruiter.trim() || "Unassigned";
    const existing = byRecruiter.get(key) ?? { count: 0, oldestAgeHours: null };
    existing.count += 1;
    if (row.ageInStageHours != null) {
      existing.oldestAgeHours =
        existing.oldestAgeHours == null
          ? row.ageInStageHours
          : Math.max(existing.oldestAgeHours, row.ageInStageHours);
    }
    byRecruiter.set(key, existing);
  }

  return [...byRecruiter.entries()]
    .map(([recruiter, stats]) => ({
      recruiter,
      count: stats.count,
      oldestAgeHours: stats.oldestAgeHours,
    }))
    .sort((a, b) => b.count - a.count || a.recruiter.localeCompare(b.recruiter));
}

function buildKpiStrip(
  mtdCandidates: number,
  rows: ExecutivePaperworkCandidateRow[],
  policy: CandidateOnboardingPolicy,
): ExecutivePaperworkKpiStrip {
  const countByStage = (stage: ExecutivePaperworkStageId) =>
    rows.filter((row) => row.stage === stage).length;

  return {
    mtdCandidates,
    inPipeline: rows.length,
    approvalQueue: countByStage("approvalQueue"),
    sent: countByStage("sent"),
    viewed: countByStage("viewed"),
    signed: countByStage("signed"),
    failed: countByStage("failed"),
    expired: countByStage("expired"),
    awaitingRecruiterAction: countByStage("awaitingRecruiterAction"),
    driftCount: rows.filter((row) => row.hasDrift).length,
    policyRequireApproval: policy.send.requireApproval,
  };
}

function buildStageCards(rows: ExecutivePaperworkCandidateRow[]): ExecutivePaperworkStageCard[] {
  return EXECUTIVE_PAPERWORK_STAGE_ORDER.map((id) => {
    const stageRows = rows
      .filter((row) => row.stage === id)
      .sort((a, b) => (b.ageInStageHours ?? 0) - (a.ageInStageHours ?? 0));
    return {
      id,
      label: EXECUTIVE_PAPERWORK_STAGE_LABELS[id],
      count: stageRows.length,
      rows: stageRows,
    };
  });
}

export function buildExecutivePaperworkDashboard(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  fetchedAt?: string;
}): ExecutivePaperworkDashboard {
  const referenceMs = Date.parse(input.fetchedAt ?? new Date().toISOString());
  const rows: ExecutivePaperworkCandidateRow[] = [];

  for (const candidate of input.candidates) {
    const onboarding = pickActiveOnboardingRecord(input.onboardingRecords, candidate.candidateId);
    const row = buildCandidateRow(candidate, onboarding, input.policy, referenceMs);
    if (row) rows.push(row);
  }

  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const approvalQueueRows = rows.filter((row) => row.stage === "approvalQueue");

  return {
    fetchedAt,
    scope: "mtd",
    kpiStrip: buildKpiStrip(input.candidates.length, rows, input.policy),
    stages: buildStageCards(rows),
    approvalQueueRecruiterRollup: buildApprovalQueueRecruiterRollup(approvalQueueRows),
    driftRows: rows.filter((row) => row.hasDrift),
  };
}
