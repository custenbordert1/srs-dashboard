import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listIngestedCandidates } from "@/lib/candidate-ingestion/ingestion-store";
import { evaluateP253Eligibility } from "@/lib/p253-controlled-live-paperwork-send/eligibility";
import { formatP253LiveSendSummaryMarkdown } from "@/lib/p253-controlled-live-paperwork-send/format";
import { runP253ProductionPreflight } from "@/lib/p253-controlled-live-paperwork-send/preflight";
import { refreshP253Data } from "@/lib/p253-controlled-live-paperwork-send/refresh";
import { runP253LiveSendLoop } from "@/lib/p253-controlled-live-paperwork-send/send";
import {
  P253_CONFIRMATION_PHRASE,
  P253_OPS_DATE,
  P253_PHASE,
  type P253MissionResult,
} from "@/lib/p253-controlled-live-paperwork-send/types";
import { verifyP253Integrity } from "@/lib/p253-controlled-live-paperwork-send/verify";
import { ensurePilotMaxSendsForCanary } from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";

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

export async function runP253ControlledLivePaperworkSend(input?: {
  confirmationPhrase?: string;
  allowNetworkGeocode?: boolean;
  artifactsDir?: string;
  /** When false, skip live send even if preflight passes (tests). Default true for mission. */
  executeLive?: boolean;
}): Promise<P253MissionResult> {
  const generatedAt = new Date().toISOString();
  const artifactsDir = input?.artifactsDir ?? path.join(process.cwd(), "artifacts");
  const confirmationPhrase = input?.confirmationPhrase?.trim() || P253_CONFIRMATION_PHRASE;
  const executeLive = input?.executeLive !== false;

  // Live pilot env required by operator authorization.
  process.env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED = "true";
  process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE = "true";
  process.env.AUTONOMOUS_PAPERWORK_OPERATOR_GO = "true";
  ensurePilotMaxSendsForCanary(25);

  const preflight = await runP253ProductionPreflight({
    confirmationPhrase,
    requireLivePilotEnv: true,
  });

  const refreshed = await refreshP253Data({
    allowNetworkGeocode: input?.allowNetworkGeocode !== false,
  });

  const candidates = listIngestedCandidates(refreshed.store);
  const candidatesById = new Map(candidates.map((c) => [c.candidateId, c]));
  const emailByCandidateId = new Map(
    candidates
      .map((c) => [c.candidateId, String(c.email ?? "").trim()] as const)
      .filter(([, email]) => Boolean(email)),
  );

  const eligibility = await evaluateP253Eligibility({
    workflows: refreshed.workflows,
    candidatesById,
    onboardingByCandidateId: refreshed.onboardingByCandidateId,
    opportunityPoints: refreshed.opportunityPoints,
    allowNetworkGeocode: input?.allowNetworkGeocode !== false,
  });

  let sendResult = await runP253LiveSendLoop({
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
    emailByCandidateId,
  });

  // If preflight already aborted, preserve that reason.
  if (preflight.aborted && !sendResult.abortReason) {
    sendResult = {
      ...sendResult,
      aborted: true,
      abortReason: preflight.detail,
    };
  }

  const integrity = await verifyP253Integrity({
    createdRequestIds: sendResult.createdRequestIds,
  });

  const mode: P253MissionResult["mode"] = sendResult.aborted
    ? "aborted"
    : sendResult.createdRequestIds.length > 0
      ? "live"
      : preflight.ok
        ? "live"
        : "aborted";

  const result: P253MissionResult = {
    phase: P253_PHASE,
    opsDate: P253_OPS_DATE,
    generatedAt,
    mode,
    productionModeConfirmed: preflight.productionModeConfirmed,
    testMode: preflight.testMode,
    aborted: sendResult.aborted || preflight.aborted,
    abortReason: sendResult.abortReason ?? (preflight.aborted ? preflight.detail : null),
    refresh: refreshed.summary,
    preflight,
    counts: sendResult.counts,
    candidates: sendResult.rows,
    integrity,
    auditTrail: sendResult.auditTrail,
    artifacts: [],
    safety: {
      liveModeAuthorized: true,
      productionDropboxOnly: true,
      testModeForbidden: true,
      simulatedSends: 0,
      reminderEmailsSent: 0,
      melWrites: 0,
      breezyStageWrites: 0,
      duplicateCreatingRetries: 0,
    },
  };

  const jsonRel = path.join("artifacts", "p253-live-send.json");
  const mdRel = path.join("artifacts", "p253-live-send-summary.md");
  result.artifacts = [jsonRel, mdRel];
  writeArtifact(artifactsDir, "p253-live-send.json", result);
  writeArtifact(
    artifactsDir,
    "p253-live-send-summary.md",
    formatP253LiveSendSummaryMarkdown(result),
  );

  return result;
}
