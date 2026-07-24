import {
  P1864_WRITER_REGISTRY,
  listWritersByConflictGroup,
} from "@/lib/p186-4-lifecycle-reconciler/writerRegistry";
import type {
  P1864ConflictFinding,
  P1864FindingKind,
  P1864Severity,
  P1864WriterRecord,
} from "@/lib/p186-4-lifecycle-reconciler/types";

const CORE_TRANSITIONS = [
  "Applied→Needs Review",
  "Needs Review→Qualified",
  "Qualified→Paperwork Needed",
  "Paperwork Needed→Paperwork Sent",
  "Paperwork Sent→viewed",
  "viewed→Signed",
  "Signed→Awaiting DD Verification",
  "Signed→Ready for MEL",
  "Ready for MEL→Loaded in MEL",
] as const;

export type OwnershipCell = {
  transition: string;
  writers: string[];
  ownership:
    | "exactly_one"
    | "multiple"
    | "none"
    | "deprecated_active";
  recommendedOwner: string | null;
};

function writersForTransition(transition: string): P1864WriterRecord[] {
  return P1864_WRITER_REGISTRY.filter(
    (w) =>
      !w.shadowOnly &&
      (w.ownedTransitions.includes(transition) ||
        w.ownedTransitions.some((t) => t.includes(transition.split("→")[1] ?? "")) ||
        w.statesWritable.some((s) => transition.includes(s))),
  );
}

export function buildOwnershipMatrix(): OwnershipCell[] {
  return CORE_TRANSITIONS.map((transition) => {
    const writers = writersForTransition(transition);
    const ids = writers.map((w) => w.writerId);
    const deprecatedActive = writers.filter(
      (w) =>
        w.deprecationStatus === "deprecated_still_referenced" ||
        w.deprecationStatus === "legacy_active",
    );
    let ownership: OwnershipCell["ownership"] = "exactly_one";
    if (ids.length === 0) ownership = "none";
    else if (ids.length > 1) ownership = "multiple";
    else if (deprecatedActive.length > 0) ownership = "deprecated_active";

    const recommended =
      writers
        .filter((w) => w.productionAuthoritative && w.retirementRecommendation === "keep")
        .sort((a, b) => b.priority - a.priority)[0]?.writerId ??
      writers.sort((a, b) => b.priority - a.priority)[0]?.writerId ??
      null;

    return {
      transition,
      writers: ids,
      ownership,
      recommendedOwner: recommended,
    };
  });
}

export function detectDuplicateWriters(): P1864ConflictFinding[] {
  const groups = new Map<string, P1864WriterRecord[]>();
  for (const w of P1864_WRITER_REGISTRY) {
    if (!w.conflictGroup || w.shadowOnly) continue;
    const list = groups.get(w.conflictGroup) ?? [];
    list.push(w);
    groups.set(w.conflictGroup, list);
  }

  const findings: P1864ConflictFinding[] = [];
  for (const [group, writers] of groups) {
    if (writers.length < 2) continue;
    const keepers = writers.filter((w) => w.retirementRecommendation === "keep");
    const legacy = writers.filter(
      (w) =>
        w.retirementRecommendation === "retire_later" ||
        w.retirementRecommendation === "freeze_later",
    );
    const severity: P1864Severity =
      legacy.length >= 2 || writers.length >= 4
        ? "critical"
        : writers.length >= 3
          ? "high"
          : "medium";
    findings.push({
      id: `dup-${group}`,
      kind: "duplicate_writer",
      severity,
      transition: group,
      affectedCandidates: [],
      activeWriters: writers.map((w) => w.writerId),
      recommendedOwner: keepers.sort((a, b) => b.priority - a.priority)[0]?.writerId ?? writers[0]!.writerId,
      recommendedRetirementAction: `Freeze/retire: ${legacy.map((w) => w.writerId).join(", ") || "review group"}`,
      status: "open",
      assignedInvestigationOwner: null,
      detail: `Conflict group "${group}" has ${writers.length} writers`,
    });
  }
  return findings;
}

export function detectMissingIdempotency(): P1864ConflictFinding[] {
  return P1864_WRITER_REGISTRY.filter(
    (w) => w.productionAuthoritative && (w.idempotency === "no" || w.idempotency === "unknown"),
  ).map((w) => ({
    id: `idem-${w.writerId}`,
    kind: "missing_idempotency" as P1864FindingKind,
    severity: "high" as P1864Severity,
    transition: w.ownedTransitions[0] ?? null,
    affectedCandidates: [],
    activeWriters: [w.writerId],
    recommendedOwner: w.writerId,
    recommendedRetirementAction: "Add idempotency keys / dedupe before cutover",
    status: "open" as const,
    assignedInvestigationOwner: null,
    detail: `${w.writerId} lacks strong idempotency`,
  }));
}

export function detectMissingAudit(): P1864ConflictFinding[] {
  return P1864_WRITER_REGISTRY.filter(
    (w) => w.productionAuthoritative && w.auditSupport === "no",
  ).map((w) => ({
    id: `audit-${w.writerId}`,
    kind: "missing_audit" as P1864FindingKind,
    severity: "medium" as P1864Severity,
    transition: w.ownedTransitions[0] ?? null,
    affectedCandidates: [],
    activeWriters: [w.writerId],
    recommendedOwner: w.writerId,
    recommendedRetirementAction: "Add audit trail before freeze/cutover",
    status: "open" as const,
    assignedInvestigationOwner: null,
    detail: `${w.writerId} missing audit support`,
  }));
}

export function detectDirectMutations(): P1864ConflictFinding[] {
  return P1864_WRITER_REGISTRY.filter(
    (w) =>
      w.productionAuthoritative &&
      w.idempotency === "no" &&
      w.trigger === "API",
  ).map((w) => ({
    id: `direct-${w.writerId}`,
    kind: "unsafe_direct_mutation" as P1864FindingKind,
    severity: "high" as P1864Severity,
    transition: w.ownedTransitions[0] ?? null,
    affectedCandidates: [],
    activeWriters: [w.writerId],
    recommendedOwner: "candidate-workflow-store-core",
    recommendedRetirementAction: "Route through gated approval + idempotent upsert",
    status: "open" as const,
    assignedInvestigationOwner: null,
    detail: `${w.writerId} can mutate production without strong idempotency`,
  }));
}

export function detectStaleLegacyWriters(): P1864ConflictFinding[] {
  return P1864_WRITER_REGISTRY.filter(
    (w) =>
      w.deprecationStatus === "deprecated_still_referenced" ||
      w.deprecationStatus === "legacy_active",
  ).map((w) => ({
    id: `stale-${w.writerId}`,
    kind: "stale_legacy_writer" as P1864FindingKind,
    severity:
      w.retirementRecommendation === "retire_later"
        ? ("high" as P1864Severity)
        : ("medium" as P1864Severity),
    transition: w.conflictGroup,
    affectedCandidates: [],
    activeWriters: [w.writerId],
    recommendedOwner:
      listWritersByConflictGroup(w.conflictGroup ?? "")
        .filter((x) => x.retirementRecommendation === "keep")
        .sort((a, b) => b.priority - a.priority)[0]?.writerId ?? "operator",
    recommendedRetirementAction: w.retirementRecommendation,
    status: "open" as const,
    assignedInvestigationOwner: null,
    detail: `${w.writerId} is ${w.deprecationStatus}`,
  }));
}

export function detectUnclearOwnership(): P1864ConflictFinding[] {
  return buildOwnershipMatrix()
    .filter((c) => c.ownership === "none" || c.ownership === "multiple")
    .map((c) => ({
      id: `own-${c.transition}`,
      kind: (c.ownership === "none" ? "unclear_ownership" : "conflicting_authority") as P1864FindingKind,
      severity: (c.ownership === "none" ? "medium" : "high") as P1864Severity,
      transition: c.transition,
      affectedCandidates: [],
      activeWriters: c.writers,
      recommendedOwner: c.recommendedOwner ?? "operator",
      recommendedRetirementAction:
        c.ownership === "none"
          ? "Assign explicit owner in P186.5 cutover design"
          : "Designate single authoritative writer; freeze duplicates",
      status: "open" as const,
      assignedInvestigationOwner: null,
      detail: `Transition ${c.transition}: ownership=${c.ownership}`,
    }));
}

export function runWriterConflictDetection(): P1864ConflictFinding[] {
  return [
    ...detectDuplicateWriters(),
    ...detectMissingIdempotency(),
    ...detectMissingAudit(),
    ...detectDirectMutations(),
    ...detectStaleLegacyWriters(),
    ...detectUnclearOwnership(),
  ];
}
