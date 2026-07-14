import {
  P187_1_TRANSITION,
  type P1871WriterContainmentPlan,
} from "@/lib/p187-1-canary-cohort-readiness/types";
import { P187_LEGACY_OWNER, P187_P186_OWNER } from "@/lib/p187-hr-to-oa-canary/types";

/**
 * Competing writer control plan — identify only; disable nothing.
 */
export function buildWriterContainmentPlan(): P1871WriterContainmentPlan {
  return {
    transition: P187_1_TRANSITION,
    legacyWriter: P187_LEGACY_OWNER,
    p187Writer: P187_P186_OWNER,
    competingWriters: [
      "api-candidates-workflows (manual Operator Approved / approval paths)",
      "p97-approval-mode-persist",
      "p186-3 executeOperatorApprovalAction approve_hiring_recommendation (advances to Paperwork Needed — out of canary scope)",
      "p83-candidate-advancement / p151-pipeline-advancement (if they mutate approval)",
    ],
    schedulerOrApiOverlaps: [
      "P154.7 / P169 continuous orchestrators (must remain disabled)",
      "Manual executive approval UI during canary window",
      "Bulk approval APIs overlapping the same candidate IDs",
    ],
    temporaryContainment: [
      "During execution only: pause/hold competing approval writers for THIS transition + THIS cohort fingerprint",
      "Do not freeze P184/P185",
      "Do not change Operator Approved→Paperwork Needed ownership",
      "Block parallel approve_hiring_recommendation that would skip to Paperwork Needed for cohort members",
      "Short maintenance note on operator queues for canary IDs only",
    ],
    rollbackReEnablePath:
      "Clear P187_TRANSITION_AUTHORITY_HR_TO_OA + P187_EXECUTE_PRODUCTION_CANARY; restore legacy approval writer access for transition; keep audit; do not resend paperwork",
    disabledNow: false,
  };
}

export function detectWriterCollision(input: {
  candidateId: string;
  competingWriterActiveForCandidate: boolean;
  legacyApprovalInFlight: boolean;
}): { collision: boolean; detail: string } {
  if (input.competingWriterActiveForCandidate || input.legacyApprovalInFlight) {
    return {
      collision: true,
      detail: `Writer collision for ${input.candidateId}`,
    };
  }
  return { collision: false, detail: "No collision" };
}

export function renderWriterContainmentMarkdown(plan: P1871WriterContainmentPlan): string {
  return [
    "# P187.1 Writer Containment Plan",
    "",
    `Transition: \`${plan.transition}\``,
    "",
    "**Nothing is disabled in P187.1.** This is an execution-time plan only.",
    "",
    "## Writers",
    "",
    `- **Legacy:** ${plan.legacyWriter}`,
    `- **P187:** ${plan.p187Writer}`,
    "",
    "### Competing writers",
    ...plan.competingWriters.map((w) => `- ${w}`),
    "",
    "### Scheduler / API overlaps",
    ...plan.schedulerOrApiOverlaps.map((s) => `- ${s}`),
    "",
    "### Temporary containment (execution only)",
    ...plan.temporaryContainment.map((t) => `- ${t}`),
    "",
    "## Rollback re-enable",
    "",
    plan.rollbackReEnablePath,
    "",
    `disabledNow: **${plan.disabledNow}**`,
    "",
  ].join("\n");
}
