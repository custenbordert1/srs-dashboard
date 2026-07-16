import type {
  P207DropboxDiagnostics,
  P207HealthTone,
  P207SubsystemScore,
} from "@/lib/p207-autonomous-readiness-dashboard/types";

export function healthTone(score: number): P207HealthTone {
  if (score >= 80) return "healthy";
  if (score >= 60) return "warning";
  return "critical";
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeP207SubsystemScores(input: {
  applied: number;
  needsReview: number;
  paperworkNeeded: number;
  paperworkSent: number;
  signed: number;
  readyForMel: number;
  rejected: number;
  total: number;
  dropbox: P207DropboxDiagnostics;
  aiApprovedCount: number;
  questionnaireCoveragePct: number;
  sendReadyCount: number;
  awaitingSignature: number;
}): { scores: P207SubsystemScore[]; overall: number; tone: P207HealthTone } {
  const total = Math.max(1, input.total);

  const aiScore = clamp(
    40 +
      input.questionnaireCoveragePct * 0.35 +
      Math.min(25, (input.aiApprovedCount / total) * 100),
  );
  const lifecycleScore = clamp(
    100 -
      (input.needsReview / total) * 80 -
      (input.applied > 0 && input.paperworkNeeded === 0 ? 10 : 0),
  );
  const paperworkQueueScore = clamp(
    input.dropbox.vendorBlocked
      ? Math.max(20, 55 - Math.min(30, input.paperworkNeeded / 5))
      : 70 + Math.min(30, input.sendReadyCount * 3),
  );
  const dropboxScore = clamp(
    input.dropbox.vendorBlocked
      ? 25
      : input.dropbox.softwareReady
        ? 92
        : input.dropbox.configurationStatus === "misconfigured"
          ? 35
          : 55,
  );
  const statusSyncScore = clamp(
    85 -
      (input.dropbox.apiStatus === "error" ? 25 : 0) -
      (input.awaitingSignature > 50 ? 10 : 0),
  );
  const melScore = clamp(
    input.signed === 0
      ? 70
      : 40 + Math.min(50, (input.readyForMel / Math.max(1, input.signed)) * 100),
  );

  const scores: P207SubsystemScore[] = [
    {
      id: "ai_qualification",
      label: "AI Qualification",
      score: aiScore,
      tone: healthTone(aiScore),
      detail: `${input.aiApprovedCount} AI/operator-approved signals`,
    },
    {
      id: "lifecycle",
      label: "Lifecycle",
      score: lifecycleScore,
      tone: healthTone(lifecycleScore),
      detail: `${input.paperworkNeeded} Paperwork Needed · ${input.needsReview} Needs Review`,
    },
    {
      id: "paperwork_queue",
      label: "Paperwork Queue",
      score: paperworkQueueScore,
      tone: healthTone(paperworkQueueScore),
      detail: `${input.sendReadyCount} send-ready · ${input.paperworkNeeded} waiting`,
    },
    {
      id: "dropbox",
      label: "Dropbox",
      score: dropboxScore,
      tone: healthTone(dropboxScore),
      detail: input.dropbox.detail,
    },
    {
      id: "status_sync",
      label: "Status Sync",
      score: statusSyncScore,
      tone: healthTone(statusSyncScore),
      detail: `API ${input.dropbox.apiStatus}`,
    },
    {
      id: "ready_for_mel",
      label: "Ready for MEL",
      score: melScore,
      tone: healthTone(melScore),
      detail: `${input.readyForMel} ready · ${input.signed} signed`,
    },
  ];

  const overall = clamp(
    scores.reduce((sum, s) => sum + s.score, 0) / scores.length,
  );
  return { scores, overall, tone: healthTone(overall) };
}
