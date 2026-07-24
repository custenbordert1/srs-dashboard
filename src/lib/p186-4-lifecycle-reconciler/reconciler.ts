import { readP1864Flags } from "@/lib/p186-4-lifecycle-reconciler/flags";
import { listWritersByConflictGroup } from "@/lib/p186-4-lifecycle-reconciler/writerRegistry";
import type {
  P1864FindingKind,
  P1864ReconcileFinding,
  P1864ReconcileSourceSnapshot,
  P1864Severity,
} from "@/lib/p186-4-lifecycle-reconciler/types";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function mapPaperwork(s: string | null): string | null {
  const n = norm(s);
  if (!n) return null;
  if (n.includes("signed")) return "signed";
  if (n.includes("view")) return "viewed";
  if (n.includes("sent")) return "sent";
  if (n.includes("fail") || n.includes("declin")) return "failed";
  return n;
}

/**
 * Read-only multi-source reconciler.
 * Never repairs production, never sends paperwork, never advances candidates, never writes MEL.
 */
export function reconcileCandidateSources(
  sources: P1864ReconcileSourceSnapshot,
): P1864ReconcileFinding[] {
  const findings: P1864ReconcileFinding[] = [];
  const prod = norm(sources.productionWorkflowState);
  const shadow = norm(sources.shadowLifecycleState);
  const paperwork = mapPaperwork(sources.paperworkEngineState) ?? mapPaperwork(sources.dropboxSignState);
  const breezy = norm(sources.breezyState);
  const mel =
    norm(sources.readyForMelState) ||
    (prod.includes("ready for mel") ? "ready_for_mel" : "") ||
    (prod.includes("loaded in mel") ? "exported" : "");
  const onboarding = norm(sources.onboardingState);

  const push = (
    severity: P1864Severity,
    kind: P1864FindingKind,
    detail: string,
    authoritative: string,
    writers: string[],
    action: string,
  ) => {
    findings.push({
      candidateId: sources.candidateId,
      severity,
      kind,
      likelyAuthoritativeSource: authoritative,
      conflictingWriters: writers,
      recommendedOperatorAction: action,
      detail,
      sources,
    });
  };

  if (!shadow && prod) {
    push(
      "high",
      "unclear_ownership",
      "Production workflow present but P186 shadow missing",
      "production_workflow",
      ["p186-2-event-adapters"],
      "Request shadow reconciliation (observe-only)",
    );
  }

  if (shadow && prod) {
    const shadowImpliesSent = shadow.includes("paperwork_sent") || shadow === "viewed" || shadow === "signed";
    const prodImpliesSent = prod.includes("paperwork sent") || prod.includes("signed");
    if (shadowImpliesSent !== prodImpliesSent) {
      push(
        "critical",
        "conflicting_authority",
        `Shadow ${sources.shadowLifecycleState} disagrees with production ${sources.productionWorkflowState}`,
        "production_workflow",
        listWritersByConflictGroup("paperwork_send").map((w) => w.writerId),
        "Investigate duplicate send/monitor writers; do not auto-repair",
      );
    }
  }

  if (paperwork === "signed" && prod && !prod.includes("signed") && !prod.includes("ready for mel") && !prod.includes("awaiting")) {
    push(
      "high",
      "conflicting_authority",
      "Dropbox/paperwork shows signed but production workflow not advanced",
      "dropbox_sign",
      ["dropbox-sign-webhook", "p107-paperwork-monitor"],
      "Run read-only monitor check; do not force status from P186",
    );
  }

  if (breezy && prod && breezy !== prod && !prod.includes(breezy)) {
    push(
      "medium",
      "conflicting_authority",
      `Breezy stage "${sources.breezyState}" vs production "${sources.productionWorkflowState}"`,
      "production_workflow",
      ["p175-breezy-export-import", "candidate-ingestion-backfill"],
      "Review Breezy sync; production remains SoR",
    );
  }

  if (mel && shadow && !shadow.includes("ready_for_mel") && !shadow.includes("exported") && !shadow.includes("onboarding")) {
    push(
      "medium",
      "conflicting_authority",
      "Ready-for-MEL signal present but shadow not aligned",
      "production_workflow",
      ["candidate-onboarding-engine", "hiring-automation-engine", "p107-paperwork-monitor"],
      "Observe-only — schedule shadow projection after production settles",
    );
  }

  if (onboarding && prod.includes("signed") && !prod.includes("awaiting") && !prod.includes("ready")) {
    push(
      "low",
      "no_issue",
      "Onboarding signal present with signed production — monitor DD completion",
      "direct-deposit-workflow",
      ["direct-deposit-workflow"],
      "No action unless DD stalled",
    );
  }

  if (findings.length === 0) {
    push(
      "info",
      "no_issue",
      "Sources aligned within read-only comparison",
      "production_workflow",
      [],
      "None",
    );
  }

  return findings.filter((f) => f.kind !== "no_issue" || findings.length === 1);
}

export function assignSeverity(finding: P1864ReconcileFinding): P1864Severity {
  return finding.severity;
}

export function runShadowLifecycleReconciler(input: {
  cohort: P1864ReconcileSourceSnapshot[];
  forceFlags?: { reconcilerExecution: boolean };
}): {
  ok: boolean;
  readOnly: true;
  findings: P1864ReconcileFinding[];
  productionMutations: 0;
  paperworkSends: 0;
  melWrites: 0;
  detail: string;
} {
  const flags = readP1864Flags(
    input.forceFlags ? { reconcilerExecution: input.forceFlags.reconcilerExecution } : undefined,
  );
  if (!flags.reconcilerExecution) {
    return {
      ok: false,
      readOnly: true,
      findings: [],
      productionMutations: 0,
      paperworkSends: 0,
      melWrites: 0,
      detail: "P186_RECONCILER_EXECUTION flag is off",
    };
  }

  const findings = input.cohort.flatMap((c) => reconcileCandidateSources(c));
  return {
    ok: true,
    readOnly: true,
    findings,
    productionMutations: 0,
    paperworkSends: 0,
    melWrites: 0,
    detail: `Reconciled ${input.cohort.length} candidates; ${findings.length} findings; no mutations`,
  };
}
