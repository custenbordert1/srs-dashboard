import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import {
  isOnboardingTemplateKey,
  type OnboardingTemplateKey,
} from "@/lib/onboarding-template-registry";
import type {
  PaperworkSendEligibilityResult,
  PaperworkSendGate,
} from "@/lib/autonomous-paperwork-send-engine/types";
import type { ClosedAdProjectMappingResult } from "@/lib/closed-ad-project-mapping/types";
import {
  findNearestActiveOperationalNeed,
  hasOperationalFit,
} from "@/lib/candidate-first-paperwork-eligibility/match-active-operational-need";

const INACTIVE_STATUSES = new Set([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Ready for MEL",
]);

const REJECTED_HINTS = ["not qualified", "rejected", "disqualified", "withdrawn"];

function gate(
  id: PaperworkSendGate["id"],
  label: string,
  passed: boolean,
  detail: string | null = null,
): PaperworkSendGate {
  return { id, label, passed, detail };
}

function resolveTemplateKey(row: ScoredCandidateWorkflowRow): OnboardingTemplateKey | null {
  const fromRow = row.paperworkTemplateKey;
  if (fromRow && isOnboardingTemplateKey(fromRow)) return fromRow;
  return "onboarding_packet";
}

function hasPublishedJobMatch(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
): boolean {
  return Boolean(row.positionId?.trim() && jobsByPositionId.has(row.positionId));
}

function isRejected(row: ScoredCandidateWorkflowRow): boolean {
  if (row.workflowStatus === "Not Qualified") return true;
  const haystack = `${row.workflowStatus} ${row.stage}`.toLowerCase();
  return REJECTED_HINTS.some((hint) => haystack.includes(hint));
}

export function buildPaperworkSendEligibility(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
  projectMapping?: ClosedAdProjectMappingResult;
  candidateFirstMode?: boolean;
  publishedJobs?: BreezyJob[];
}): PaperworkSendEligibilityResult {
  const gates: PaperworkSendGate[] = [];
  const { row, onboarding } = input;

  gates.push(
    gate(
      "automation_enabled",
      "P84 automation enabled",
      true,
      null,
    ),
  );

  const recruiterAssigned = !isUnassignedRecruiter(row.assignedRecruiter);
  gates.push(
    gate(
      "recruiter_assigned",
      "Recruiter assigned",
      recruiterAssigned,
      recruiterAssigned ? null : "Awaiting recruiter assignment.",
    ),
  );

  const paperworkNeeded = row.workflowStatus === "Paperwork Needed";
  gates.push(
    gate(
      "paperwork_needed",
      "Workflow status is Paperwork Needed",
      paperworkNeeded,
      paperworkNeeded ? null : `Current status: ${row.workflowStatus}.`,
    ),
  );

  const sendAction = (row.actionType ?? "none") === "send-paperwork";
  gates.push(
    gate(
      "send_paperwork_action",
      "Action type is send-paperwork",
      sendAction,
      sendAction ? null : `Current action: ${row.actionType ?? "none"}.`,
    ),
  );

  const publishedJobNative =
    hasPublishedJobMatch(row, input.jobsByPositionId) ||
    input.projectMapping?.passesPublishedJobGate === true;
  const operationalFit =
    input.candidateFirstMode && input.publishedJobs
      ? findNearestActiveOperationalNeed({
          candidateCity: row.city ?? "",
          candidateState: row.state ?? "",
          publishedJobs: input.publishedJobs,
        })
      : null;
  const publishedJob = Boolean(
    publishedJobNative || (input.candidateFirstMode === true && hasOperationalFit(operationalFit)),
  );
  gates.push(
    gate(
      "published_job",
      input.candidateFirstMode
        ? "Active published position, mapped project, or operational fit"
        : "Active published Breezy position or mapped project",
      publishedJob,
      publishedJob
        ? input.projectMapping?.status === "closed_ad_mapped_project"
          ? input.projectMapping.reason
          : operationalFit
            ? `Operational fit: ${operationalFit.jobName}`
            : null
        : input.candidateFirstMode
          ? "No published job or operational fit for candidate territory."
          : "No published job match for candidate position.",
    ),
  );

  const validEmail = Boolean(row.email?.trim());
  gates.push(
    gate(
      "valid_email",
      "Valid candidate email",
      validEmail,
      validEmail ? null : "Missing candidate email.",
    ),
  );

  const duplicateReason = duplicatePaperworkSendBlockReason({
    workflow: {
      candidateId: row.candidateId,
      paperworkStatus: row.paperworkStatus,
      workflowStatus: row.workflowStatus,
      signatureRequestId: row.signatureRequestId,
    } as never,
    activeOnboarding: onboarding,
  });
  gates.push(
    gate(
      "no_duplicate",
      "No duplicate paperwork packet",
      duplicateReason == null,
      duplicateReason,
    ),
  );

  const notSigned =
    row.paperworkStatus !== "signed" && row.workflowStatus !== "Signed";
  gates.push(
    gate(
      "not_signed",
      "Not already signed",
      notSigned,
      notSigned ? null : "Paperwork already signed.",
    ),
  );

  const rejected = isRejected(row);
  gates.push(
    gate(
      "not_rejected",
      "Candidate not rejected",
      !rejected,
      rejected ? "Candidate is rejected or disqualified." : null,
    ),
  );

  const inactive = INACTIVE_STATUSES.has(row.workflowStatus);
  gates.push(
    gate(
      "not_inactive",
      "Candidate active in pipeline",
      !inactive,
      inactive ? `Terminal/inactive status: ${row.workflowStatus}.` : null,
    ),
  );

  const templateKey = resolveTemplateKey(row);
  gates.push(
    gate(
      "template_ready",
      "Dropbox Sign template configured",
      templateKey != null,
      templateKey ? null : "No onboarding template could be resolved.",
    ),
  );

  const blockingReasons = gates
    .filter((entry) => !entry.passed)
    .map((entry) => entry.detail ?? entry.label);

  return {
    candidateId: row.candidateId,
    eligible: blockingReasons.length === 0,
    gates,
    blockingReasons,
    templateKey,
  };
}

export function buildPaperworkSendDecisions(
  rows: ScoredCandidateWorkflowRow[],
  input: {
    onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
    jobsByPositionId: Map<string, BreezyJob>;
  },
): PaperworkSendEligibilityResult[] {
  return rows.map((row) =>
    buildPaperworkSendEligibility({
      row,
      onboarding: input.onboardingByCandidateId.get(row.candidateId) ?? null,
      jobsByPositionId: input.jobsByPositionId,
    }),
  );
}
