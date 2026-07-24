import {
  FULL_EVIDENCE_CHECKLIST,
  parseNearestMiles,
} from "@/lib/p204-2-controlled-recommendation-approval/decision";
import type {
  P2042EvidenceChecklist,
  P2042OperatorDecisionKind,
  P2042ReviewPackage,
} from "@/lib/p204-2-controlled-recommendation-approval/types";

/**
 * Authorized operator-review proxy for P204.2.
 * Applies per-candidate evidence rules — never bulk-approves without checklist.
 */
export function proposeP2042PolicyProxyDecision(pkg: P2042ReviewPackage): {
  decision: P2042OperatorDecisionKind;
  overrideReason: string | null;
  reviewNotes: string;
  evidenceChecklist: P2042EvidenceChecklist;
} {
  const checklist = { ...FULL_EVIDENCE_CHECKLIST };

  if (pkg.stale) {
    return {
      decision: "stale_insufficient_evidence",
      overrideReason: null,
      reviewNotes: `Stale after freeze: ${pkg.staleReasons.join("; ") || "material change"}`,
      evidenceChecklist: checklist,
    };
  }

  if (pkg.safetyFlags.includes("unresolved_duplicate_evidence")) {
    return {
      decision: "defer",
      overrideReason: null,
      reviewNotes: "Unresolved duplicate indicators — defer until clear.",
      evidenceChecklist: checklist,
    };
  }

  if (pkg.safetyFlags.includes("advance_despite_hard_gate_or_missing_questionnaire")) {
    return {
      decision: "override_to_review",
      overrideReason:
        "AI recommended Advance despite hard-gate or missing questionnaire evidence.",
      reviewNotes: "Safety exception — route to recruiter review.",
      evidenceChecklist: checklist,
    };
  }

  if (pkg.safetyFlags.includes("reject_primarily_missing_data")) {
    return {
      decision: "override_to_review",
      overrideReason:
        "AI Reject appears driven primarily by missing data rather than a disqualify gate.",
      reviewNotes: "Prefer Needs Review until evidence gaps close.",
      evidenceChecklist: checklist,
    };
  }

  if (
    pkg.safetyFlags.includes("territory_may_dominate_qualification") ||
    pkg.safetyFlags.includes("explanation_conflicts_with_zero_distance_signal")
  ) {
    return {
      decision: "override_to_review",
      overrideReason:
        "Territory/nearby-job signal may over-influence or conflict with explanation.",
      reviewNotes: "Hold for recruiter review of territory vs qualification evidence.",
      evidenceChecklist: checklist,
    };
  }

  if (pkg.aiRecommendation === "Advance") {
    const miles = parseNearestMiles(pkg.nearestJobDistance);
    if (miles != null && miles === 0) {
      return {
        decision: "override_to_review",
        overrideReason:
          "Advance with nearest~0mi territory signal needs human confirmation of job fit.",
        reviewNotes: "Zero-distance nearby-job signal is high-risk without operator check.",
        evidenceChecklist: checklist,
      };
    }
    if (pkg.topNegativeFactors.includes("missing_resume")) {
      return {
        decision: "override_to_review",
        overrideReason: "Advance recommendation lacks resume/experience evidence.",
        reviewNotes: "Missing resume — cannot approve Advance.",
        evidenceChecklist: checklist,
      };
    }
    return {
      decision: "agree_advance",
      overrideReason: null,
      reviewNotes:
        "Questionnaire, gates, duplicates, contact, and nearby work reviewed; agree Advance.",
      evidenceChecklist: checklist,
    };
  }

  if (pkg.aiRecommendation === "Needs Recruiter Review") {
    return {
      decision: "agree_review",
      overrideReason: null,
      reviewNotes:
        "Borderline signals / evidence gaps support Needs Recruiter Review; agree.",
      evidenceChecklist: checklist,
    };
  }

  // Reject
  if (pkg.hardGateResults.includes("explicit_disqualify")) {
    return {
      decision: "agree_reject",
      overrideReason: null,
      reviewNotes: "Explicit hard-gate disqualify confirmed; agree Reject.",
      evidenceChecklist: checklist,
    };
  }

  return {
    decision: "override_to_review",
    overrideReason: "Reject without explicit hard gate — prefer Needs Review.",
    reviewNotes: "Soft reject path not strong enough for Agree — Reject.",
    evidenceChecklist: checklist,
  };
}
