import type {
  P1932AiReviewRow,
  P1932FrozenCohort,
  P1932OperatorReviewItem,
} from "@/lib/p193-2-simplified-lifecycle-pilot/types";

/**
 * Build operator review package. Qualified subset may be confirmed by pilot authority
 * (this prompt) after preview completes — never auto-sends.
 */
export function buildP1932OperatorReviewPackage(input: {
  cohort: P1932FrozenCohort;
  aiRows: P1932AiReviewRow[];
  /** When true, mark Qualified rows operatorConfirmed (post-preview authorization). */
  confirmQualified?: boolean;
}): {
  generatedAt: string;
  pilotId: string;
  fingerprint: string;
  items: P1932OperatorReviewItem[];
  confirmedQualifiedIds: string[];
} {
  const byId = new Map(input.aiRows.map((r) => [r.candidateId, r]));
  const items: P1932OperatorReviewItem[] = [];
  const confirmedQualifiedIds: string[] = [];

  for (const member of input.cohort.members) {
    const ai = byId.get(member.candidateId);
    const decision = ai?.decision ?? "Needs Human Review";
    const blockers = [...(ai?.missingData ?? []), ...(ai?.reasons ?? [])];
    if (ai?.borderline) blockers.push("borderline_confidence");
    if (ai?.duplicateSuspect) blockers.push("duplicate_suspect");

    const predictedPaperworkEligible =
      decision === "Qualified" &&
      !ai?.duplicateSuspect &&
      (ai?.confidence ?? 0) >= 72 &&
      !ai?.borderline;

    const operatorConfirmed =
      Boolean(input.confirmQualified) && decision === "Qualified" && predictedPaperworkEligible;

    if (operatorConfirmed) confirmedQualifiedIds.push(member.candidateId);

    items.push({
      candidateId: member.candidateId,
      positionName: member.positionName,
      location: [member.city, member.state].filter(Boolean).join(", ") || member.zipCode || "",
      qualificationResult: decision,
      confidence: ai?.confidence ?? 0,
      evidence: [
        `resumeScore=${ai?.resumeScore ?? "n/a"}`,
        `questionnaireScore=${ai?.questionnaireScore ?? "n/a"}`,
        `experienceYears=${ai?.experienceYears ?? "n/a"}`,
        `nearbyJobs=${ai?.nearbyJobCount ?? 0}`,
        `distance=${ai?.distanceToNearestWorkMiles ?? "n/a"}`,
        ...(ai?.explanation ? [ai.explanation.slice(0, 240)] : []),
      ],
      blockers: decision === "Qualified" ? blockers.filter((b) => !b.startsWith("confidence")) : blockers,
      predictedPaperworkEligible,
      expectedNextStage:
        decision === "Qualified"
          ? "Qualified → Paperwork Needed (bridge) → P192 send"
          : decision === "Needs Human Review"
            ? "Needs Human Review (no send)"
            : "Not Qualified (no send; no auto-reject action beyond staging)",
      operatorConfirmed,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    pilotId: input.cohort.pilotId,
    fingerprint: input.cohort.fingerprint,
    items,
    confirmedQualifiedIds,
  };
}
