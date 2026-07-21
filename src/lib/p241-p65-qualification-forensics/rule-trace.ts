import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import { isGradeAllowedForPaperwork } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { canPromoteToPaperworkFunnel } from "@/lib/candidate-onboarding-engine/promote-paperwork-funnel";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import {
  P241_P65_CHECK_ORDER,
  type P241CheckResult,
  type P241FailedRuleCategory,
  type P241P65CheckId,
  type P241RuleTrace,
} from "@/lib/p241-p65-qualification-forensics/types";

const TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Ready for MEL",
]);

const INTAKE_STATUSES = new Set<CandidateWorkflowStatus>(["Applied", "Needs Review"]);

function hasActivePacket(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" ||
        row.paperworkStatus === "viewed" ||
        row.workflowStatus === "Paperwork Sent"),
  );
}

export function ruleCategoryForCheck(checkId: P241P65CheckId): P241FailedRuleCategory {
  switch (checkId) {
    case "funnel_promotion_disabled":
      return "configuration";
    case "unassigned_recruiter":
    case "missing_email":
      return "missing_required_field";
    case "grade_not_allowed":
      return "score_below_threshold";
    case "active_packet":
    case "already_signed":
      return "duplicate_protection";
    case "terminal_status":
    case "not_intake_status":
    case "action_type_blocks_promotion":
      return "business_rule";
    default:
      return "other";
  }
}

/**
 * Trace every P65.6 canPromoteToPaperworkFunnel predicate in source order.
 * Pure / read-only — does not mutate policy or rows.
 */
export function traceP65PromotionRules(
  row: ScoredCandidateWorkflowRow,
  policy: CandidateOnboardingPolicy,
  context: P241RuleTrace["context"],
): P241RuleTrace {
  const checks: P241CheckResult[] = [];

  const push = (checkId: P241P65CheckId, passed: boolean, detail: string) => {
    checks.push({
      checkId,
      passed,
      detail,
      ruleCategory: ruleCategoryForCheck(checkId),
    });
  };

  push(
    "funnel_promotion_disabled",
    policy.funnelPromotion.enabled,
    policy.funnelPromotion.enabled ? "funnelPromotion.enabled=true" : "funnelPromotion.enabled=false",
  );
  push(
    "unassigned_recruiter",
    !isUnassignedRecruiter(row.assignedRecruiter),
    `assignedRecruiter=${row.assignedRecruiter || "Unassigned"}`,
  );
  push(
    "missing_email",
    Boolean(row.email?.trim()),
    row.email?.trim() ? "email present" : "email missing/blank",
  );
  push(
    "terminal_status",
    !TERMINAL_STATUSES.has(row.workflowStatus),
    `workflowStatus=${row.workflowStatus}`,
  );
  push(
    "active_packet",
    !hasActivePacket(row),
    hasActivePacket(row)
      ? `active packet (sig=${Boolean(row.signatureRequestId)} paperwork=${row.paperworkStatus} stage=${row.workflowStatus})`
      : "no active packet",
  );
  push(
    "already_signed",
    row.paperworkStatus !== "signed",
    `paperworkStatus=${row.paperworkStatus}`,
  );
  push(
    "grade_not_allowed",
    isGradeAllowedForPaperwork(row.aiGrade, policy.paperworkByGrade),
    `aiGrade=${row.aiGrade} allowed=${isGradeAllowedForPaperwork(row.aiGrade, policy.paperworkByGrade)}`,
  );
  push(
    "not_intake_status",
    INTAKE_STATUSES.has(row.workflowStatus),
    `workflowStatus=${row.workflowStatus} (intake requires Applied|Needs Review)`,
  );
  const actionType = row.actionType ?? "none";
  push(
    "action_type_blocks_promotion",
    actionType !== "send-paperwork" && actionType !== "await-signature",
    `actionType=${actionType}`,
  );

  // Sanity: order matches promote-paperwork-funnel.ts
  for (let i = 0; i < P241_P65_CHECK_ORDER.length; i += 1) {
    if (checks[i]?.checkId !== P241_P65_CHECK_ORDER[i]) {
      throw new Error(`P241 rule-trace order drift at index ${i}`);
    }
  }

  const firstFail = checks.find((c) => !c.passed) ?? null;
  const canPromote = canPromoteToPaperworkFunnel(row, policy);
  // When all checks pass, canPromote must be true (and vice versa for first fail).
  if (canPromote !== (firstFail == null)) {
    // Defensive: still return checks; callers can flag inconsistency.
  }

  return {
    context,
    canPromote,
    checks,
    firstFailedCheckId: firstFail?.checkId ?? null,
    firstFailedRuleCategory: firstFail?.ruleCategory ?? null,
  };
}

export function summarizeFailedChecks(traces: P241RuleTrace[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of traces) {
    if (!t.firstFailedCheckId) continue;
    counts[t.firstFailedCheckId] = (counts[t.firstFailedCheckId] ?? 0) + 1;
  }
  return counts;
}
