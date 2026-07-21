import type {
  P241CandidateForensic,
  P241Classification,
  P241FailureSource,
  P241P65CheckId,
  P241Recoverability,
  P241RuleTrace,
} from "@/lib/p241-p65-qualification-forensics/types";

/**
 * Classify a P240 qualification_gate_failed forensic.
 *
 * Pattern observed for all 8 P240 cases:
 * - Live/current state correctly fails P65.6 (active packet / not intake) — expected business rule.
 * - P240 proxy replay fails only because actionType was not cleared when resetting to Applied —
 *   a simulation logic bug that mislabels already-advanced candidates as qualification failures.
 */
export function classifyP241QualificationFailure(input: {
  currentStateTrace: P241RuleTrace;
  p240ReplayTrace: P241RuleTrace;
  fixedReplayTrace: P241RuleTrace;
  workflowStage: string;
  paperworkStatus: string;
  actionType: string | null;
}): {
  failedCheckId: P241P65CheckId;
  failedRule: P241CandidateForensic["failedRule"];
  failedCheckDetail: string;
  source: P241FailureSource;
  classification: P241Classification;
  recoverability: P241Recoverability;
  expectedOrUnintended: P241CandidateForensic["expectedOrUnintended"];
  rootCause: string;
  smallestSafeCorrection: string | null;
} {
  const replayFail = input.p240ReplayTrace.firstFailedCheckId;
  const currentFail = input.currentStateTrace.firstFailedCheckId;

  if (
    replayFail === "action_type_blocks_promotion" &&
    input.fixedReplayTrace.canPromote &&
    (input.actionType === "send-paperwork" || input.actionType === "await-signature")
  ) {
    const alreadyAdvanced =
      input.paperworkStatus === "sent" ||
      input.paperworkStatus === "viewed" ||
      input.paperworkStatus === "signed" ||
      input.workflowStage === "Paperwork Sent" ||
      input.workflowStage === "Paperwork Needed" ||
      Boolean(currentFail === "active_packet" || currentFail === "not_intake_status");

    return {
      failedCheckId: "action_type_blocks_promotion",
      failedRule: "business_rule",
      failedCheckDetail: `P240 replay kept stale actionType=${input.actionType} after resetting stage to Applied`,
      source: "code_path",
      classification: "logic_bug",
      recoverability: "automatic",
      expectedOrUnintended: alreadyAdvanced ? "hybrid" : "unintended",
      rootCause: alreadyAdvanced
        ? `Candidate already advanced (workflow=${input.workflowStage}, paperwork=${input.paperworkStatus}). Live P65.6 correctly blocks re-promotion (${currentFail}). P240 proxy replay incorrectly reported qualification_gate_failed because replayAsFreshNew cleared stage/packet fields but left actionType=${input.actionType}, which still fails canPromoteToPaperworkFunnel.`
        : `P240 replayAsFreshNew left actionType=${input.actionType}, causing false qualification_gate_failed.`,
      smallestSafeCorrection:
        "In P240 simulateP240CandidatePath replayAsFreshNew, also clear actionType/requiredAction/actionReason/actionDueDate/actionGeneratedAt (and optionally requiredAction-derived fields). Do not bypass P65.6 live business rules for already-sent packets.",
    };
  }

  if (currentFail === "active_packet" || currentFail === "already_signed") {
    return {
      failedCheckId: currentFail,
      failedRule: "duplicate_protection",
      failedCheckDetail: input.currentStateTrace.checks.find((c) => c.checkId === currentFail)?.detail ?? currentFail,
      source: "workflow",
      classification: "expected_business_rule",
      recoverability: "never",
      expectedOrUnintended: "expected",
      rootCause: "Active/signed paperwork packet — P65.6 correctly refuses funnel re-promotion (never resend).",
      smallestSafeCorrection: null,
    };
  }

  if (currentFail === "grade_not_allowed") {
    return {
      failedCheckId: "grade_not_allowed",
      failedRule: "score_below_threshold",
      failedCheckDetail:
        input.currentStateTrace.checks.find((c) => c.checkId === "grade_not_allowed")?.detail ??
        "grade not allowed",
      source: "questionnaire",
      classification: "expected_business_rule",
      recoverability: "operator_review",
      expectedOrUnintended: "expected",
      rootCause: "AI grade not enabled in paperworkByGrade policy.",
      smallestSafeCorrection:
        "Only if policy intentionally allows the grade — update paperworkByGrade; do not bypass per-candidate.",
    };
  }

  if (currentFail === "unassigned_recruiter" || currentFail === "missing_email") {
    return {
      failedCheckId: currentFail,
      failedRule: "missing_required_field",
      failedCheckDetail:
        input.currentStateTrace.checks.find((c) => c.checkId === currentFail)?.detail ?? currentFail,
      source: currentFail === "unassigned_recruiter" ? "routing" : "ingestion",
      classification: "data_quality_issue",
      recoverability: currentFail === "unassigned_recruiter" ? "automatic" : "recruiter_review",
      expectedOrUnintended: "expected",
      rootCause: `Missing required field for P65.6 promotion: ${currentFail}.`,
      smallestSafeCorrection:
        currentFail === "unassigned_recruiter"
          ? "Run P158 recruiter assignment for true Applied intake only."
          : "Capture a valid contact email before promotion.",
    };
  }

  const failId = replayFail ?? currentFail ?? "not_intake_status";
  return {
    failedCheckId: failId,
    failedRule: input.p240ReplayTrace.firstFailedRuleCategory ?? "other",
    failedCheckDetail: `Unhandled first-fail=${failId}`,
    source: "workflow",
    classification: "logic_bug",
    recoverability: "operator_review",
    expectedOrUnintended: "unintended",
    rootCause: `Unhandled P65.6 failure pattern (${failId}).`,
    smallestSafeCorrection: "Operator review of workflow + policy before any promotion change.",
  };
}

export function deriveQualificationStatus(input: {
  aiGrade: string;
  workflowStage: string;
  paperworkStatus: string;
  currentCanPromote: boolean;
  replayCanPromote: boolean;
}): string {
  if (
    input.paperworkStatus === "sent" ||
    input.paperworkStatus === "viewed" ||
    input.workflowStage === "Paperwork Sent"
  ) {
    return `already_past_qualification_packet_active (grade=${input.aiGrade})`;
  }
  if (input.workflowStage === "Paperwork Needed" && input.paperworkStatus === "sent") {
    return `stage_desync_pn_with_sent_packet (grade=${input.aiGrade})`;
  }
  if (input.currentCanPromote) return `p65_promotable (grade=${input.aiGrade})`;
  if (input.replayCanPromote) return `replay_promotable_only (grade=${input.aiGrade})`;
  return `not_promotable (grade=${input.aiGrade})`;
}
