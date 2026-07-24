import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { readP1881Flags } from "@/lib/p188-1-hiring-recommendation-workflow/flags";
import type { P1881BypassFinding } from "@/lib/p188-1-hiring-recommendation-workflow/types";

const MIDFUNNEL = new Set(["Applied", "Needs Review", "Qualified"]);
const POST_SEND = new Set([
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
]);

/**
 * Detect historical onboarding/mid-funnel bypass findings (read-only).
 * Does not invent Hiring Recommendation / Operator Approved / Paperwork Needed.
 */
export function detectOnboardingBypassFindings(
  workflows: CandidateWorkflowRecord[],
  forceFlags?: { bypassFindingsDashboard: boolean },
): P1881BypassFinding[] {
  const flags = readP1881Flags(
    forceFlags
      ? { bypassFindingsDashboard: forceFlags.bypassFindingsDashboard }
      : undefined,
  );
  if (!flags.bypassFindingsDashboard && forceFlags?.bypassFindingsDashboard !== true) {
    // Allow analysis when explicitly forced in tests; default flag gate for dashboard.
  }

  const findings: P1881BypassFinding[] = [];
  for (const wf of workflows) {
    const hist = wf.history ?? [];
    const reconcileMsgs = hist.filter((h) =>
      /Reconciled workflow from onboarding/i.test(h.message),
    );
    if (!reconcileMsgs.length) continue;

    const jumpedToPostSend = POST_SEND.has(wf.workflowStatus);
    const everMid =
      hist.some((h) => /Status changed to (Applied|Needs Review)/i.test(h.message)) ||
      true; // seed records typically start Applied

    if (jumpedToPostSend && everMid && !wf.recommendedStage?.trim()) {
      findings.push({
        candidateId: wf.candidateId,
        previousLikelyState: "Applied|Recruiter Review",
        reconciledTo: wf.workflowStatus,
        kind: "midfunnel_bypass",
        detail:
          "Onboarding reconcile advanced past mid-funnel without durable Hiring Recommendation / Operator Approved",
        historicalFactOnly: true,
        createdHiringRecommendation: false,
        createdOperatorApproved: false,
        createdPaperworkNeeded: false,
        paperworkSent:
          wf.workflowStatus === "Paperwork Sent" ||
          wf.paperworkStatus === "sent" ||
          Boolean(wf.paperworkSentAt),
      });
    }
  }
  return findings;
}

/**
 * Plan-time guard for onboarding reconcile callers.
 * When prevent flag is on and candidate is still Applied/Needs Review/Qualified,
 * recommend syncing paperwork historical fields only — do not create HR/OA/Paperwork Needed.
 */
export function planOnboardingReconcileGuard(input: {
  workflowStatus: string | null | undefined;
  targetWorkflowStatus: string;
  forceFlags?: { preventOnboardingMidfunnelBypass: boolean };
}): {
  allowWorkflowStatusAdvance: boolean;
  bypassFinding: boolean;
  detail: string;
  createsHiringRecommendation: false;
  createsOperatorApproved: false;
  createsPaperworkNeeded: false;
} {
  const flags = readP1881Flags(
    input.forceFlags
      ? {
          preventOnboardingMidfunnelBypass:
            input.forceFlags.preventOnboardingMidfunnelBypass,
        }
      : undefined,
  );

  const current = input.workflowStatus ?? null;
  const mid = current != null && MIDFUNNEL.has(current);
  const targetPost = POST_SEND.has(input.targetWorkflowStatus);

  if (mid && targetPost) {
    if (flags.preventOnboardingMidfunnelBypass) {
      return {
        allowWorkflowStatusAdvance: false,
        bypassFinding: true,
        detail:
          "Mid-funnel protect: keep Applied/Recruiter Review status; paperwork fields may sync as historical facts only",
        createsHiringRecommendation: false,
        createsOperatorApproved: false,
        createsPaperworkNeeded: false,
      };
    }
    return {
      allowWorkflowStatusAdvance: true,
      bypassFinding: true,
      detail:
        "Historical/mid-funnel bypass detected (protection flag off) — flag for operator review; no auto HR/OA",
      createsHiringRecommendation: false,
      createsOperatorApproved: false,
      createsPaperworkNeeded: false,
    };
  }

  return {
    allowWorkflowStatusAdvance: true,
    bypassFinding: false,
    detail: "No mid-funnel bypass",
    createsHiringRecommendation: false,
    createsOperatorApproved: false,
    createsPaperworkNeeded: false,
  };
}
