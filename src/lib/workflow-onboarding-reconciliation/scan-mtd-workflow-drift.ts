import type { BreezyCandidate } from "@/lib/breezy-api";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { detectPaperworkDrift } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import {
  onboardingStatusRank,
  workflowPaperworkRank,
} from "@/lib/workflow-onboarding-reconciliation/workflow-durability";

export type MtdDriftCategory =
  | "onboarding_ahead_paperwork_not_sent"
  | "signature_request_id_mismatch"
  | "recruiter_assignment_clobber"
  | "onboarding_advanced_workflow_regressed"
  | "workflow_advanced_onboarding_regressed";

export type MtdDriftEntry = {
  candidateId: string;
  categories: MtdDriftCategory[];
  reasons: string[];
};

export type MtdWorkflowDriftScan = {
  scannedAt: string;
  mtdCandidateCount: number;
  driftCount: number;
  categoryBreakdown: Record<MtdDriftCategory, number>;
  entries: MtdDriftEntry[];
};

function pickActiveOnboarding(
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

const ONBOARDING_AHEAD_STATUSES = new Set<CandidateOnboardingRecord["status"]>([
  "sent",
  "viewed",
  "partially_completed",
  "completed",
  "ready_for_mel",
]);

const WORKFLOW_ADVANCED_PAPERWORK = new Set(["sent", "viewed", "signed"]);
const ONBOARDING_REGRESSED_STATUSES = new Set<CandidateOnboardingRecord["status"]>([
  "draft",
  "pending_approval",
]);

export function scanMtdWorkflowDrift(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  onboardingRecords: CandidateOnboardingRecord[];
  scannedAt?: string;
}): MtdWorkflowDriftScan {
  const categoryBreakdown: Record<MtdDriftCategory, number> = {
    onboarding_ahead_paperwork_not_sent: 0,
    signature_request_id_mismatch: 0,
    recruiter_assignment_clobber: 0,
    onboarding_advanced_workflow_regressed: 0,
    workflow_advanced_onboarding_regressed: 0,
  };

  const entries: MtdDriftEntry[] = [];

  for (const candidate of input.candidates) {
    const workflow = input.workflows[candidate.candidateId];
    const onboarding = pickActiveOnboarding(input.onboardingRecords, candidate.candidateId);
    const row = buildScoredWorkflowRow(candidate, workflow);
    const categories = new Set<MtdDriftCategory>();
    const reasons: string[] = [];

    if (
      onboarding &&
      ONBOARDING_AHEAD_STATUSES.has(onboarding.status) &&
      row.paperworkStatus === "not_sent" &&
      row.workflowStatus !== "Paperwork Sent" &&
      row.workflowStatus !== "Signed"
    ) {
      categories.add("onboarding_ahead_paperwork_not_sent");
      reasons.push(
        `onboarding is ${onboarding.status} but workflow paperwork is ${row.paperworkStatus} (${row.workflowStatus})`,
      );
    }

    if (onboarding?.signatureRequestId) {
      if (!row.signatureRequestId) {
        categories.add("signature_request_id_mismatch");
        reasons.push("onboarding has signatureRequestId but workflow does not");
      } else if (row.signatureRequestId !== onboarding.signatureRequestId) {
        categories.add("signature_request_id_mismatch");
        reasons.push("signature request IDs differ between workflow and onboarding");
      }
    }

    if (
      workflow &&
      isUnassignedRecruiter(workflow.assignedRecruiter) &&
      workflow.recruiterAssignmentSource === "auto" &&
      Boolean(workflow.recruiterAssignmentReason?.trim())
    ) {
      categories.add("recruiter_assignment_clobber");
      reasons.push("workflow shows Unassigned but retains auto-assignment metadata (likely clobbered)");
    }

    if (onboarding && workflow) {
      const onboardingRank = onboardingStatusRank(onboarding.status);
      const workflowRank = workflowPaperworkRank(workflow);
      if (onboardingRank >= 2 && workflowRank < onboardingRank) {
        categories.add("onboarding_advanced_workflow_regressed");
        reasons.push(
          `onboarding rank ${onboardingRank} (${onboarding.status}) ahead of workflow rank ${workflowRank}`,
        );
      }
    }

    if (
      onboarding &&
      ONBOARDING_REGRESSED_STATUSES.has(onboarding.status) &&
      (WORKFLOW_ADVANCED_PAPERWORK.has(row.paperworkStatus) ||
        row.workflowStatus === "Paperwork Sent" ||
        row.workflowStatus === "Signed")
    ) {
      categories.add("workflow_advanced_onboarding_regressed");
      reasons.push(
        `workflow advanced (${row.paperworkStatus}/${row.workflowStatus}) but onboarding is ${onboarding.status}`,
      );
    }

    const dashboardDrift = detectPaperworkDrift({ row, onboarding });
    if (dashboardDrift.hasDrift && dashboardDrift.driftReason) {
      for (const category of categories) {
        void category;
      }
      if (!reasons.includes(dashboardDrift.driftReason)) {
        reasons.push(dashboardDrift.driftReason);
      }
    }

    if (categories.size === 0) continue;

    for (const category of categories) {
      categoryBreakdown[category] += 1;
    }
    entries.push({
      candidateId: candidate.candidateId,
      categories: [...categories],
      reasons,
    });
  }

  return {
    scannedAt: input.scannedAt ?? new Date().toISOString(),
    mtdCandidateCount: input.candidates.length,
    driftCount: entries.length,
    categoryBreakdown,
    entries,
  };
}
