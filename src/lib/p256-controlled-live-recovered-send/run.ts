import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensurePilotMaxSendsForCanary } from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";
import { resolveP256AuthorizedTargets } from "@/lib/p256-controlled-live-recovered-send/cohort";
import { evaluateP256Eligibility } from "@/lib/p256-controlled-live-recovered-send/eligibility";
import { formatP256LiveSendReportMarkdown } from "@/lib/p256-controlled-live-recovered-send/format";
import {
  probeP256AccountQuota,
  runP256ProductionPreflight,
} from "@/lib/p256-controlled-live-recovered-send/preflight";
import { refreshP256AuthorizedCandidates } from "@/lib/p256-controlled-live-recovered-send/refresh";
import { runP256LiveSendLoop } from "@/lib/p256-controlled-live-recovered-send/send";
import {
  P256_CONFIRMATION_PHRASE,
  P256_OPS_DATE,
  P256_PHASE,
  type P256MissionResult,
  type P256QuotaSnapshot,
} from "@/lib/p256-controlled-live-recovered-send/types";
import { verifyP256Integrity } from "@/lib/p256-controlled-live-recovered-send/verify";

function writeArtifact(artifactsDir: string, name: string, value: unknown): string {
  mkdirSync(artifactsDir, { recursive: true });
  const target = path.join(artifactsDir, name);
  writeFileSync(
    target,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  return target;
}

function emptyQuota(error: string | null = null): P256QuotaSnapshot {
  return {
    accountQuotaRemaining: null,
    rateLimitRemaining: null,
    probedAt: new Date().toISOString(),
    error,
  };
}

/**
 * P256 — Controlled live production Dropbox Sign send for P255-recovered
 * authorized candidates only (Sadio Mustafa + Melissa Lloyd).
 */
export async function runP256ControlledLiveRecoveredSend(input?: {
  confirmationPhrase?: string;
  allowNetworkGeocode?: boolean;
  artifactsDir?: string;
  executeLive?: boolean;
  cwd?: string;
}): Promise<P256MissionResult> {
  const generatedAt = new Date().toISOString();
  const cwd = input?.cwd ?? process.cwd();
  const artifactsDir = input?.artifactsDir ?? path.join(cwd, "artifacts");
  const confirmationPhrase = input?.confirmationPhrase?.trim() || P256_CONFIRMATION_PHRASE;
  const executeLive = input?.executeLive !== false;

  // Live pilot env required by operator authorization (P123/P122 gates).
  process.env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED = "true";
  process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE = "true";
  process.env.AUTONOMOUS_PAPERWORK_OPERATOR_GO = "true";
  ensurePilotMaxSendsForCanary(2);

  const authorizedTargets = resolveP256AuthorizedTargets({ cwd });
  const authorizedIds = new Set(authorizedTargets.map((t) => t.candidateId));

  const preflight = await runP256ProductionPreflight({
    confirmationPhrase,
    requireLivePilotEnv: true,
  });

  const quotaBefore: P256QuotaSnapshot = {
    accountQuotaRemaining: preflight.accountQuotaRemaining,
    rateLimitRemaining: preflight.rateLimitRemaining,
    probedAt: new Date().toISOString(),
    error: preflight.ok
      ? null
      : preflight.blockers.find((b) => /quota|account probe/i.test(b)) ?? null,
  };

  const refreshed = await refreshP256AuthorizedCandidates({
    targets: authorizedTargets,
    allowNetworkGeocode: input?.allowNetworkGeocode !== false,
  });

  const eligibility = await evaluateP256Eligibility({
    targets: authorizedTargets,
    workflows: refreshed.workflows,
    candidatesById: refreshed.candidatesById,
    onboardingByCandidateId: refreshed.onboardingByCandidateId,
    opportunityPoints: refreshed.opportunityPoints,
    refreshedIds: refreshed.refreshedIds,
    allowNetworkGeocode: input?.allowNetworkGeocode !== false,
    cwd,
  });

  let sendResult = await runP256LiveSendLoop({
    eligibility,
    preflight: executeLive
      ? preflight
      : {
          ...preflight,
          ok: false,
          aborted: true,
          detail: "executeLive=false — send suppressed",
          blockers: [...preflight.blockers, "executeLive=false"],
        },
    emailByCandidateId: refreshed.emailByCandidateId,
    authorizedIds,
  });

  if (preflight.aborted && !sendResult.abortReason) {
    sendResult = {
      ...sendResult,
      aborted: true,
      abortReason: preflight.detail,
    };
  }

  const integrity = await verifyP256Integrity({
    createdRequestIds: sendResult.createdRequestIds,
  });

  const quotaAfter = executeLive
    ? await probeP256AccountQuota()
    : emptyQuota("executeLive=false — post-send quota probe skipped");

  const mode: P256MissionResult["mode"] = sendResult.aborted
    ? "aborted"
    : sendResult.createdRequestIds.length > 0
      ? "live"
      : preflight.ok
        ? "live"
        : "aborted";

  const result: P256MissionResult = {
    phase: P256_PHASE,
    opsDate: P256_OPS_DATE,
    generatedAt,
    mode,
    productionModeConfirmed: preflight.productionModeConfirmed,
    testMode: preflight.testMode,
    aborted: sendResult.aborted || preflight.aborted,
    abortReason: sendResult.abortReason ?? (preflight.aborted ? preflight.detail : null),
    authorizedTargets,
    refresh: refreshed.summary,
    preflight,
    quotaBefore,
    quotaAfter,
    counts: sendResult.counts,
    candidates: sendResult.rows,
    integrity,
    auditTrail: sendResult.auditTrail,
    artifacts: [],
    safety: {
      liveModeAuthorized: true,
      productionDropboxOnly: true,
      testModeForbidden: true,
      onlyAuthorizedCandidates: true,
      noBulkSends: true,
      noRetriesOnFailure: true,
      simulatedSends: 0,
      reminderEmailsSent: 0,
      melWrites: 0,
      breezyStageWrites: 0,
      duplicateCreatingRetries: 0,
      unauthorizedAttempts: 0,
    },
  };

  const jsonRel = path.join("artifacts", "p256-live-send-report.json");
  const mdRel = path.join("artifacts", "p256-live-send-report.md");
  result.artifacts = [jsonRel, mdRel];
  writeArtifact(artifactsDir, "p256-live-send-report.json", result);
  writeArtifact(
    artifactsDir,
    "p256-live-send-report.md",
    formatP256LiveSendReportMarkdown(result),
  );

  return result;
}
