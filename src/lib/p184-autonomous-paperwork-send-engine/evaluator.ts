import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  isOnboardingTemplateKey,
  type OnboardingTemplateKey,
} from "@/lib/onboarding-template-registry";
import type {
  P184EligibilityGate,
  P184EligibilityResult,
  P184EngineConfig,
  P184QueueItem,
} from "@/lib/p184-autonomous-paperwork-send-engine/types";

const ARCHIVED_HINTS = ["archived", "withdrawn", "rejected", "disqualified"];
const HIRED_STATUSES = new Set(["Active Rep", "Loaded in MEL", "Ready for MEL", "Hired"]);
const OPT_OUT_HINTS = ["opt out", "opt-out", "opted out", "do not contact", "unsubscribe"];
const SUPPRESSION_HINTS = ["suppress", "suppressed", "hold paperwork", "do not send"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function gate(
  id: P184EligibilityGate["id"],
  label: string,
  passed: boolean,
  detail: string | null = null,
): P184EligibilityGate {
  return { id, label, passed, detail };
}

function resolveTemplateKey(row: ScoredCandidateWorkflowRow): OnboardingTemplateKey {
  const fromRow = row.paperworkTemplateKey;
  if (fromRow && isOnboardingTemplateKey(fromRow)) return fromRow;
  return "onboarding_packet";
}

function notesHaystack(row: ScoredCandidateWorkflowRow): string {
  return [...(row.notes ?? []), row.workflowStatus, row.stage ?? "", row.nextActionNeeded ?? ""]
    .join(" ")
    .toLowerCase();
}

function isJobActive(job: BreezyJob | undefined | null): boolean {
  if (!job) return false;
  const status = job.status.trim().toLowerCase();
  return status === "published" || status === "open" || status === "active";
}

function isPositionAccepting(job: BreezyJob | undefined | null): boolean {
  if (!job) return false;
  const status = job.status.trim().toLowerCase();
  return status === "published" || status === "open" || status === "active";
}

/** Optional per-candidate override from P185.1 — does not weaken global P184 defaults. */
export type P184VerifiedOnboardingJob = {
  positionId: string;
  acceptingForOnboarding: boolean;
  classification: string;
  detail: string;
};

export function buildP184IdempotencyKey(input: {
  candidateId: string;
  templateKey: OnboardingTemplateKey;
  positionId?: string | null;
}): string {
  const position = input.positionId?.trim() || "none";
  return `p184:${input.candidateId}:${input.templateKey}:${position}`;
}

export function evaluateP184Eligibility(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  job: BreezyJob | null | undefined;
  config: P184EngineConfig;
  queueItems: P184QueueItem[];
  completedIdempotencyKeys: Set<string>;
  nowMs?: number;
  /** P185.1 verified onboarding-job state — closed/historical ads with selection evidence. */
  verifiedOnboardingJob?: P184VerifiedOnboardingJob | null;
}): P184EligibilityResult {
  const { row, onboarding, job, config, queueItems } = input;
  const nowMs = input.nowMs ?? Date.now();
  const gates: P184EligibilityGate[] = [];
  const templateKey = resolveTemplateKey(row);
  const idempotencyKey = buildP184IdempotencyKey({
    candidateId: row.candidateId,
    templateKey,
    positionId: row.positionId,
  });

  const ready = row.workflowStatus === "Paperwork Needed";
  gates.push(
    gate(
      "ready_for_paperwork",
      "Stage = Ready for Paperwork",
      ready,
      ready ? null : `Current status: ${row.workflowStatus}`,
    ),
  );

  const email = (row.email ?? row.onboardingContactEmail ?? "").trim().toLowerCase();
  const emailValid = EMAIL_RE.test(email);
  gates.push(
    gate(
      "valid_email",
      "Email present and valid",
      emailValid,
      emailValid ? null : email ? "Email format invalid." : "Email missing.",
    ),
  );

  const haystack = notesHaystack(row);
  const archived =
    ARCHIVED_HINTS.some((hint) => haystack.includes(hint)) ||
    /archived/i.test(row.workflowStatus);
  gates.push(
    gate("not_archived", "Not archived", !archived, archived ? "Candidate appears archived/withdrawn." : null),
  );

  const hired = HIRED_STATUSES.has(row.workflowStatus) || /hired/i.test(haystack);
  gates.push(gate("not_hired", "Not hired", !hired, hired ? "Candidate already hired." : null));

  const pendingStatuses = new Set(["sent", "viewed"]);
  const paperworkPending =
    pendingStatuses.has(row.paperworkStatus) ||
    row.workflowStatus === "Paperwork Sent" ||
    Boolean(row.signatureRequestId) ||
    onboarding?.status === "sending" ||
    onboarding?.status === "queued" ||
    onboarding?.status === "retry_scheduled" ||
    onboarding?.status === "sent";
  gates.push(
    gate(
      "no_paperwork_pending",
      "No paperwork currently pending",
      !paperworkPending,
      paperworkPending ? "Paperwork already pending or in flight." : null,
    ),
  );

  const completed =
    row.paperworkStatus === "signed" ||
    row.workflowStatus === "Signed" ||
    onboarding?.status === "completed" ||
    onboarding?.paperworkComplete === true;
  gates.push(
    gate(
      "no_paperwork_completed",
      "No paperwork completed",
      !completed,
      completed ? "Paperwork already completed." : null,
    ),
  );

  const failedItem = queueItems.find(
    (item) =>
      item.candidateId === row.candidateId &&
      (item.status === "failed_transient" || item.status === "failed_permanent"),
  );
  const cooldownMs = config.failureCooldownHours * 60 * 60 * 1000;
  const inCooldown =
    Boolean(failedItem) &&
    failedItem!.permanentFailure &&
    nowMs - new Date(failedItem!.updatedAt).getTime() < cooldownMs;
  const failedWorkflowRecently =
    row.paperworkStatus === "failed" &&
    row.paperworkSentAt != null &&
    nowMs - new Date(row.paperworkSentAt).getTime() < cooldownMs;
  const cooldownClear = !inCooldown && !failedWorkflowRecently;
  gates.push(
    gate(
      "cooldown_clear",
      "Not previously failed within cooldown",
      cooldownClear,
      cooldownClear ? null : `Failure cooldown active (${config.failureCooldownHours}h).`,
    ),
  );

  const optedOut = OPT_OUT_HINTS.some((hint) => haystack.includes(hint));
  gates.push(
    gate("not_opted_out", "Not opted out", !optedOut, optedOut ? "Candidate opted out of contact." : null),
  );

  const suppressed = SUPPRESSION_HINTS.some((hint) => haystack.includes(hint));
  gates.push(
    gate(
      "no_suppression_flag",
      "No active suppression flag",
      !suppressed,
      suppressed ? "Suppression flag present on candidate notes/status." : null,
    ),
  );

  const verified = input.verifiedOnboardingJob;
  const jobActive = Boolean(verified?.acceptingForOnboarding) || isJobActive(job);
  gates.push(
    gate(
      "job_active",
      "Job still active",
      jobActive,
      jobActive
        ? verified?.acceptingForOnboarding
          ? verified.detail
          : null
        : job
          ? `Job status: ${job.status}`
          : "Job not found.",
    ),
  );

  const accepting = Boolean(verified?.acceptingForOnboarding) || isPositionAccepting(job);
  gates.push(
    gate(
      "position_accepting",
      "Position accepting candidates",
      accepting,
      accepting
        ? verified?.acceptingForOnboarding
          ? `Verified onboarding job (${verified.classification}).`
          : null
        : "Position is not accepting candidates.",
    ),
  );

  const workflowSlice: Pick<
    CandidateWorkflowRecord,
    "candidateId" | "paperworkStatus" | "paperworkSentAt" | "signatureRequestId" | "workflowStatus"
  > = {
    candidateId: row.candidateId,
    paperworkStatus: row.paperworkStatus,
    paperworkSentAt: row.paperworkSentAt,
    signatureRequestId: row.signatureRequestId,
    workflowStatus: row.workflowStatus,
  };
  const duplicateReason =
    duplicatePaperworkSendBlockReason({
      workflow: workflowSlice as CandidateWorkflowRecord,
      activeOnboarding: onboarding,
    }) ||
    (row.paperworkSentAt ? "paperworkSentAt exists." : null) ||
    (queueItems.some(
      (item) =>
        item.candidateId === row.candidateId &&
        (item.status === "queued" || item.status === "sending" || item.status === "sent"),
    )
      ? "Send currently queued or in progress."
      : null) ||
    (/(duplicate)/i.test(haystack) ? "Duplicate candidate detected." : null);

  gates.push(
    gate(
      "no_duplicate",
      "Duplicate protection",
      !duplicateReason,
      duplicateReason,
    ),
  );

  const idempotencyClear = !input.completedIdempotencyKeys.has(idempotencyKey);
  gates.push(
    gate(
      "idempotency_clear",
      "Idempotency key unused",
      idempotencyClear,
      idempotencyClear ? null : `Idempotency key already completed: ${idempotencyKey}`,
    ),
  );

  const rejectionReasons = gates.filter((g) => !g.passed).map((g) => g.detail ?? g.label);
  return {
    candidateId: row.candidateId,
    eligible: rejectionReasons.length === 0,
    gates,
    rejectionReasons,
    templateKey,
    idempotencyKey,
  };
}

export function isPermanentSendFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /invalid email|email.*(invalid|missing)/i.test(lower) ||
    /template.*(missing|not found|invalid)/i.test(lower) ||
    /withdrawn|archived|opted out/i.test(lower) ||
    /job (closed|inactive)|position.*(closed|not accepting)/i.test(lower) ||
    /candidate withdrawn/i.test(lower)
  );
}
