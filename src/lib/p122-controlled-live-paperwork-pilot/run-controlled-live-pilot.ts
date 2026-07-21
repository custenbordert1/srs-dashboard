import { executeControlledLiveSend } from "@/lib/controlled-live-send/execute-controlled-live-send";
import type { ExecuteOnboardingSendDeps } from "@/lib/candidate-onboarding-send-queue/execute-onboarding-send";
import { buildControlledLivePaperworkPilotReport } from "@/lib/p122-controlled-live-paperwork-pilot/build-pilot-report";
import { buildPilotSendPacketPreview } from "@/lib/p122-controlled-live-paperwork-pilot/build-send-packet-preview";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { recordPilotSend } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import {
  P122_CONFIRMATION_PHRASE,
  type ControlledLivePaperworkPilotReport,
  type PilotSendPacketPreview,
  type PilotSendResult,
} from "@/lib/p122-controlled-live-paperwork-pilot/types";

export type RunControlledLivePaperworkPilotInput = {
  dryRun?: boolean;
  confirmationPhrase?: string;
  candidateId?: string;
  byUserId?: string;
  /** Optional pilot config override (e.g. P243 seeds allowlist for the target). */
  config?: ReturnType<typeof loadPilotConfig>;
  /**
   * Allow execute when safetyChecks pass even if status !== ready_to_send
   * (e.g. call_first_required). Hard gates in safetyChecks still apply.
   */
  forceReadyToSend?: boolean;
  sendDeps?: ExecuteOnboardingSendDeps;
  executeLiveSend?: typeof executeControlledLiveSend;
  reportOverride?: ControlledLivePaperworkPilotReport;
};

export type RunControlledLivePaperworkPilotResult = {
  report: ControlledLivePaperworkPilotReport;
  sendPacketPreview: PilotSendPacketPreview | null;
  sendResult: PilotSendResult;
  executedMode: "dryRun" | "executeOne" | "none";
  executeBatchCalled: false;
};

function buildNotExecutedResult(candidateId: string | null, candidateName: string | null, reason: string): PilotSendResult {
  return {
    executedAt: new Date().toISOString(),
    candidateId: candidateId ?? "",
    candidateName: candidateName ?? "",
    outcome: "not_executed",
    signatureRequestId: null,
    error: reason,
    mode: "dryRun",
  };
}

export function formatPilotSendPreviewLines(preview: PilotSendPacketPreview): string[] {
  return [
    `Candidate name: ${preview.candidateName}`,
    `Candidate email: ${preview.candidateEmail}`,
    `Job/project: ${preview.jobOrProject}`,
    `Paperwork template: ${preview.paperworkTemplate}`,
    `Audit destination: ${preview.auditDestination}`,
    "Safety checks:",
    ...preview.safetyChecks.map((check) => `  - ${check.label}: ${check.passed ? "PASS" : "FAIL"} (${check.detail})`),
    `Required confirmation phrase: ${P122_CONFIRMATION_PHRASE}`,
  ];
}

export async function runControlledLivePaperworkPilot(
  input: RunControlledLivePaperworkPilotInput = {},
): Promise<RunControlledLivePaperworkPilotResult> {
  const dryRun = input.dryRun !== false;
  const baseConfig = input.config ?? loadPilotConfig();
  // Explicit candidateId (P243 canary / open-stores) must be on the allowlist for this send.
  const config =
    input.candidateId && !baseConfig.allowlist.includes(input.candidateId)
      ? {
          ...baseConfig,
          allowlist: [...baseConfig.allowlist, input.candidateId],
        }
      : baseConfig;
  const executeLiveSend = input.executeLiveSend ?? executeControlledLiveSend;

  const report =
    input.reportOverride ??
    (await buildControlledLivePaperworkPilotReport({
      dryRun,
      confirmationPhrase: input.confirmationPhrase,
      candidateId: input.candidateId,
      config,
    }));

  const target =
    report.allowlistedCandidates.find((entry) =>
      input.candidateId ? entry.candidateId === input.candidateId : entry.status === "ready_to_send",
    ) ??
    (input.candidateId
      ? report.evaluatedCandidates.find((entry) => entry.candidateId === input.candidateId) ?? null
      : null);

  const forceReadyToSend = input.forceReadyToSend === true;
  const requiredSafetyIds = [
    "on_allowlist",
    "not_already_sent",
    "no_duplicate_risk",
    "valid_email",
    "approved_mapping_or_native_project",
    "pilot_cap_available",
  ] as const;
  const safetyChecksPass = Boolean(
    target &&
      target.email &&
      target.baselineBlocker !== "missing_candidate_match" &&
      requiredSafetyIds.every((id) =>
        target.safetyChecks.some((check) => check.id === id && check.passed),
      ),
  );

  const sendPacketPreview = target
    ? buildPilotSendPacketPreview({
        candidate: target,
        auditDestination: report.auditRecordPath,
        forceReadyToSend: forceReadyToSend && safetyChecksPass,
      })
    : report.sendPacketPreview;

  if (dryRun) {
    return {
      report,
      sendPacketPreview,
      sendResult: buildNotExecutedResult(
        target?.candidateId ?? null,
        target?.candidateName ?? null,
        "dryRun default — no send executed.",
      ),
      executedMode: "dryRun",
      executeBatchCalled: false,
    };
  }

  const readyEnough =
    target &&
    (target.status === "ready_to_send" || (forceReadyToSend && safetyChecksPass)) &&
    sendPacketPreview;

  if (report.goNoGo !== "GO" || !readyEnough) {
    const reason =
      report.goNoGo !== "GO"
        ? report.goNoGoReason
        : !target
          ? `No allowlisted pilot target for candidateId=${input.candidateId ?? "none"} (allowlist size=${config.allowlist.length}).`
          : target.status !== "ready_to_send" && !(forceReadyToSend && safetyChecksPass)
            ? `Pilot candidate blocked: ${target.blockingReasons.join(" ") || target.baselineBlocker || "not ready_to_send"}`
            : !sendPacketPreview
              ? "Send packet preview missing."
              : "Pilot execute blocked.";
    return {
      report,
      sendPacketPreview,
      sendResult: buildNotExecutedResult(
        target?.candidateId ?? input.candidateId ?? null,
        target?.candidateName ?? null,
        reason,
      ),
      executedMode: "none",
      executeBatchCalled: false,
    };
  }

  const live = await executeLiveSend({
    mode: "executeOne",
    executiveApprovalFlag: true,
    candidateId: target.candidateId,
    byUserId: input.byUserId ?? "p122-controlled-live-paperwork-pilot",
    mtdOnly: false,
    forceReadyToSend,
    sendDeps: input.sendDeps,
  });

  const sent = live.executed.find((entry) => entry.outcome === "sent") ?? null;
  const sendResult: PilotSendResult = {
    executedAt: new Date().toISOString(),
    candidateId: target.candidateId,
    candidateName: target.candidateName,
    outcome: sent ? "sent" : live.executed[0]?.outcome === "failed" ? "failed" : "skipped",
    signatureRequestId: sent?.signatureRequestId ?? null,
    error: sent ? null : live.executed[0]?.error ?? live.stopReason,
    mode: "executeOne",
  };

  if (sent) {
    await recordPilotSend({
      candidateId: target.candidateId,
      candidateName: target.candidateName,
      signatureRequestId: sent.signatureRequestId ?? null,
      auditEntryId: sent.id,
      sendResult,
    });
  }

  const refreshedReport = await buildControlledLivePaperworkPilotReport({
    dryRun: true,
    candidateId: target.candidateId,
    config,
  });

  return {
    report: {
      ...refreshedReport,
      sendResult,
      goNoGo: sent ? "GO" : "NO-GO",
      goNoGoReason: sent ? "Pilot send completed via executeOne." : sendResult.error ?? "Send did not complete.",
    },
    sendPacketPreview,
    sendResult,
    executedMode: "executeOne",
    executeBatchCalled: false,
  };
}
