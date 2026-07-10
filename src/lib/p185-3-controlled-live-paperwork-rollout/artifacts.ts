import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import type { P1853ReadinessReport } from "@/lib/p185-3-controlled-live-paperwork-rollout/types";
import { loadP1853State } from "@/lib/p185-3-controlled-live-paperwork-rollout/store";
import { loadP185RunnerState } from "@/lib/p185-production-paperwork-automation-runner";

export type P1853PublicSummary = {
  phase: "P185.3";
  generatedAt: string;
  rolloutId: string | null;
  frozenCohortCount: number;
  finalDryRunEligible: number | null;
  newlyBlocked: number | null;
  liveGateStatus: "ready" | "blocked";
  canaryAttempted: number;
  canaryConfirmed: number;
  canaryFailed: number;
  remainingQueue: number;
  fullRolloutContinued: boolean;
  totalPacketsSent: number;
  totalPacketsConfirmed: number;
  totalSentUnverified: number;
  totalFailed: number;
  duplicatesPrevented: number;
  circuitBreaker: "OPEN" | "Closed";
  killSwitch: boolean;
  nextScheduledAction: string | null;
  rolloutPhase: string;
  blockers: string[];
};

export type P1853ReconciliationSummary = {
  generatedAt: string;
  rolloutId: string | null;
  byState: Record<string, number>;
  alerts: string[];
};

export async function buildP1853PublicSummary(
  readiness: P1853ReadinessReport,
): Promise<P1853PublicSummary> {
  const state = await loadP1853State();
  return {
    phase: "P185.3",
    generatedAt: new Date().toISOString(),
    rolloutId: readiness.rolloutId,
    frozenCohortCount: readiness.frozenCohortCount,
    finalDryRunEligible: readiness.dryRun?.stillEligible ?? null,
    newlyBlocked: readiness.dryRun?.newlyBlocked ?? null,
    liveGateStatus: readiness.liveReady ? "ready" : "blocked",
    canaryAttempted: state.canary.attempted,
    canaryConfirmed: state.canary.confirmed,
    canaryFailed: state.canary.failed,
    remainingQueue: state.backlog.remaining,
    fullRolloutContinued: state.phase === "backlog_releasing" || state.phase === "backlog_complete",
    totalPacketsSent: state.totals.packetsSent,
    totalPacketsConfirmed: state.totals.packetsConfirmed,
    totalSentUnverified: state.totals.sentUnverified,
    totalFailed: state.totals.failed,
    duplicatesPrevented: state.totals.duplicatesPrevented,
    circuitBreaker: state.circuitOpen ? "OPEN" : "Closed",
    killSwitch: state.killSwitch,
    nextScheduledAction: state.nextScheduledAction,
    rolloutPhase: readiness.rolloutPhase,
    blockers: readiness.blockers,
  };
}

export async function buildP1853ReconciliationSummary(): Promise<P1853ReconciliationSummary> {
  const state = await loadP1853State();
  const p185 = await loadP185RunnerState();
  const byState: Record<string, number> = {
    prepared: 0,
    send_requested: 0,
    sent_unverified: 0,
    confirmed_sent: 0,
    viewed: 0,
    signed: 0,
    declined: 0,
    canceled: 0,
    failed: 0,
    unknown: 0,
  };
  for (const env of p185.envelopes) {
    const key = env.state in byState ? env.state : "unknown";
    byState[key] = (byState[key] ?? 0) + 1;
  }
  const alerts: string[] = [];
  if (byState.sent_unverified > 5) {
    alerts.push("sent_unverified beyond threshold");
  }
  if (byState.unknown > 0) alerts.push("unknown envelope state");
  if (byState.declined > 0) alerts.push("packet declined");
  if (byState.canceled > 0) alerts.push("packet canceled");
  if (byState.failed > 0) alerts.push("packet delivery failure");

  return {
    generatedAt: new Date().toISOString(),
    rolloutId: state.cohort?.rolloutId ?? null,
    byState,
    alerts,
  };
}

/** Secured operator report — local only, never commit. */
export async function writeP1853OperatorLocalReport(input: {
  readiness: P1853ReadinessReport;
  dryRunBlocked: Array<{ candidateId: string; reasons: string[] }>;
}): Promise<string> {
  const state = await loadP1853State();
  const report = {
    generatedAt: new Date().toISOString(),
    rolloutId: state.cohort?.rolloutId ?? null,
    phase: state.phase,
    members: (state.cohort?.members ?? []).map((m) => ({
      candidateId: m.candidateId,
      emailHash: m.emailHash,
      templateKey: m.templateKey,
      blockedReason: m.blockedReason,
      removed: m.removed,
      sendStatus:
        state.canary.attempts.find((a) => a.candidateId === m.candidateId)?.state ?? "queued",
      envelopeStatus:
        state.canary.attempts.find((a) => a.candidateId === m.candidateId)?.envelopeIdHash ?? null,
      failureReason:
        state.canary.attempts.find((a) => a.candidateId === m.candidateId)?.error ?? null,
      proposedAction: m.blockedReason
        ? "Review blocker — do not replace with out-of-cohort candidate"
        : state.canary.passed
          ? "Eligible for backlog cycle after canary"
          : "Hold for canary",
    })),
    dryRunBlocked: input.dryRunBlocked.map((b) => ({
      candidateId: b.candidateId,
      reasons: b.reasons,
    })),
    gates: input.readiness.gates,
    // never include secrets
  };
  await safeRecruitingMkdir();
  const out = path.join(recruitingDataDir(), "p185-3-live-paperwork-rollout-operator-local.json");
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return out;
}

export async function writeP1853PublicArtifacts(input: {
  readiness: P1853ReadinessReport;
  markdown: string;
}): Promise<{
  readinessJson: string;
  readinessMd: string;
  summaryJson: string;
  reconciliationJson: string;
}> {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  const summary = await buildP1853PublicSummary(input.readiness);
  const recon = await buildP1853ReconciliationSummary();

  // Strip any accidental secret-like keys from gates (boolean only already)
  const publicReadiness = {
    ...input.readiness,
    gates: { ...input.readiness.gates },
  };

  const readinessJson = path.join(artifactsDir, "p185-3-live-rollout-readiness.json");
  const readinessMd = path.join(artifactsDir, "p185-3-live-rollout-readiness.md");
  const summaryJson = path.join(artifactsDir, "p185-3-live-rollout-summary.json");
  const reconciliationJson = path.join(artifactsDir, "p185-3-envelope-reconciliation-summary.json");

  await writeFile(readinessJson, `${JSON.stringify(publicReadiness, null, 2)}\n`, "utf8");
  await writeFile(readinessMd, input.markdown, "utf8");
  await writeFile(summaryJson, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(reconciliationJson, `${JSON.stringify(recon, null, 2)}\n`, "utf8");

  return { readinessJson, readinessMd, summaryJson, reconciliationJson };
}
