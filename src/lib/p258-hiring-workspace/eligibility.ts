import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { PaperworkSendGate } from "@/lib/autonomous-paperwork-send-engine/types";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type {
  HiringEligibilityPanel,
  HiringEligibilityVerdict,
  HiringWorkspaceApplicantInput,
} from "@/lib/p258-hiring-workspace/types";

/**
 * Hard blockers — failing these means Blocked (not merely Needs Attention).
 * Aligned with production send gates in buildPaperworkSendEligibility.
 */
const HARD_BLOCK_GATE_IDS = new Set<PaperworkSendGate["id"]>([
  "valid_email",
  "no_duplicate",
  "not_signed",
  "not_rejected",
  "not_inactive",
]);

/**
 * Soft / remediable gates → Needs Attention when they are the only failures.
 */
const ATTENTION_GATE_IDS = new Set<PaperworkSendGate["id"]>([
  "recruiter_assigned",
  "paperwork_needed",
  "send_paperwork_action",
  "published_job",
  "template_ready",
  "automation_enabled",
]);

export function classifyEligibilityVerdict(gates: PaperworkSendGate[]): {
  verdict: HiringEligibilityVerdict;
  blockingReasons: string[];
  attentionReasons: string[];
} {
  const failed = gates.filter((gate) => !gate.passed);
  if (failed.length === 0) {
    return { verdict: "Eligible", blockingReasons: [], attentionReasons: [] };
  }

  const hard = failed.filter((gate) => HARD_BLOCK_GATE_IDS.has(gate.id));
  const soft = failed.filter((gate) => ATTENTION_GATE_IDS.has(gate.id));
  const other = failed.filter(
    (gate) => !HARD_BLOCK_GATE_IDS.has(gate.id) && !ATTENTION_GATE_IDS.has(gate.id),
  );

  const blockingReasons = [...hard, ...other].map((gate) => gate.detail ?? gate.label);
  const attentionReasons = soft.map((gate) => gate.detail ?? gate.label);

  if (hard.length > 0 || other.length > 0) {
    return { verdict: "Blocked", blockingReasons, attentionReasons };
  }
  return { verdict: "Needs Attention", blockingReasons: [], attentionReasons };
}

/**
 * Map production paperwork send eligibility into the Hiring Workspace panel.
 * Reuses buildPaperworkSendEligibility — does not invent divergent gate rules.
 */
export function mapProductionEligibility(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding?: CandidateOnboardingRecord | null;
  jobsByPositionId?: Map<string, BreezyJob>;
}): HiringEligibilityPanel {
  const result = buildPaperworkSendEligibility({
    row: input.row,
    onboarding: input.onboarding ?? null,
    jobsByPositionId: input.jobsByPositionId ?? new Map(),
  });
  const classified = classifyEligibilityVerdict(result.gates);
  return {
    verdict: classified.verdict,
    eligible: result.eligible,
    gates: result.gates,
    blockingReasons: classified.blockingReasons.length
      ? classified.blockingReasons
      : result.blockingReasons,
    attentionReasons: classified.attentionReasons,
    templateKey: result.templateKey,
  };
}

/**
 * Lightweight eligibility mapping when only workspace applicant fields are available.
 * Still evaluates the same production gate helper via a minimal ScoredCandidateWorkflowRow stub.
 */
export function mapEligibilityFromApplicantInput(
  applicant: HiringWorkspaceApplicantInput,
  options?: {
    jobsByPositionId?: Map<string, BreezyJob>;
    onboarding?: CandidateOnboardingRecord | null;
  },
): HiringEligibilityPanel {
  const stub = {
    candidateId: applicant.candidateId,
    firstName: applicant.firstName ?? "",
    lastName: applicant.lastName ?? "",
    email: applicant.email ?? "",
    phone: applicant.phone ?? "",
    source: applicant.source ?? "",
    stage: applicant.stage ?? "",
    appliedDate: applicant.appliedDate ?? "",
    createdDate: applicant.appliedDate ?? "",
    addedDate: applicant.appliedDate ?? "",
    updatedDate: applicant.updatedDate ?? "",
    addedDateSource: "p258",
    positionId: applicant.positionId,
    positionName: applicant.positionName ?? "",
    city: applicant.city ?? "",
    state: applicant.state ?? "",
    zipCode: applicant.zipCode ?? "",
    resumeText: "",
    hasResume: applicant.hasResume ?? false,
    workflowStatus: applicant.workflowStatus,
    assignedRecruiter: applicant.assignedRecruiter ?? "Unassigned",
    assignedDM: applicant.assignedDM ?? "Unassigned",
    paperworkStatus: applicant.paperworkStatus ?? "not_sent",
    paperworkTemplateKey: applicant.paperworkTemplateKey ?? null,
    signatureRequestId: applicant.signatureRequestId ?? null,
    paperworkSentAt: applicant.paperworkSentAt ?? null,
    paperworkSignedAt: applicant.paperworkSignedAt ?? null,
    paperworkViewedAt: applicant.paperworkViewedAt ?? null,
    paperworkError: applicant.paperworkError ?? null,
    actionType: (applicant.actionType as never) ?? null,
    lastActionAt: applicant.lastActionAt ?? null,
    nextActionNeeded: applicant.nextActionNeeded ?? "",
    notes: applicant.notes ?? [],
    history: applicant.history ?? [],
  } as ScoredCandidateWorkflowRow;

  return mapProductionEligibility({
    row: stub,
    onboarding: options?.onboarding ?? null,
    jobsByPositionId: options?.jobsByPositionId,
  });
}
