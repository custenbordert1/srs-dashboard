import { readP1881Flags } from "@/lib/p188-1-hiring-recommendation-workflow/flags";
import type { P1881RecruiterRecoveryResult } from "@/lib/p188-1-hiring-recommendation-workflow/types";

export type RecruiterRecoverySignals = {
  candidateId: string;
  persistedRecruiter?: string | null;
  candidateOwner?: string | null;
  breezyAssignee?: string | null;
  territoryDmRoute?: string | null;
  assignmentAuditRecruiter?: string | null;
  operatorConfirmed?: string | null;
};

function isResolved(name: string | null | undefined): name is string {
  return Boolean(name?.trim() && name.trim() !== "Unassigned");
}

/**
 * Resolve Unassigned recruiters without guessing on ambiguity.
 * Order: persisted → candidate owner → Breezy → territory/DM → audit → operator.
 */
export function recoverRecruiterAssignment(
  signals: RecruiterRecoverySignals,
  forceFlags?: { recruiterAssignmentRecovery: boolean },
): P1881RecruiterRecoveryResult {
  const flags = readP1881Flags(
    forceFlags
      ? { recruiterAssignmentRecovery: forceFlags.recruiterAssignmentRecovery }
      : undefined,
  );
  if (!flags.recruiterAssignmentRecovery) {
    return {
      candidateId: signals.candidateId,
      resolved: false,
      recruiter: null,
      source: null,
      ambiguous: false,
      candidates: [],
      detail: "P188_RECRUITER_ASSIGNMENT_RECOVERY flag is off",
    };
  }

  const ordered: Array<{
    source: NonNullable<P1881RecruiterRecoveryResult["source"]>;
    value: string | null | undefined;
  }> = [
    { source: "persisted", value: signals.persistedRecruiter },
    { source: "candidate_owner", value: signals.candidateOwner },
    { source: "breezy_assignee", value: signals.breezyAssignee },
    { source: "territory_dm", value: signals.territoryDmRoute },
    { source: "assignment_audit", value: signals.assignmentAuditRecruiter },
    { source: "operator_confirmed", value: signals.operatorConfirmed },
  ];

  const unique = new Map<string, NonNullable<P1881RecruiterRecoveryResult["source"]>>();
  for (const row of ordered) {
    if (!isResolved(row.value)) continue;
    const name = row.value.trim();
    if (!unique.has(name)) unique.set(name, row.source);
  }

  const names = [...unique.keys()];
  if (names.length === 0) {
    return {
      candidateId: signals.candidateId,
      resolved: false,
      recruiter: null,
      source: null,
      ambiguous: false,
      candidates: [],
      detail: "No recruiter signals — operator review required",
    };
  }

  if (names.length > 1) {
    // Prefer order: first non-null from priority chain if only one at top levels?
    // Spec: do not guess when multiple owners are possible.
    return {
      candidateId: signals.candidateId,
      resolved: false,
      recruiter: null,
      source: null,
      ambiguous: true,
      candidates: names,
      detail: `Ambiguous recruiters: ${names.join(", ")} — operator confirmation required`,
    };
  }

  const recruiter = names[0]!;
  return {
    candidateId: signals.candidateId,
    resolved: true,
    recruiter,
    source: unique.get(recruiter)!,
    ambiguous: false,
    candidates: [recruiter],
    detail: `Resolved via ${unique.get(recruiter)}`,
  };
}

/**
 * If only one signal exists across the priority chain, resolve it;
 * if multiple distinct names appear, mark ambiguous.
 * If the higher-priority signal is alone, we already handled length===1.
 * Ambiguity is when distinct names exist — even if priority would pick first.
 * Spec: do not guess when multiple owners are possible — keep ambiguous.
 */
export function classifyUnresolvedRecruiters(
  results: P1881RecruiterRecoveryResult[],
): {
  resolved: P1881RecruiterRecoveryResult[];
  unresolved: P1881RecruiterRecoveryResult[];
  ambiguous: P1881RecruiterRecoveryResult[];
} {
  return {
    resolved: results.filter((r) => r.resolved),
    unresolved: results.filter((r) => !r.resolved && !r.ambiguous),
    ambiguous: results.filter((r) => r.ambiguous),
  };
}
