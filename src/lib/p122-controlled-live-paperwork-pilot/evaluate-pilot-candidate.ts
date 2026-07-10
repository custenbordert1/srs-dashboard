import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import {
  buildApprovedMappingOverlayJobs,
  simulateCandidateDryRunEligibility,
} from "@/lib/p110-approved-mapping-integration/simulate-approved-mapping-eligibility";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";
import { isReadyForSendBlocker } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import type {
  PilotCandidateEvaluation,
  PilotConfig,
  PilotMappingSource,
  PilotSafetyCheck,
} from "@/lib/p122-controlled-live-paperwork-pilot/types";

function check(
  id: PilotSafetyCheck["id"],
  label: string,
  passed: boolean,
  detail: string,
): PilotSafetyCheck {
  return { id, label, passed, detail };
}

function resolveMappingSource(input: {
  row: ScoredCandidateWorkflowRow;
  jobsByPositionId: Map<string, BreezyJob>;
  approvedMapping: ApprovedMappingResolution | null;
}): PilotMappingSource {
  if (input.row.positionId?.trim() && input.jobsByPositionId.has(input.row.positionId)) {
    return "native_published_job";
  }
  if (input.approvedMapping?.qualifies) return "approved_mapping";
  return "none";
}

function resolveProjectLabel(input: {
  row: ScoredCandidateWorkflowRow;
  jobsByPositionId: Map<string, BreezyJob>;
  approvedMapping: ApprovedMappingResolution | null;
  publishedJobs: BreezyJob[];
}): string | null {
  const positionId = input.row.positionId?.trim();
  if (positionId && input.jobsByPositionId.has(positionId)) {
    const job = input.jobsByPositionId.get(positionId)!;
    return `${job.name} (${job.city}, ${job.state})`;
  }
  if (input.approvedMapping?.recommendedPositionId) {
    const mapped = input.publishedJobs.find((job) => job.jobId === input.approvedMapping!.recommendedPositionId);
    if (mapped) return `${mapped.name} (${mapped.city}, ${mapped.state})`;
    return input.approvedMapping.recommendedPositionTitle ?? input.approvedMapping.recommendedPositionId;
  }
  return input.row.positionName ?? null;
}

export function evaluatePilotCandidate(input: {
  candidateId: string;
  row: ScoredCandidateWorkflowRow | null;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
  closedJobsByPositionId: Map<string, BreezyJob>;
  publishedJobs: BreezyJob[];
  paperworkByGrade: PaperworkByGrade;
  p100SentIds: Set<string>;
  pilotSentIds: Set<string>;
  approvedMapping: ApprovedMappingResolution | null;
  config: PilotConfig;
  pilotSendCount: number;
}): PilotCandidateEvaluation {
  const allowlisted = input.config.allowlist.includes(input.candidateId);
  const candidateName = input.row
    ? `${input.row.firstName ?? ""} ${input.row.lastName ?? ""}`.trim() || input.candidateId
    : input.candidateId;
  const email = input.row?.email?.trim() ?? "";

  if (!input.row) {
    return {
      candidateId: input.candidateId,
      candidateName,
      email,
      allowlisted,
      status: "blocked",
      safetyChecks: [
        check("on_allowlist", "Pilot allowlist", allowlisted, allowlisted ? "On allowlist." : "Not on pilot allowlist."),
      ],
      blockingReasons: ["Candidate row not found."],
      projectLabel: null,
      templateKey: null,
      mappingSource: "none",
      baselineBlocker: "missing_candidate_match",
    };
  }

  const dryRun = simulateCandidateDryRunEligibility({
    row: input.row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
    closedJobsByPositionId: input.closedJobsByPositionId,
    publishedJobs: input.publishedJobs,
    paperworkByGrade: input.paperworkByGrade,
    p100SentIds: input.p100SentIds,
    approvedMapping: input.approvedMapping,
    candidateName,
  });

  const baseline = classifyPaperworkBlocker({
    row: input.row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
    closedJobsByPositionId: input.closedJobsByPositionId,
    publishedJobs: input.publishedJobs,
    paperworkByGrade: input.paperworkByGrade,
    p100SentIds: input.p100SentIds,
  });

  const mappingSource = resolveMappingSource({
    row: input.row,
    jobsByPositionId: input.jobsByPositionId,
    approvedMapping: input.approvedMapping,
  });

  const overlayJobs =
    input.approvedMapping && input.row.positionId
      ? buildApprovedMappingOverlayJobs({
          jobsByPositionId: input.jobsByPositionId,
          closedPositionId: input.row.positionId,
          approved: input.approvedMapping,
          publishedJobs: input.publishedJobs,
        })
      : null;

  const overlayBlocker =
    overlayJobs && input.approvedMapping
      ? classifyPaperworkBlocker({
          row: input.row,
          onboarding: input.onboarding,
          jobsByPositionId: overlayJobs,
          closedJobsByPositionId: input.closedJobsByPositionId,
          publishedJobs: input.publishedJobs,
          paperworkByGrade: input.paperworkByGrade,
          p100SentIds: input.p100SentIds,
        })
      : null;

  const mappingGatePassed =
    mappingSource === "native_published_job" ||
    (mappingSource === "approved_mapping" &&
      Boolean(overlayBlocker && isReadyForSendBlocker(overlayBlocker.category)));

  const alreadySent =
    baseline.category === "already_sent" ||
    input.p100SentIds.has(input.candidateId) ||
    input.pilotSentIds.has(input.candidateId);
  const duplicateRisk = baseline.category === "duplicate_risk";
  const invalidEmail = baseline.category === "invalid_email";

  const p84 =
    overlayJobs && mappingSource === "approved_mapping"
      ? buildPaperworkSendEligibility({
          row: input.row,
          onboarding: input.onboarding,
          jobsByPositionId: overlayJobs,
        })
      : buildPaperworkSendEligibility({
          row: input.row,
          onboarding: input.onboarding,
          jobsByPositionId: input.jobsByPositionId,
        });

  const safetyChecks: PilotSafetyCheck[] = [
    check(
      "on_allowlist",
      "Pilot allowlist",
      allowlisted,
      allowlisted ? "Candidate is on pilot allowlist." : "Candidate is not on pilot allowlist.",
    ),
    check(
      "not_already_sent",
      "No already_sent record",
      !alreadySent,
      alreadySent ? "Paperwork already sent or in flight." : "No prior send detected.",
    ),
    check(
      "no_duplicate_risk",
      "No duplicate_risk",
      !duplicateRisk,
      duplicateRisk ? baseline.reason : "Duplicate protection clear.",
    ),
    check(
      "valid_email",
      "Valid email",
      !invalidEmail,
      invalidEmail ? baseline.reason : email ? `Email: ${email}` : "Valid email on file.",
    ),
    check(
      "approved_mapping_or_native_project",
      "Approved mapping or native project",
      mappingGatePassed,
      mappingGatePassed
        ? mappingSource === "native_published_job"
          ? "Native published Breezy job match."
          : "Approved P109 mapping clears project gate."
        : "Requires native published job or approved mapping.",
    ),
    check(
      "pilot_cap_available",
      "Pilot cap available",
      input.pilotSendCount < input.config.maxSends,
      `${input.pilotSendCount}/${input.config.maxSends} pilot sends used.`,
    ),
  ];

  const blockingReasons: string[] = [];
  for (const gate of safetyChecks) {
    if (!gate.passed) blockingReasons.push(gate.detail);
  }

  const readyViaProtection =
    !alreadySent &&
    !duplicateRisk &&
    !invalidEmail &&
    mappingGatePassed &&
    (isReadyForSendBlocker(baseline.category) ||
      dryRun.outcome === "newly_eligible_via_approval" ||
      dryRun.outcome === "already_eligible_baseline") &&
    p84.eligible;

  const status = allowlisted && readyViaProtection && blockingReasons.length === 0 ? "ready_to_send" : "blocked";

  return {
    candidateId: input.candidateId,
    candidateName,
    email,
    allowlisted,
    status,
    safetyChecks,
    blockingReasons,
    projectLabel: resolveProjectLabel({
      row: input.row,
      jobsByPositionId: input.jobsByPositionId,
      approvedMapping: input.approvedMapping,
      publishedJobs: input.publishedJobs,
    }),
    templateKey: p84.templateKey,
    mappingSource,
    baselineBlocker: baseline.category,
  };
}
