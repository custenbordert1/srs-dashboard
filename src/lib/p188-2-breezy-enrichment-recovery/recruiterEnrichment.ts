import {
  extractBreezyAssignee,
  isEvidenceStale,
  type P1882EnrichmentBundle,
} from "@/lib/p188-2-breezy-enrichment-recovery/sources";
import type {
  P1882Confidence,
  P1882RecruiterEnrichment,
  P1882RecruiterSource,
} from "@/lib/p188-2-breezy-enrichment-recovery/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

function isResolved(name: string | null | undefined): name is string {
  return Boolean(name?.trim() && name.trim() !== "Unassigned");
}

type Signal = {
  source: P1882RecruiterSource;
  value: string | null;
  evidenceReference: string | null;
  confidence: P1882Confidence;
  stale: boolean;
};

/**
 * P188.2 recruiter priority (walk order; refuse conflicts / stale / multi).
 * 1. persisted 2. assignment audit 3. breezy 4. internal 5. unique territory 6. operator
 */
export function resolveRecruiterEnrichment(
  workflow: CandidateWorkflowRecord,
  bundle: P1882EnrichmentBundle,
  nowMs = Date.now(),
): P1882RecruiterEnrichment {
  const candidateId = workflow.candidateId;
  const breezy = bundle.breezyCandidatesById[candidateId];
  const audit = bundle.executedAssignmentByCandidate[candidateId];
  const territoryKey = (
    breezy?.state ||
    workflow.meta?.recruiterAssignmentTrace?.decisionId ||
    ""
  )
    .toString()
    .trim();
  const territoryRecruiter =
    territoryKey && bundle.territoryRecruiterUnique
      ? bundle.territoryRecruiterUnique[territoryKey] ?? null
      : null;

  const internalAssignment =
    workflow.recruiterAssignmentSource === "auto" ||
    workflow.recruiterAssignmentSource === "manual"
      ? workflow.assignedRecruiter
      : null;

  const signals: Signal[] = [
    {
      source: "persisted",
      value: workflow.assignedRecruiter,
      evidenceReference: `workflow:${candidateId}:assignedRecruiter`,
      confidence: "high",
      stale: false,
    },
    {
      source: "assignment_audit",
      value: audit?.recruiter ?? null,
      evidenceReference: audit ? `assignment_audit:${audit.evidenceId}` : null,
      confidence: "high",
      stale: audit ? isEvidenceStale(audit.at, nowMs) : false,
    },
    {
      source: "breezy_assignee",
      value: extractBreezyAssignee(breezy),
      evidenceReference: breezy ? `breezy_candidate:${candidateId}:assignee` : null,
      confidence: "high",
      stale: breezy?.updatedDate ? isEvidenceStale(breezy.updatedDate, nowMs) : false,
    },
    {
      source: "internal_assignment",
      value: isResolved(internalAssignment) ? internalAssignment : null,
      evidenceReference: `workflow:${candidateId}:recruiterAssignmentSource`,
      confidence: "medium",
      stale: false,
    },
    {
      source: "territory_dm",
      value: territoryRecruiter,
      evidenceReference: territoryRecruiter
        ? `territory_unique:${territoryKey}`
        : null,
      confidence: "medium",
      stale: false,
    },
    {
      source: "operator_confirmed",
      value: bundle.operatorConfirmedRecruiter?.[candidateId] ?? null,
      evidenceReference: bundle.operatorConfirmedRecruiter?.[candidateId]
        ? `operator_confirmed_recruiter:${candidateId}`
        : null,
      confidence: "high",
      stale: false,
    },
  ];

  const present = signals.filter((s) => isResolved(s.value));
  if (present.length === 0) {
    return {
      candidateId,
      resolved: false,
      recruiter: null,
      source: null,
      confidence: "none",
      evidenceReference: null,
      ambiguous: false,
      conflicting: false,
      staleEvidence: false,
      alternateCandidates: [],
      operatorActionRequired: "Provide operator-confirmed recruiter mapping",
      detail: "No authoritative recruiter signals",
    };
  }

  const staleOnly = present.every((s) => s.stale);
  if (staleOnly) {
    return {
      candidateId,
      resolved: false,
      recruiter: null,
      source: null,
      confidence: "none",
      evidenceReference: present[0]?.evidenceReference ?? null,
      ambiguous: false,
      conflicting: false,
      staleEvidence: true,
      alternateCandidates: [...new Set(present.map((s) => s.value!.trim()))],
      operatorActionRequired: "Refresh stale recruiter evidence or confirm mapping",
      detail: "All recruiter evidence is stale",
    };
  }

  // Walk priority: first non-stale becomes candidate; later non-stale conflicts refuse.
  let chosen: Signal | null = null;
  const alt = new Set<string>();
  for (const s of present) {
    if (s.stale) continue;
    const name = s.value!.trim();
    if (!chosen) {
      chosen = s;
      continue;
    }
    if (name !== chosen.value!.trim()) {
      alt.add(name);
      alt.add(chosen.value!.trim());
      return {
        candidateId,
        resolved: false,
        recruiter: null,
        source: null,
        confidence: "none",
        evidenceReference: `${chosen.evidenceReference}|${s.evidenceReference}`,
        ambiguous: true,
        conflicting: true,
        staleEvidence: false,
        alternateCandidates: [...alt],
        operatorActionRequired: "Select correct recruiter from conflicting evidence",
        detail: `Conflict between ${chosen.source} and ${s.source}`,
      };
    }
  }

  if (!chosen) {
    return {
      candidateId,
      resolved: false,
      recruiter: null,
      source: null,
      confidence: "none",
      evidenceReference: null,
      ambiguous: false,
      conflicting: false,
      staleEvidence: true,
      alternateCandidates: [],
      operatorActionRequired: "Refresh stale recruiter evidence",
      detail: "Only stale recruiter signals present",
    };
  }

  // Territory without unique map already filtered; ambiguous multi-names at same priority handled via conflict.
  return {
    candidateId,
    resolved: true,
    recruiter: chosen.value!.trim(),
    source: chosen.source,
    confidence: chosen.confidence,
    evidenceReference: chosen.evidenceReference,
    ambiguous: false,
    conflicting: false,
    staleEvidence: false,
    alternateCandidates: [],
    operatorActionRequired: null,
    detail: `Resolved via ${chosen.source}`,
  };
}
