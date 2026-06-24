/**
 * P65.3 read-only readiness audit — MTD funnel stages and paperwork eligibility.
 * No writes, no Dropbox Sign, no policy/run/onboarding mutations.
 * Usage: npx tsx scripts/p65-3-readiness-audit.ts
 */
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { isFollowUpOverdue } from "@/lib/candidate-action-sla";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { countEligibleForPaperwork, isEligibleForSend } from "@/lib/candidate-onboarding-engine";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { isGradeAllowedForPaperwork } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { countPromotablePaperworkFunnel } from "@/lib/candidate-onboarding-engine/promote-paperwork-funnel";
import type { AiLetterGrade } from "@/lib/candidate-ai-scoring";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";

const TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Ready for MEL",
]);

const INTERVIEW_COMPLETED_STATUSES = new Set<CandidateWorkflowStatus>([
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
]);

type ExclusionReason =
  | "no_recruiter"
  | "missing_p63_action"
  | "terminal_status"
  | "missing_job_match"
  | "missing_contact"
  | "existing_packet"
  | "already_signed"
  | "wrong_action_type"
  | "grade_blocked"
  | "other";

type NearMissCandidate = {
  candidateId: string;
  name: string;
  workflowStatus: CandidateWorkflowStatus;
  actionType: string;
  requiredAction: string | null;
  exclusionReason: ExclusionReason;
};

function hasActivePacket(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" ||
        row.paperworkStatus === "viewed" ||
        row.workflowStatus === "Paperwork Sent"),
  );
}

/** Mirrors P65.3 `isEligibleForSend` in build-onboarding-decisions.ts */
function isPaperworkEligible(
  row: ScoredCandidateWorkflowRow,
  policy: Awaited<ReturnType<typeof loadCandidateOnboardingPolicy>>,
): boolean {
  return isEligibleForSend(row, policy);
}

function exclusionReason(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, unknown>,
  policy: Awaited<ReturnType<typeof loadCandidateOnboardingPolicy>>,
): ExclusionReason {
  if (isUnassignedRecruiter(row.assignedRecruiter)) return "no_recruiter";
  if (!row.actionGeneratedAt) return "missing_p63_action";
  if (TERMINAL_STATUSES.has(row.workflowStatus)) return "terminal_status";
  if (!hasPublishedJobMatch(row, jobsByPositionId)) return "missing_job_match";
  if (hasActivePacket(row)) return "existing_packet";
  if (!row.email?.trim()) return "missing_contact";
  if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") return "already_signed";
  if (!isGradeAllowedForPaperwork(row.aiGrade, policy.paperworkByGrade)) return "grade_blocked";
  const actionType = row.actionType ?? "none";
  if (actionType !== "send-paperwork" && actionType !== "await-signature") return "wrong_action_type";
  return "other";
}

function isFollowUpCompleted(row: ScoredCandidateWorkflowRow): boolean {
  if (isUnassignedRecruiter(row.assignedRecruiter)) return false;
  return (
    !row.recruitingActions.needsFollowUp &&
    !isFollowUpOverdue({
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
    })
  );
}

function hasPublishedJobMatch(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, unknown>,
): boolean {
  return Boolean(row.positionId?.trim() && jobsByPositionId.has(row.positionId));
}

function isNearMissPaperworkNeeded(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, unknown>,
  policy: Awaited<ReturnType<typeof loadCandidateOnboardingPolicy>>,
): boolean {
  if (isPaperworkEligible(row, policy)) return false;
  if (row.workflowStatus !== "Paperwork Needed") return false;
  if (isUnassignedRecruiter(row.assignedRecruiter)) return false;
  if (!row.actionGeneratedAt) return false;
  if (TERMINAL_STATUSES.has(row.workflowStatus)) return false;
  if (hasActivePacket(row)) return false;
  if (row.paperworkStatus === "signed") return false;
  if (!row.email?.trim()) return false;
  if (!hasPublishedJobMatch(row, jobsByPositionId)) return false;
  const actionType = row.actionType ?? "none";
  return actionType !== "send-paperwork";
}

async function main() {
  const [store, bundle, jobsResult, policy] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    loadCandidateOnboardingPolicy(),
  ]);
  const jobsByPositionId = new Map((jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]));
  const scored = filterMtdCandidates(listIngestedCandidates(store)).map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  const stageCounts = {
    mtdTotal: scored.length,
    assigned: 0,
    p63ActionGenerated: 0,
    followUpCompleted: 0,
    interviewCompleted: 0,
    paperworkEligible: 0,
    activePacket: 0,
    signedPacket: 0,
    readyForMel: 0,
  };

  const exclusionCounts: Record<ExclusionReason, number> = {
    no_recruiter: 0,
    missing_p63_action: 0,
    terminal_status: 0,
    missing_job_match: 0,
    missing_contact: 0,
    existing_packet: 0,
    already_signed: 0,
    wrong_action_type: 0,
    grade_blocked: 0,
    other: 0,
  };

  const gradeDistribution: Partial<Record<AiLetterGrade, number>> = {};
  const workflowStatusCounts: Partial<Record<CandidateWorkflowStatus, number>> = {};
  let sendPaperworkActionCount = 0;

  const nearMissPaperworkNeeded: NearMissCandidate[] = [];

  for (const row of scored) {
    gradeDistribution[row.aiGrade] = (gradeDistribution[row.aiGrade] ?? 0) + 1;
    workflowStatusCounts[row.workflowStatus] = (workflowStatusCounts[row.workflowStatus] ?? 0) + 1;
    if (row.actionType === "send-paperwork") sendPaperworkActionCount += 1;

    if (!isUnassignedRecruiter(row.assignedRecruiter)) stageCounts.assigned += 1;
    if (row.actionGeneratedAt) stageCounts.p63ActionGenerated += 1;
    if (isFollowUpCompleted(row)) stageCounts.followUpCompleted += 1;
    if (INTERVIEW_COMPLETED_STATUSES.has(row.workflowStatus)) stageCounts.interviewCompleted += 1;
    if (isPaperworkEligible(row, policy)) stageCounts.paperworkEligible += 1;
    if (hasActivePacket(row)) stageCounts.activePacket += 1;
    if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") stageCounts.signedPacket += 1;
    if (row.workflowStatus === "Ready for MEL" || row.workflowStatus === "Loaded in MEL") {
      stageCounts.readyForMel += 1;
    }

    if (!isPaperworkEligible(row, policy)) {
      exclusionCounts[exclusionReason(row, jobsByPositionId, policy)] += 1;
    }

    if (isNearMissPaperworkNeeded(row, jobsByPositionId, policy)) {
      nearMissPaperworkNeeded.push({
        candidateId: row.candidateId,
        name: `${row.firstName} ${row.lastName}`.trim() || row.candidateId,
        workflowStatus: row.workflowStatus,
        actionType: row.actionType ?? "none",
        requiredAction: row.requiredAction ?? null,
        exclusionReason: exclusionReason(row, jobsByPositionId, policy),
      });
    }
  }

  const engineEligible = countEligibleForPaperwork(scored, policy);
  const funnelPromotable = countPromotablePaperworkFunnel(scored, policy);
  const logicMatchesEngine = engineEligible === stageCounts.paperworkEligible;

  const verdict =
    logicMatchesEngine &&
    nearMissPaperworkNeeded.length === 0 &&
    stageCounts.paperworkEligible >= 0
      ? stageCounts.paperworkEligible === 0 &&
          stageCounts.interviewCompleted === 0 &&
          stageCounts.activePacket === 0
        ? "PASS — P65.3 logic matches engine; zero eligible reflects current MTD funnel (no interview-complete/paperwork-stage candidates)."
        : "PASS — P65.3 logic matches engine; eligible candidates align with live MTD data."
      : nearMissPaperworkNeeded.length > 0
        ? "FAIL — Paperwork Needed candidates blocked by action-type gate; review P63/P65.3 alignment before commit."
        : "FAIL — Audit mirror diverges from engine eligibility count; investigate before commit.";

  console.log(
    JSON.stringify(
      {
        stageCounts,
        exclusionCounts,
        gradeDistribution,
        workflowStatusCounts,
        sendPaperworkActionCount,
        paperworkPolicyByGrade: policy.paperworkByGrade,
        funnelPromotionEnabled: policy.funnelPromotion.enabled,
        funnelPromotable,
        paperworkEligible: stageCounts.paperworkEligible,
        engineEligible,
        logicMatchesEngine,
        nearMissPaperworkNeeded,
        recommendation: verdict,
      },
      null,
      2,
    ),
  );
}

void main();
