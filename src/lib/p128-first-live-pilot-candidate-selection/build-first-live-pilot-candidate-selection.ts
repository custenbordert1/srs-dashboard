import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";
import { buildApprovalDecisionsFromContext } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
import {
  evaluateCandidateEligibility,
} from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import { loadPaperworkCandidates, type LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { p100AuditLogPath } from "@/lib/controlled-live-send/controlled-live-send-store";
import { buildPilotSendPacketPreview } from "@/lib/p122-controlled-live-paperwork-pilot/build-send-packet-preview";
import { buildSystemPilotSafetyChecks } from "@/lib/p122-controlled-live-paperwork-pilot/build-pilot-safety-gates";
import { evaluatePilotCandidate } from "@/lib/p122-controlled-live-paperwork-pilot/evaluate-pilot-candidate";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { resolveApprovedMapping } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import { runEndToEndPreviewReadinessDrill } from "@/lib/p127-end-to-end-preview-readiness-drill";
import type {
  CandidateApprovalRecord,
} from "@/lib/autonomous-paperwork-approval-engine/types";
import type {
  FirstLivePilotCandidateSelectionReport,
  PilotCandidateSelection,
} from "@/lib/p128-first-live-pilot-candidate-selection/types";
import { P128_SELECTION_MODE, P128_SOURCE_PHASE } from "@/lib/p128-first-live-pilot-candidate-selection/types";

function decisionWeight(decision: string): number {
  switch (decision) {
    case "AUTO_APPROVED":
      return 1000;
    case "NEEDS_HUMAN_APPROVAL":
      return 500;
    case "WAITING":
      return 200;
    case "BLOCKED":
      return -100;
    case "REJECTED_FOR_SAFETY":
      return -10_000;
    default:
      return 0;
  }
}

function rankApprovalRecord(record: CandidateApprovalRecord): number {
  let score = decisionWeight(record.approvalDecision) + record.approvalScore;
  if (record.safetyReasons.some((reason) => /already sent|duplicate|invalid email|missing template/i.test(reason))) {
    score -= 5000;
  }
  if (record.approvalReasons.includes("Valid email")) score += 5;
  if (record.approvalReasons.includes("No duplicate risk")) score += 5;
  if (record.approvalReasons.includes("No already_sent record")) score += 5;
  if (record.approvalReasons.some((reason) => /Published active job|Approved mapping|Native active project/.test(reason))) {
    score += 10;
  }
  if (record.approvalReasons.includes("Template available")) score += 5;
  return score;
}

function buildConfirmations(input: {
  approval: CandidateApprovalRecord;
  pilotEvaluation: ReturnType<typeof evaluatePilotCandidate>;
}): PilotCandidateSelection["confirmations"] {
  return {
    validEmail:
      input.pilotEvaluation.safetyChecks.find((check) => check.id === "valid_email")?.passed === true ||
      validateCohortEmail(input.approval.email).valid,
    noDuplicateRisk:
      input.pilotEvaluation.safetyChecks.find((check) => check.id === "no_duplicate_risk")?.passed === true,
    noAlreadySent:
      input.pilotEvaluation.safetyChecks.find((check) => check.id === "not_already_sent")?.passed === true,
    publishedJobOrApprovedMapping:
      input.pilotEvaluation.safetyChecks.find((check) => check.id === "approved_mapping_or_native_project")
        ?.passed === true,
    templateAvailable: Boolean(input.pilotEvaluation.templateKey),
  };
}

function buildSelectionEntry(input: {
  approval: CandidateApprovalRecord;
  pilotEvaluation: ReturnType<typeof evaluatePilotCandidate>;
  eligibilityStatus: string;
  rank: number;
  reason: string;
}): PilotCandidateSelection {
  return {
    candidateId: input.approval.candidateId,
    candidateName: input.approval.candidateName,
    email: input.approval.email,
    approvalDecision: input.approval.approvalDecision,
    approvalScore: input.approval.approvalScore,
    eligibilityStatus: input.eligibilityStatus,
    positionTitle: input.pilotEvaluation.projectLabel,
    projectLabel: input.pilotEvaluation.projectLabel,
    mappingSource: input.pilotEvaluation.mappingSource,
    templateKey: input.pilotEvaluation.templateKey,
    selectionRank: input.rank,
    selectionReason: input.reason,
    confirmations: buildConfirmations({
      approval: input.approval,
      pilotEvaluation: input.pilotEvaluation,
    }),
  };
}

export async function buildFirstLivePilotCandidateSelection(input?: {
  skipP127Drill?: boolean;
  contextOverride?: LoadedPaperworkCandidates;
}): Promise<FirstLivePilotCandidateSelectionReport> {
  const p127 = input?.skipP127Drill ? null : await runEndToEndPreviewReadinessDrill();
  const basePilotConfig = loadPilotConfig();
  const context = input?.contextOverride ?? (await loadPaperworkCandidates({ mtdOnly: false }));
  const approvalDecisions = buildApprovalDecisionsFromContext(context);
  const registry = await loadPilotSendRegistry();

  const ranked = [...approvalDecisions]
    .map((approval) => ({ approval, rank: rankApprovalRecord(approval) }))
    .sort((a, b) => b.rank - a.rank);

  const shortlist = ranked.slice(0, 25);
  const evaluated: Array<{
    approval: CandidateApprovalRecord;
    rank: number;
    pilotEvaluation: ReturnType<typeof evaluatePilotCandidate>;
    eligibilityStatus: string;
    readyOnAllowlist: boolean;
  }> = [];

  for (const entry of shortlist) {
    const row = context.rowsByCandidateId.get(entry.approval.candidateId) ?? null;
    const approvedMapping = resolveApprovedMapping({
      record: context.p109ByCandidate.get(entry.approval.candidateId) ?? null,
      candidateId: entry.approval.candidateId,
      closedPositionId: row?.positionId ?? null,
      publishedJobTitleById: context.publishedJobTitleById,
    });
    const eligibility = evaluateCandidateEligibility({
      candidateId: entry.approval.candidateId,
      row,
      context,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      approvedMapping,
    });

    const previewConfig = {
      ...basePilotConfig,
      allowlist: [entry.approval.candidateId],
    };

    const pilotEvaluation = evaluatePilotCandidate({
      candidateId: entry.approval.candidateId,
      row,
      onboarding: context.onboardingByCandidateId.get(entry.approval.candidateId) ?? null,
      jobsByPositionId: context.jobsByPositionId,
      closedJobsByPositionId: context.closedJobsByPositionId,
      publishedJobs: context.publishedJobs,
      paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
      p100SentIds: context.p100SentIds,
      pilotSentIds: context.pilotSentIds,
      approvedMapping,
      config: previewConfig,
      pilotSendCount: registry.sendCount,
    });

    evaluated.push({
      approval: entry.approval,
      rank: entry.rank,
      pilotEvaluation,
      eligibilityStatus: eligibility.status,
      readyOnAllowlist: pilotEvaluation.status === "ready_to_send",
    });
  }

  const readyCandidates = evaluated.filter((entry) => entry.readyOnAllowlist);
  const pickPool = readyCandidates.length > 0 ? readyCandidates : evaluated;
  const selectedEval = pickPool[0];

  if (!selectedEval) {
    throw new Error("P128 — no candidates available for pilot selection.");
  }

  const selectedCandidate = buildSelectionEntry({
    approval: selectedEval.approval,
    pilotEvaluation: selectedEval.pilotEvaluation,
    eligibilityStatus: selectedEval.eligibilityStatus,
    rank: selectedEval.rank,
    reason: selectedEval.readyOnAllowlist
      ? "Safest candidate — passes P122 dry-run gates on simulated allowlist."
      : "Highest-ranked candidate closest to AUTO_APPROVED (preview allowlist simulation).",
  });

  const backupCandidates = pickPool
    .slice(1, 4)
    .map((entry, index) =>
      buildSelectionEntry({
        approval: entry.approval,
        pilotEvaluation: entry.pilotEvaluation,
        eligibilityStatus: entry.eligibilityStatus,
        rank: entry.rank,
        reason: `Backup #${index + 1} — rank ${entry.rank}.`,
      }),
    );

  const sendPacketPreview =
    buildPilotSendPacketPreview({
      candidate: selectedEval.pilotEvaluation,
      auditDestination: p100AuditLogPath(),
    }) ??
    (selectedCandidate.confirmations.validEmail && selectedCandidate.templateKey
      ? {
          candidateId: selectedCandidate.candidateId,
          candidateName: selectedCandidate.candidateName,
          candidateEmail: selectedCandidate.email,
          jobOrProject: selectedCandidate.projectLabel ?? "Unknown project",
          paperworkTemplate: selectedCandidate.templateKey ?? "onboarding_packet",
          safetyChecks: selectedEval.pilotEvaluation.safetyChecks,
          auditDestination: p100AuditLogPath(),
        }
      : null);

  const systemSafetyChecks = buildSystemPilotSafetyChecks({
    config: basePilotConfig,
    pilotSendCount: registry.sendCount,
    dryRun: true,
    confirmationPhrase: P122_CONFIRMATION_PHRASE,
  });

  const safetyChecks = [
    ...systemSafetyChecks,
    ...selectedEval.pilotEvaluation.safetyChecks,
  ];

  const candidateSafetyPassed = selectedEval.pilotEvaluation.safetyChecks
    .filter((check) => check.id !== "on_allowlist")
    .every((check) => check.passed);

  let goNoGo: FirstLivePilotCandidateSelectionReport["goNoGo"] = "GO WITH CONDITIONS";
  let goNoGoReason = "Candidate selected for controlled one-candidate pilot — enable env gates before live send.";

  if (!candidateSafetyPassed) {
    goNoGo = "NO-GO";
    goNoGoReason = "Selected candidate fails one or more candidate-level safety checks.";
  } else if (
    selectedEval.readyOnAllowlist &&
    selectedEval.approval.approvalDecision === "AUTO_APPROVED" &&
    basePilotConfig.pilotEnabled &&
    basePilotConfig.liveModeEnabled &&
    basePilotConfig.operatorGo
  ) {
    goNoGo = "GO";
    goNoGoReason = "Selected candidate is AUTO_APPROVED and passes P122 preview safety checks.";
  } else if (selectedEval.readyOnAllowlist) {
    goNoGo = "GO WITH CONDITIONS";
    goNoGoReason =
      "Candidate ready on simulated allowlist — set pilot env vars and confirm operator GO before executeOne.";
  }

  const exactEnvVarsNeeded = {
    AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED: "true",
    AUTONOMOUS_PAPERWORK_LIVE_MODE: "true",
    AUTONOMOUS_PAPERWORK_OPERATOR_GO: "true",
    AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST: selectedCandidate.candidateId,
    AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS: String(basePilotConfig.maxSends),
  };

  const allowlistCommand = `export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST="${selectedCandidate.candidateId}"`;
  const finalLiveCommand = `npx tsx scripts/p122-controlled-live-paperwork-pilot.ts --execute --confirm "${P122_CONFIRMATION_PHRASE}" --candidate-id ${selectedCandidate.candidateId}`;

  return {
    sourcePhase: P128_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P128_SELECTION_MODE,
    p127Summary: {
      totalCandidatesEvaluated: p127?.totalCandidatesEvaluated ?? approvalDecisions.length,
      autoApproved: p127?.autoApproved ?? approvalDecisions.filter((d) => d.approvalDecision === "AUTO_APPROVED").length,
      humanApproval:
        p127?.humanApproval ??
        approvalDecisions.filter((d) => d.approvalDecision === "NEEDS_HUMAN_APPROVAL").length,
      blocked:
        p127?.blocked ?? approvalDecisions.filter((d) => d.approvalDecision === "BLOCKED").length,
    },
    selectedCandidate,
    backupCandidates,
    safetyChecks,
    sendPacketPreview,
    auditPath: p100AuditLogPath(),
    exactEnvVarsNeeded,
    allowlistCommand,
    finalLiveCommand,
    goNoGo,
    goNoGoReason,
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: basePilotConfig.liveModeEnabled,
    paperworkSent: false,
    continuousRunnerEnabled: process.env.P125_RUNNER_CONTINUOUS_ENABLED === "true",
  };
}
