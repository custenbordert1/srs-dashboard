import { formatCandidateDisplayName } from "@/lib/candidate-display-name";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildPaperworkAutoEligibility } from "@/lib/autonomous-paperwork-engine/paperwork-lifecycle";
import { resolveAutonomousOnboardingState } from "@/lib/autonomous-onboarding-engine/state-machine";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type {
  CandidateOrchestrationSnapshot,
  OrchestratorEngineId,
  OrchestratorRiskLevel,
  OrchestratorWorkflowStage,
} from "@/lib/autonomous-recruiting-orchestrator/types";

const MS_PER_HOUR = 60 * 60 * 1000;

function hoursSince(iso: string | null | undefined, referenceMs: number): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return (referenceMs - parsed) / MS_PER_HOUR;
}

export function resolveOrchestratorWorkflowStage(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
}): OrchestratorWorkflowStage {
  const { row, onboarding } = input;

  if (row.workflowStatus === "Not Qualified" || onboarding?.status === "declined") {
    return "blocked";
  }

  if (row.workflowStatus === "Active Rep") {
    return "workflow_complete";
  }

  const onboardingState = resolveAutonomousOnboardingState({
    candidateId: row.candidateId,
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    onboardingStatus: onboarding?.status ?? null,
  });

  if (onboardingState === "ready_for_work" || onboardingState === "assigned") {
    return "ready_for_work";
  }

  if (
    ["welcome_prepared", "training_assigned", "training_in_progress", "training_complete", "paperwork_signed"].includes(
      onboardingState,
    )
  ) {
    return "onboarding";
  }

  if (row.paperworkSentAt && !row.paperworkSignedAt) {
    return "communication";
  }

  if (
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.workflowStatus === "Paperwork Sent" ||
    row.workflowStatus === "Signed"
  ) {
    if (!row.paperworkSignedAt && row.paperworkSentAt) return "communication";
    if (row.paperworkSignedAt) return "onboarding";
    return "paperwork";
  }

  const paperworkReady =
    row.workflowStatus === "Paperwork Needed" ||
    row.workflowStatus === "Qualified" ||
    Boolean(row.actionGeneratedAt && row.paperworkStatus === "not_sent");

  if (paperworkReady && !row.paperworkSentAt) {
    return "paperwork";
  }

  if (row.actionGeneratedAt && !isUnassignedRecruiter(row.assignedRecruiter ?? "")) {
    return "recruiter_approval";
  }

  if (row.aiGrade || row.resumeKeywordScore != null) {
    return "candidate_intelligence";
  }

  return "applied";
}

export function resolveResponsibleEngine(stage: OrchestratorWorkflowStage): OrchestratorEngineId {
  switch (stage) {
    case "coverage_need":
    case "applied":
    case "candidate_intelligence":
      return "recruiting_intelligence";
    case "recruiter_approval":
      return "recruiting_intelligence";
    case "paperwork":
      return "paperwork_intelligence";
    case "communication":
      return "communication";
    case "onboarding":
    case "ready_for_work":
      return "onboarding";
    case "workflow_complete":
      return "executive";
    case "blocked":
      return "recruiting_intelligence";
  }
}

function resolveRiskLevel(input: {
  row: ScoredCandidateWorkflowRow;
  stage: OrchestratorWorkflowStage;
  referenceMs: number;
}): OrchestratorRiskLevel {
  const { row, stage, referenceMs } = input;
  if (stage === "blocked") return "critical";
  if (row.paperworkError) return "high";

  const waitingHours = hoursSince(row.paperworkSentAt ?? row.lastActionAt, referenceMs);
  if (waitingHours != null && waitingHours >= 72) return "high";
  if (waitingHours != null && waitingHours >= 48) return "medium";

  if (stage === "recruiter_approval" && row.actionDueDate && Date.parse(row.actionDueDate) < referenceMs) {
    return "medium";
  }

  return "low";
}

function resolveNextAction(stage: OrchestratorWorkflowStage, row: ScoredCandidateWorkflowRow): string {
  switch (stage) {
    case "applied":
      return "Run candidate intelligence and grade assignment";
    case "candidate_intelligence":
      return "Complete screening and recruiter review";
    case "recruiter_approval":
      return row.actionType ? `Recruiter action: ${row.actionType}` : "Await recruiter approval";
    case "paperwork":
      return "Prepare and send onboarding paperwork";
    case "communication":
      return row.paperworkSignedAt ? "Send onboarding communications" : "Send signature reminders";
    case "onboarding":
      return "Complete onboarding steps and training";
    case "ready_for_work":
      return "Confirm Ready for Work and assign project";
    case "workflow_complete":
      return "Monitor active representative";
    case "blocked":
      return "Resolve disqualification or failure";
    case "coverage_need":
      return "Address market coverage gap";
  }
}

function resolveBlockers(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  policy: CandidateOnboardingPolicy;
  stage: OrchestratorWorkflowStage;
}): string[] {
  const blockers: string[] = [];
  const { row, onboarding, policy, stage } = input;

  if (!row.email?.trim()) blockers.push("Candidate email missing");
  if (isUnassignedRecruiter(row.assignedRecruiter ?? "")) blockers.push("Recruiter not assigned");

  if (stage === "paperwork") {
    const eligibility = buildPaperworkAutoEligibility({ row, onboarding, policy });
    blockers.push(...eligibility.missingReasons);
  }

  if (row.paperworkError) blockers.push(`Paperwork error: ${row.paperworkError}`);
  if (onboarding?.status === "failed") blockers.push("Onboarding packet failed");

  return [...new Set(blockers)];
}

function estimateCompletion(stage: OrchestratorWorkflowStage, referenceMs: number): string | null {
  const hoursByStage: Partial<Record<OrchestratorWorkflowStage, number>> = {
    applied: 24,
    candidate_intelligence: 48,
    recruiter_approval: 72,
    paperwork: 96,
    communication: 120,
    onboarding: 168,
    ready_for_work: 24,
  };
  const hours = hoursByStage[stage];
  if (hours == null) return null;
  return new Date(referenceMs + hours * MS_PER_HOUR).toISOString();
}

export function buildCandidateOrchestrationSnapshot(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  policy: CandidateOnboardingPolicy;
  referenceMs: number;
}): CandidateOrchestrationSnapshot {
  const stage = resolveOrchestratorWorkflowStage({ row: input.row, onboarding: input.onboarding });
  const blockers = resolveBlockers({
    row: input.row,
    onboarding: input.onboarding,
    policy: input.policy,
    stage,
  });

  const paperworkEligibility = buildPaperworkAutoEligibility({
    row: input.row,
    onboarding: input.onboarding,
    policy: input.policy,
  });

  const automationEligible =
    stage !== "blocked" &&
    stage !== "recruiter_approval" &&
    blockers.length === 0 &&
    (stage === "paperwork" ? paperworkEligibility.eligible : stage !== "workflow_complete");

  return {
    candidateId: input.row.candidateId,
    candidateName: formatCandidateDisplayName(input.row),
    workflowStage: stage,
    workflowStatus: input.row.workflowStatus,
    blockers,
    nextAction: resolveNextAction(stage, input.row),
    responsibleEngine: resolveResponsibleEngine(stage),
    automationEligible,
    automationEligibilityReason: automationEligible
      ? `Stage "${stage}" is eligible for preview automation via ${resolveResponsibleEngine(stage)}.`
      : blockers.length > 0
        ? `Blocked: ${blockers.slice(0, 2).join("; ")}`
        : `Stage "${stage}" requires human action.`,
    estimatedCompletionAt: estimateCompletion(stage, input.referenceMs),
    riskLevel: resolveRiskLevel({ row: input.row, stage, referenceMs: input.referenceMs }),
    recruiter: input.row.assignedRecruiter ?? "Unassigned",
    districtManager: input.row.assignedDM || input.row.suggestedDM || null,
  };
}
