import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type {
  P2041AgreementClass,
  P2041RecommendationLabel,
  P2041RecommendationRecord,
} from "@/lib/p204-1-supervised-qualification-pilot/types";

/** Infer historical recruiter outcome from prior audit/history text only (post-hoc). */
export function inferHistoricalRecruiterDecision(
  workflow: CandidateWorkflowRecord | undefined,
): P2041RecommendationLabel | null {
  if (!workflow) return null;
  const blob = [
    ...(workflow.notes ?? []),
    ...(workflow.history ?? []).map((h) => h.message ?? ""),
  ].join("\n");

  if (/Status changed to Not Qualified|marked not qualified|reject(ed)? candidate/i.test(blob)) {
    return "Reject";
  }
  if (
    /Status changed to Paperwork Needed|Interview completed — ready for paperwork|move-paperwork|ready for paperwork/i.test(
      blob,
    )
  ) {
    return "Advance";
  }
  if (/Needs Review|needs recruiter|manual review|hold for review/i.test(blob)) {
    return "Needs Recruiter Review";
  }
  return null;
}

export function classifyAgreement(
  ai: P2041RecommendationLabel,
  historical: P2041RecommendationLabel | null,
): P2041AgreementClass {
  if (!historical) return "insufficient_evidence";
  if (ai === historical) return "exact_agreement";

  const order: Record<P2041RecommendationLabel, number> = {
    Reject: 0,
    "Needs Recruiter Review": 1,
    Advance: 2,
  };
  if (Math.abs(order[ai] - order[historical]) === 1) {
    if (order[ai] < order[historical]) return "ai_more_conservative";
    return "ai_more_aggressive";
  }
  if (order[ai] < order[historical]) return "ai_more_conservative";
  if (order[ai] > order[historical]) return "ai_more_aggressive";
  return "disagreement";
}

export function buildP2041AgreementAnalysis(input: {
  records: P2041RecommendationRecord[];
  workflows: Record<string, CandidateWorkflowRecord>;
}): {
  pairs: Array<{
    redactedCandidateId: string;
    ai: P2041RecommendationLabel;
    historical: P2041RecommendationLabel | null;
    classification: P2041AgreementClass;
  }>;
  counts: Record<P2041AgreementClass, number>;
  historicalAgreementRate: number;
  exactAgreementRate: number;
} {
  const pairs = input.records.map((r) => {
    const historical = inferHistoricalRecruiterDecision(input.workflows[r.candidateId]);
    const classification = classifyAgreement(r.recommendation, historical);
    return {
      redactedCandidateId: r.redactedCandidateId,
      ai: r.recommendation,
      historical,
      classification,
    };
  });

  const counts: Record<P2041AgreementClass, number> = {
    exact_agreement: 0,
    partial_agreement: 0,
    disagreement: 0,
    ai_more_conservative: 0,
    ai_more_aggressive: 0,
    insufficient_evidence: 0,
  };
  for (const p of pairs) {
    if (p.classification === "ai_more_conservative" || p.classification === "ai_more_aggressive") {
      counts.partial_agreement += 1;
    }
    counts[p.classification] += 1;
  }

  const comparable = pairs.filter((p) => p.historical != null);
  const exact = pairs.filter((p) => p.classification === "exact_agreement").length;
  const agreeing =
    exact +
    pairs.filter(
      (p) =>
        p.classification === "ai_more_conservative" || p.classification === "ai_more_aggressive",
    ).length;

  return {
    pairs,
    counts,
    historicalAgreementRate:
      comparable.length === 0 ? 0 : Math.round((agreeing / comparable.length) * 1000) / 10,
    exactAgreementRate:
      comparable.length === 0 ? 0 : Math.round((exact / comparable.length) * 1000) / 10,
  };
}
