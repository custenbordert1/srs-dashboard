import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  evaluateP207AlertConditions,
  mergeP207Alerts,
} from "@/lib/p207-autonomous-readiness-dashboard/alerts";
import {
  detectBlockersForCandidate,
  estimateHoursToClear,
  summarizeBlockers,
  toDrillRow,
  type P207BlockerHit,
} from "@/lib/p207-autonomous-readiness-dashboard/blockers";
import {
  changedToday,
  classifyP207Stage,
  hasQuestionnaire,
  hasValidEmail,
  startOfTodayIso,
} from "@/lib/p207-autonomous-readiness-dashboard/classify";
import { buildP207Forecast } from "@/lib/p207-autonomous-readiness-dashboard/forecast";
import { classifyP207Freshness } from "@/lib/p207-autonomous-readiness-dashboard/freshness";
import { computeP207SubsystemScores } from "@/lib/p207-autonomous-readiness-dashboard/health";
import type {
  P207Alert,
  P207DropboxDiagnostics,
  P207DrillRow,
  P207ExecutiveCard,
  P207FunnelStep,
  P207ReadinessSnapshot,
  P207Stage,
  P207StageMetrics,
  P207Validation,
} from "@/lib/p207-autonomous-readiness-dashboard/types";
import {
  P207_EXECUTION_MODE,
  P207_SCHEMA_VERSION,
  P207_SOURCE_PHASE,
  P207_STAGES,
} from "@/lib/p207-autonomous-readiness-dashboard/types";

export type P207AiSignal = {
  recommendation: string;
  confidence: number | null;
  operatorDecision?: string | null;
};

export type P207BuildInput = {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  dropbox: P207DropboxDiagnostics;
  aiByCandidateId?: Record<string, P207AiSignal>;
  now?: Date;
  priorAlerts?: P207Alert[];
  storeAvailable?: boolean;
  statusSyncOk?: boolean;
  callbackHealthDegraded?: boolean;
  unresolvedSendOps?: number;
  /** When true, also emit a synthetic stale-dashboard warning via age override. */
  freshnessObservedAt?: string;
};

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function isSendReady(
  candidate: BreezyCandidate | undefined,
  workflow: CandidateWorkflowRecord | undefined,
): boolean {
  if (!workflow || workflow.workflowStatus !== "Paperwork Needed") return false;
  if (workflow.paperworkStatus !== "not_sent") return false;
  if (workflow.signatureRequestId) return false;
  if (!hasValidEmail(candidate)) return false;
  const notes = (workflow.notes ?? []).join("\n");
  if (/\[P198_SUPPRESSION\]|permanent.?fail|do.?not.?send/i.test(notes)) return false;
  return true;
}

function buildFunnel(input: {
  applied: number;
  eligibleForAi: number;
  approved: number;
  paperworkNeeded: number;
  eligibleToSend: number;
  paperworkSent: number;
  viewed: number;
  signed: number;
  readyForMel: number;
}): P207FunnelStep[] {
  const steps: Array<{ id: string; label: string; count: number }> = [
    { id: "applied", label: "Applied", count: input.applied },
    { id: "eligible_for_ai", label: "Eligible for AI", count: input.eligibleForAi },
    { id: "approved", label: "Approved", count: input.approved },
    { id: "paperwork_needed", label: "Paperwork Needed", count: input.paperworkNeeded },
    { id: "eligible_to_send", label: "Eligible to Send", count: input.eligibleToSend },
    { id: "paperwork_sent", label: "Paperwork Sent", count: input.paperworkSent },
    { id: "viewed", label: "Viewed", count: input.viewed },
    { id: "signed", label: "Signed", count: input.signed },
    { id: "ready_for_mel", label: "Ready for MEL", count: input.readyForMel },
  ];
  return steps.map((s, i) => ({
    ...s,
    percentOfApplied: pct(s.count, input.applied),
    percentOfPrevious: i === 0 ? null : pct(s.count, steps[i - 1]!.count),
  }));
}

function buildExecutiveCards(input: {
  sendReady: number;
  dropboxOnlyBlocked: number;
  missingQuestionnaire: number;
  awaitingReview: number;
  awaitingSignatures: number;
  signedToday: number;
  readyForMel: number;
  dropboxVendorBlocked: boolean;
}): P207ExecutiveCard[] {
  return [
    {
      id: "send_ready",
      title: "Candidates immediately send-ready",
      count: input.sendReady,
      tone: input.sendReady > 0 ? "warning" : "healthy",
      detail: input.dropboxVendorBlocked
        ? "Software-ready; waiting on Dropbox quota"
        : "Eligible for supervised send",
      drillKey: "send_ready",
    },
    {
      id: "dropbox_only",
      title: "Candidates blocked only by Dropbox",
      count: input.dropboxOnlyBlocked,
      tone: input.dropboxOnlyBlocked > 0 ? "critical" : "healthy",
      detail: "Paperwork Needed + send-ready + vendor quota blocked",
      drillKey: "send_ready",
    },
    {
      id: "missing_questionnaire",
      title: "Candidates missing questionnaire",
      count: input.missingQuestionnaire,
      tone: input.missingQuestionnaire > 20 ? "warning" : "healthy",
      detail: "Applied/Needs Review without questionnaire",
      drillKey: "missing_questionnaire",
    },
    {
      id: "awaiting_review",
      title: "Candidates awaiting recruiter review",
      count: input.awaitingReview,
      tone: input.awaitingReview > 0 ? "warning" : "healthy",
      detail: "Needs Review stage",
      drillKey: "Needs Review",
    },
    {
      id: "awaiting_signatures",
      title: "Candidates awaiting signatures",
      count: input.awaitingSignatures,
      tone: "healthy",
      detail: "Paperwork Sent / viewed, not yet signed",
      drillKey: "Paperwork Sent",
    },
    {
      id: "signed_today",
      title: "Candidates signed today",
      count: input.signedToday,
      tone: "healthy",
      detail: "paperworkSignedAt ≥ start of today",
      drillKey: "signed_today",
    },
    {
      id: "ready_for_mel",
      title: "Candidates ready for MEL",
      count: input.readyForMel,
      tone: input.readyForMel > 0 ? "healthy" : "warning",
      detail: "Ready for MEL / Ready For Assignment",
      drillKey: "Ready for MEL",
    },
  ];
}

export function buildP207ReadinessSnapshot(input: P207BuildInput): P207ReadinessSnapshot {
  const started = Date.now();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const todayIso = startOfTodayIso(now);
  const aiMap = input.aiByCandidateId ?? {};

  const byStage = new Map<P207Stage, string[]>();
  for (const s of P207_STAGES) byStage.set(s, []);

  const candidateById = new Map(input.candidates.map((c) => [c.candidateId, c]));
  const allIds = new Set<string>([
    ...candidateById.keys(),
    ...Object.keys(input.workflows),
  ]);

  const stageOf = new Map<string, P207Stage>();
  for (const id of allIds) {
    const stage = classifyP207Stage(input.workflows[id]);
    stageOf.set(id, stage);
    byStage.get(stage)!.push(id);
  }

  const allHits: P207BlockerHit[] = [];
  const drillDown: P207DrillRow[] = [];
  let duplicateEnvelopeRisk = 0;
  for (const id of allIds) {
    const stage = stageOf.get(id)!;
    const candidate = candidateById.get(id);
    const workflow = input.workflows[id];
    const ai = aiMap[id];
    if (
      stage === "Paperwork Needed" &&
      workflow?.signatureRequestId &&
      workflow.paperworkStatus === "not_sent"
    ) {
      duplicateEnvelopeRisk += 1;
    }
    const hits = detectBlockersForCandidate({
      stage,
      candidate,
      workflow,
      dropbox: input.dropbox,
      aiRecommendation: ai?.recommendation ?? null,
      confidence: ai?.confidence ?? null,
    });
    allHits.push(...hits);
    const primary = hits[0];
    if (primary) {
      drillDown.push(
        toDrillRow({
          hit: primary,
          candidate,
          workflow,
          confidence: ai?.confidence ?? null,
          aiRecommendation: ai?.recommendation ?? null,
        }),
      );
    }
  }

  const stages: P207StageMetrics[] = P207_STAGES.map((stage) => {
    const ids = byStage.get(stage) ?? [];
    const stageHits = allHits.filter((h) => h.stage === stage);
    const blockers = summarizeBlockers(stageHits);
    const largest = blockers[0] ?? null;
    const second = blockers[1] ?? null;
    let lastUpdate: string | null = null;
    let changeToday = 0;
    let trend = 0;
    for (const id of ids) {
      const wf = input.workflows[id];
      if (wf?.updatedAt && (!lastUpdate || wf.updatedAt > lastUpdate)) {
        lastUpdate = wf.updatedAt;
      }
      if (changedToday(wf, todayIso)) {
        changeToday += 1;
        trend += 1;
      }
    }
    return {
      stage,
      count: ids.length,
      trend,
      lastUpdate,
      changeToday,
      largestBlocker: largest?.label ?? null,
      secondBlocker: second?.label ?? null,
      estimatedHoursToClear: estimateHoursToClear(
        stage,
        largest?.id ?? null,
        input.dropbox,
      ),
      blockers,
    };
  });

  const count = (s: P207Stage) => stages.find((x) => x.stage === s)?.count ?? 0;
  const applied = count("Applied");
  const needsReview = count("Needs Review");
  const paperworkNeeded = count("Paperwork Needed");
  const paperworkSent = count("Paperwork Sent");
  const signed = count("Signed");
  const readyForMel = count("Ready for MEL");
  const rejected = count("Rejected");
  const total = allIds.size;

  let eligibleForAi = 0;
  let approved = 0;
  let missingQuestionnaire = 0;
  let sendReady = 0;
  let dropboxOnlyBlocked = 0;
  let viewed = 0;
  let awaitingSignatures = 0;
  let signedToday = 0;
  let aiApprovedCount = 0;
  let questionnaireDone = 0;

  for (const id of allIds) {
    const c = candidateById.get(id);
    const wf = input.workflows[id];
    const stage = stageOf.get(id)!;
    const ai = aiMap[id];
    if (hasQuestionnaire(c)) questionnaireDone += 1;
    if (
      (stage === "Applied" || stage === "Needs Review") &&
      hasQuestionnaire(c) &&
      hasValidEmail(c)
    ) {
      eligibleForAi += 1;
    }
    if ((stage === "Applied" || stage === "Needs Review") && !hasQuestionnaire(c)) {
      missingQuestionnaire += 1;
    }
    if (
      ai?.operatorDecision === "agree_advance" ||
      ai?.operatorDecision === "approve_recommendation" ||
      ai?.operatorDecision === "override_to_advance"
    ) {
      if (ai.recommendation === "Advance" || ai.operatorDecision === "override_to_advance") {
        approved += 1;
      }
      aiApprovedCount += 1;
    } else if (ai?.recommendation === "Advance") {
      aiApprovedCount += 1;
    }
    if (isSendReady(c, wf)) {
      sendReady += 1;
      if (input.dropbox.vendorBlocked) dropboxOnlyBlocked += 1;
    }
    if (stage === "Paperwork Sent") {
      awaitingSignatures += 1;
      if (wf?.paperworkStatus === "viewed" || wf?.paperworkViewedAt) viewed += 1;
    }
    if (wf?.paperworkSignedAt && wf.paperworkSignedAt >= todayIso) {
      signedToday += 1;
    }
  }

  const funnelApproved = Math.max(
    approved,
    paperworkNeeded + paperworkSent + signed + readyForMel,
  );

  const questionnaireCoveragePct = pct(questionnaireDone, Math.max(1, candidateById.size));
  const { scores, overall, tone } = computeP207SubsystemScores({
    applied,
    needsReview,
    paperworkNeeded,
    paperworkSent,
    signed,
    readyForMel,
    rejected,
    total,
    dropbox: input.dropbox,
    aiApprovedCount,
    questionnaireCoveragePct,
    sendReadyCount: sendReady,
    awaitingSignature: awaitingSignatures,
  });

  const funnel = buildFunnel({
    applied: applied + needsReview,
    eligibleForAi,
    approved: funnelApproved,
    paperworkNeeded,
    eligibleToSend: sendReady,
    paperworkSent,
    viewed,
    signed,
    readyForMel,
  });

  const executiveCards = buildExecutiveCards({
    sendReady,
    dropboxOnlyBlocked,
    missingQuestionnaire,
    awaitingReview: needsReview,
    awaitingSignatures,
    signedToday,
    readyForMel,
    dropboxVendorBlocked: input.dropbox.vendorBlocked,
  });

  const forecast = buildP207Forecast({
    sendReadyCount: sendReady,
    paperworkNeeded,
    awaitingSignature: awaitingSignatures,
    signedPendingMel: signed,
    dropbox: input.dropbox,
  });

  const authoritative: Record<string, number> = {};
  for (const s of P207_STAGES) authoritative[s] = 0;
  for (const id of Object.keys(input.workflows)) {
    const s = classifyP207Stage(input.workflows[id]);
    authoritative[s] = (authoritative[s] ?? 0) + 1;
  }
  for (const c of input.candidates) {
    if (!input.workflows[c.candidateId]) {
      authoritative.Applied = (authoritative.Applied ?? 0) + 1;
    }
  }

  const countMismatches: P207Validation["countMismatches"] = [];
  for (const s of P207_STAGES) {
    const auth = authoritative[s] ?? 0;
    const dash = count(s);
    if (auth !== dash) {
      countMismatches.push({ stage: s, authoritative: auth, dashboard: dash });
    }
  }

  const missingData: string[] = [];
  if (input.dropbox.apiStatus === "unknown") missingData.push("dropbox_api_status_unknown");
  if (input.dropbox.productionQuota == null) missingData.push("dropbox_quota_unavailable");
  if (Object.keys(aiMap).length === 0) missingData.push("ai_recommendation_store_empty_or_unavailable");

  const snapshotBuildMs = Date.now() - started;
  const validation: P207Validation = {
    authoritativeTotal: Object.values(authoritative).reduce((a, b) => a + b, 0),
    dashboardTotal: total,
    countMismatches,
    refreshLatencyMs: snapshotBuildMs,
    missingData,
    matched: countMismatches.length === 0,
  };

  const freshness = classifyP207Freshness(
    nowIso,
    input.freshnessObservedAt ?? nowIso,
  );

  const alertStarted = Date.now();
  const firstSuccessfulSendToday = Boolean(
    input.dropbox.lastSuccessfulSendAt &&
      input.dropbox.lastSuccessfulSendAt >= todayIso,
  );
  const drafts = evaluateP207AlertConditions({
    nowIso,
    stages,
    dropbox: input.dropbox,
    immediateSendReady: sendReady,
    validation,
    questionnaireCoveragePct,
    signedToday,
    readyForMel,
    paperworkSentAgingCount: awaitingSignatures,
    unresolvedSendOps: input.unresolvedSendOps ?? 0,
    duplicateEnvelopeRisk,
    storeAvailable: input.storeAvailable ?? true,
    statusSyncOk: input.statusSyncOk ?? input.dropbox.apiStatus !== "error",
    callbackHealthDegraded: input.callbackHealthDegraded ?? false,
    previousQuota: input.dropbox.previousQuota,
    firstSuccessfulSendToday,
  });

  // Stale snapshot warning when freshness observed age exceeds threshold.
  if (freshness.state === "Stale") {
    drafts.push({
      fingerprint: "stale-dashboard-snapshot-warning0001",
      severity: "warning",
      title: "Stale dashboard snapshot",
      explanation: "Dashboard generatedAt is older than 15 minutes relative to observer clock.",
      affectedCount: 1,
      subsystem: "status_sync",
      recommendedAction: "Refresh the dashboard; investigate polling if age persists.",
      supportingMetric: `ageMs=${freshness.ageMs}; state=${freshness.state}`,
      drillKey: null,
    });
  } else if (freshness.state === "Delayed") {
    drafts.push({
      fingerprint: "delayed-dashboard-snapshot-warning01",
      severity: "warning",
      title: "Delayed dashboard snapshot",
      explanation: "Dashboard data is between 5 and 15 minutes old.",
      affectedCount: 1,
      subsystem: "status_sync",
      recommendedAction: "Refresh soon; confirm no duplicate polling storms.",
      supportingMetric: `ageMs=${freshness.ageMs}; state=${freshness.state}`,
      drillKey: null,
    });
  }

  const alerts = mergeP207Alerts({
    drafts,
    prior: input.priorAlerts ?? [],
    nowIso,
  });
  const alertGenerationMs = Date.now() - alertStarted;

  const largestBlocker =
    input.dropbox.vendorBlocked && paperworkNeeded > 0
      ? "Dropbox production quota (vendor blocked)"
      : stages.flatMap((s) => s.blockers).sort((a, b) => b.count - a.count)[0]?.label ??
        "None detected";

  const autonomousReadiness =
    input.dropbox.recoveryState === "Quota Restored — Pilot Required"
      ? "Quota restored — P206 pilot required (no auto-send)"
      : input.dropbox.vendorBlocked
        ? "Software ready · Vendor blocked (Dropbox quota)"
        : sendReady > 0
          ? "Send path ready"
          : overall >= 80
            ? "Operationally healthy"
            : "Needs operator attention";

  const priority: P207Stage[] = [
    "Paperwork Needed",
    "Needs Review",
    "Applied",
    "Paperwork Sent",
    "Signed",
  ];
  const sortedDrill = [...drillDown].sort((a, b) => {
    const pa = priority.indexOf(a.stage);
    const pb = priority.indexOf(b.stage);
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });

  return {
    sourcePhase: P207_SOURCE_PHASE,
    schemaVersion: P207_SCHEMA_VERSION,
    executionMode: P207_EXECUTION_MODE,
    generatedAt: nowIso,
    freshness,
    stages,
    subsystemScores: scores,
    overallScore: overall,
    overallTone: tone,
    dropbox: input.dropbox,
    funnel,
    executiveCards,
    forecast,
    drillDown: sortedDrill.slice(0, 200),
    alerts,
    activeAlertCount: alerts.filter((a) => !a.resolved).length,
    validation,
    largestBlocker,
    immediateSendReady: sendReady,
    autonomousReadiness,
    performance: {
      snapshotBuildMs,
      alertGenerationMs,
    },
    safety: {
      lifecycleWrites: false,
      paperworkNeededCreates: false,
      dropboxSends: false,
      p192Starts: false,
      automationEnabled: false,
      melWrites: false,
      p206AutoRerun: false,
    },
  };
}

export function filterP207DrillDown(
  snapshot: P207ReadinessSnapshot,
  key: string,
): P207DrillRow[] {
  if (P207_STAGES.includes(key as P207Stage)) {
    return snapshot.drillDown.filter((r) => r.stage === key);
  }
  if (key === "send_ready") {
    return snapshot.drillDown.filter(
      (r) =>
        r.stage === "Paperwork Needed" &&
        (r.reasonCodes.includes("dropbox_quota") || r.blocker.toLowerCase().includes("dropbox")),
    );
  }
  if (key === "missing_questionnaire") {
    return snapshot.drillDown.filter((r) => r.reasonCodes.includes("missing_questionnaire"));
  }
  if (key === "duplicate_envelope") {
    return snapshot.drillDown.filter((r) => r.reasonCodes.includes("stale_envelope"));
  }
  if (key === "signed_today") {
    return snapshot.drillDown.filter((r) => r.stage === "Signed");
  }
  if (key === "paperwork_sent_risk") {
    return snapshot.drillDown.filter((r) => r.stage === "Paperwork Sent");
  }
  return snapshot.drillDown.filter(
    (r) => r.stage === key || r.reasonCodes.includes(key) || r.blocker === key,
  );
}
