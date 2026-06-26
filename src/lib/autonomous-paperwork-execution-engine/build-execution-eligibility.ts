import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { buildPaperworkAutoEligibility } from "@/lib/autonomous-paperwork-engine/paperwork-lifecycle";
import type {
  P71FeatureFlags,
  PaperworkExecutionEligibilityRequirement,
  PaperworkExecutionEligibilityResult,
} from "@/lib/autonomous-paperwork-execution-engine/types";
import { resolveEffectiveExecutionMode } from "@/lib/autonomous-paperwork-execution-engine/pilot-filters";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import {
  isOnboardingTemplateKey,
  type OnboardingTemplateKey,
} from "@/lib/onboarding-template-registry";

const WITHDRAWN_HINTS = ["withdrawn", "rejected", "disqualified", "archived", "declined"];

function isWithdrawnOrCancelled(row: ScoredCandidateWorkflowRow): boolean {
  const status = `${row.workflowStatus} ${row.stage}`.toLowerCase();
  return WITHDRAWN_HINTS.some((hint) => status.includes(hint));
}

function resolveTemplateKey(row: ScoredCandidateWorkflowRow): OnboardingTemplateKey | null {
  const fromRow = row.paperworkTemplateKey;
  if (fromRow && isOnboardingTemplateKey(fromRow)) return fromRow;
  return "onboarding_packet";
}

export function buildPaperworkExecutionEligibility(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
}): PaperworkExecutionEligibilityResult {
  const base = buildPaperworkAutoEligibility({
    row: input.row,
    onboarding: input.onboarding,
    policy: input.policy,
  });

  const requirements: PaperworkExecutionEligibilityRequirement[] = base.requirements.map((row) => ({
    id: row.id,
    label: row.label,
    complete: row.complete,
    blocking: row.blocking,
    detail: row.detail,
  }));

  const templateKey = resolveTemplateKey(input.row);
  const templateOk = templateKey != null;
  requirements.push({
    id: "template_identified",
    label: "Correct paperwork template identified",
    complete: templateOk,
    blocking: true,
    detail: templateOk ? null : "No Dropbox Sign template could be resolved for this candidate.",
  });

  const notWithdrawn = !isWithdrawnOrCancelled(input.row);
  requirements.push({
    id: "not_withdrawn",
    label: "Candidate not withdrawn",
    complete: notWithdrawn,
    blocking: true,
    detail: notWithdrawn ? null : "Candidate appears withdrawn or disqualified.",
  });

  const notCancelled =
    input.onboarding?.status !== "declined" && input.row.paperworkStatus !== "declined";
  requirements.push({
    id: "not_cancelled",
    label: "Candidate not cancelled",
    complete: notCancelled,
    blocking: true,
    detail: notCancelled ? null : "Paperwork was declined or cancelled.",
  });

  const automationEnabled = input.flags.automationEnabled && input.flags.executionMode !== "off";
  requirements.push({
    id: "automation_enabled",
    label: "Automation enabled",
    complete: automationEnabled,
    blocking: true,
    detail: automationEnabled ? null : "Paperwork automation is disabled (default safe mode).",
  });

  const duplicateReason = duplicatePaperworkSendBlockReason({
    workflow: {
      candidateId: input.row.candidateId,
      paperworkStatus: input.row.paperworkStatus,
      workflowStatus: input.row.workflowStatus,
      signatureRequestId: input.row.signatureRequestId,
    } as never,
    activeOnboarding: input.onboarding,
  });
  if (duplicateReason) {
    const existing = requirements.find((row) => row.id === "no_duplicate");
    if (existing) {
      existing.complete = false;
      existing.detail = duplicateReason;
    }
  }

  const effectiveExecutionMode = resolveEffectiveExecutionMode({
    row: input.row,
    flags: input.flags,
  });

  const blockingReasons = requirements
    .filter((row) => row.blocking && !row.complete)
    .map((row) => row.detail ?? row.label);

  const eligible = base.eligible && blockingReasons.length === 0;

  return {
    candidateId: input.row.candidateId,
    eligible,
    status: eligible ? "ready_for_execution" : "manual_review",
    requirements,
    blockingReasons,
    templateKey,
    effectiveExecutionMode,
  };
}
