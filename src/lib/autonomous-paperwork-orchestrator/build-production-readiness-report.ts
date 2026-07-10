import { runPaperworkCycle } from "@/lib/autonomous-paperwork-orchestrator/execute-paperwork-cycle";
import { RETRY_BACKOFF_MS } from "@/lib/autonomous-paperwork-orchestrator/retry-engine";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import type { ProductionReadinessReport } from "@/lib/autonomous-paperwork-orchestrator/types";
import { P123_SOURCE_PHASE } from "@/lib/autonomous-paperwork-orchestrator/types";

export async function buildProductionReadinessReport(): Promise<ProductionReadinessReport> {
  const { report } = await runPaperworkCycle({ dryRun: true });
  const pilotConfig = loadPilotConfig();

  const checklist: ProductionReadinessReport["productionChecklist"] = [
    {
      item: "executeOne only (no executeBatch)",
      status: "COMPLETE" as const,
      notes: "Orchestrator delegates to P122 pilot executeOne path only.",
    },
    {
      item: "P122 pilot safety gates preserved",
      status: report.safetyState.goNoGo === "GO" ? ("COMPLETE" as const) : ("PARTIAL" as const),
      notes: report.safetyState.reason,
    },
    {
      item: "Pilot allowlist configured",
      status: pilotConfig.allowlist.length > 0 ? ("COMPLETE" as const) : ("NOT_READY" as const),
      notes:
        pilotConfig.allowlist.length > 0
          ? `${pilotConfig.allowlist.length} allowlisted candidate(s).`
          : "AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST is empty.",
    },
    {
      item: "Operator GO",
      status: pilotConfig.operatorGo ? ("COMPLETE" as const) : ("NOT_READY" as const),
      notes: pilotConfig.operatorGo ? "AUTONOMOUS_PAPERWORK_OPERATOR_GO=true" : "Operator GO not set.",
    },
    {
      item: "Live mode enabled",
      status: pilotConfig.liveModeEnabled ? ("COMPLETE" as const) : ("NOT_READY" as const),
      notes: pilotConfig.liveModeEnabled
        ? "AUTONOMOUS_PAPERWORK_LIVE_MODE=true"
        : "Live mode disabled (safe default).",
    },
    {
      item: "Ready candidate queue",
      status: report.readyCandidates.length > 0 ? ("COMPLETE" as const) : ("PARTIAL" as const),
      notes: `${report.readyCandidates.length} ready, ${report.blockedCandidates.length} blocked.`,
    },
  ];

  const notReady = checklist.filter((entry) => entry.status === "NOT_READY");
  const partial = checklist.filter((entry) => entry.status === "PARTIAL");

  let goNoGo: ProductionReadinessReport["goNoGo"] = "GO";
  let goNoGoReason = "Orchestrator ready for controlled executeOne pilot cycles.";

  if (notReady.length >= 3) {
    goNoGo = "NO-GO";
    goNoGoReason = notReady.map((entry) => entry.notes).join(" ");
  } else if (notReady.length > 0 || partial.length > 0) {
    goNoGo = "GO WITH CONDITIONS";
    goNoGoReason = [...notReady, ...partial].map((entry) => entry.notes).join(" ");
  }

  return {
    sourcePhase: P123_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    currentQueue: report.sendQueue,
    readyCandidates: report.readyCandidates,
    blockedCandidates: report.blockedCandidates,
    safetyGates: report.safetyState,
    pilotConfiguration: {
      pilotEnabled: pilotConfig.pilotEnabled,
      liveModeEnabled: pilotConfig.liveModeEnabled,
      operatorGo: pilotConfig.operatorGo,
      maxSends: pilotConfig.maxSends,
      allowlist: pilotConfig.allowlist,
    },
    operatorConfiguration: {
      operatorMode: report.operatorMode,
      approvalRequired: report.approvalRequired,
    },
    retryPolicy: {
      retryable: ["timeouts", "Dropbox temporary errors", "network failures"],
      neverRetry: ["duplicate send", "already signed", "already sent", "invalid email", "manual rejection"],
      backoffMs: RETRY_BACKOFF_MS,
    },
    executionFlow: [
      "Candidate Ready Queue",
      "Eligibility Engine",
      "Safety Validation",
      "Approval Decision",
      "Send Queue",
      "executeOne()",
      "Dropbox Sign",
      "Audit",
      "Monitoring",
      "Ready for Onboarding",
    ],
    productionChecklist: checklist,
    knownBlockers: report.blockedCandidates.slice(0, 10).map((candidate) => {
      return `${candidate.candidateName}: ${candidate.blockingReasons[0] ?? candidate.eligibilityStatus}`;
    }),
    riskAssessment: [
      "Broad autonomous sending is not enabled — executeOne pilot cap enforced.",
      "Duplicate and already_sent protections remain mandatory.",
      report.blockedCandidates.length > report.readyCandidates.length
        ? "Blocked candidates exceed ready queue — mapping and recruiter gates remain primary risk."
        : "Queue has send-ready candidates under pilot constraints.",
    ],
    goNoGo,
    goNoGoReason,
  };
}
