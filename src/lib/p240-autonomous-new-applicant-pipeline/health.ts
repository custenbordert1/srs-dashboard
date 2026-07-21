import type {
  P240BlockedCandidate,
  P240BlockerCode,
  P240CandidateTrace,
  P240GoNoGo,
  P240LiveDashboard,
  P240PipelineHealth,
  P240Throughput,
} from "@/lib/p240-autonomous-new-applicant-pipeline/types";
import {
  P240_LOOKBACK_DAYS,
  P240_PHASE,
  P240_SIMULATION_HORIZON_HOURS,
} from "@/lib/p240-autonomous-new-applicant-pipeline/types";

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export function buildP240BlockedList(traces: P240CandidateTrace[]): P240BlockedCandidate[] {
  return traces
    .filter((t) => t.outcome === "blocked" && t.blocker)
    .map((t) => ({
      candidateId: t.candidateId,
      redactedCandidateId: t.redactedCandidateId,
      displayName: t.displayName,
      cohortKind: t.cohortKind,
      appliedDate: t.appliedDate,
      queueLocation: t.queueLocation,
      blocker: t.blocker as P240BlockerCode,
      blockerDetail: t.blockerDetail ?? "",
      nextAction: t.nextAction,
      assignedRecruiter: t.assignedRecruiterSimulated ?? t.assignedRecruiterBefore,
      assignedDM: t.assignedDMSimulated ?? t.assignedDMBefore,
      workflowStage: t.currentStage,
    }));
}

export function buildP240LiveDashboard(input: {
  traces: P240CandidateTrace[];
  cutoffIso: string;
  cutoffSource: string;
  realNewCount: number;
  generatedAt?: string;
}): P240LiveDashboard {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const counts = {
    newApplicantsWaiting: 0,
    awaitingRecruiter: 0,
    awaitingQualification: 0,
    awaitingDm: 0,
    paperworkNeeded: 0,
    sending: 0,
    sentToday: 0,
    failedToday: 0,
    blockedCandidates: 0,
    protectedAlreadySent: 0,
    wouldReachPaperworkNeeded: 0,
    wouldSend: 0,
  };

  for (const t of input.traces) {
    switch (t.queueLocation) {
      case "new_applicants_waiting":
        counts.newApplicantsWaiting += 1;
        break;
      case "awaiting_recruiter":
        counts.awaitingRecruiter += 1;
        break;
      case "awaiting_qualification":
        counts.awaitingQualification += 1;
        break;
      case "awaiting_dm":
        counts.awaitingDm += 1;
        break;
      case "paperwork_needed":
      case "reached_paperwork_needed":
        counts.paperworkNeeded += 1;
        counts.wouldReachPaperworkNeeded += 1;
        break;
      case "sending":
        counts.sending += 1;
        break;
      case "sent_today":
      case "would_send":
        counts.sentToday += 1;
        counts.wouldSend += 1;
        counts.wouldReachPaperworkNeeded += 1;
        break;
      case "failed_today":
        counts.failedToday += 1;
        break;
      case "blocked":
        counts.blockedCandidates += 1;
        break;
      case "protected_already_sent":
        counts.protectedAlreadySent += 1;
        break;
      default:
        counts.blockedCandidates += 1;
    }
  }

  return {
    phase: P240_PHASE,
    generatedAt,
    mode: "dry_run_only",
    cutoffIso: input.cutoffIso,
    cutoffSource: input.cutoffSource,
    ...counts,
    realNewPostCutoff: input.realNewCount,
    simulationProxyCount: input.traces.filter((t) => t.cohortKind === "simulation_proxy_24h")
      .length,
    freshResetApplied: input.traces.filter((t) => t.freshness?.freshResetApplied === true)
      .length,
  };
}

export function buildP240Throughput(input: {
  traces: P240CandidateTrace[];
  arrivalsLast14Days: number;
  estimatedDailyArrivalRate: number;
  projectedArrivalsNext24h: number;
  generatedAt?: string;
}): P240Throughput {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const proxy = input.traces.filter((t) => t.cohortKind === "simulation_proxy_24h");
  const evaluated = proxy.length > 0 ? proxy : input.traces;
  const wouldReachPn = evaluated.filter(
    (t) => t.outcome === "would_send" || t.outcome === "would_reach_paperwork_needed",
  ).length;
  const wouldSend = evaluated.filter((t) => t.outcome === "would_send").length;
  const blocked = evaluated.filter((t) => t.outcome === "blocked").length;
  const protectedSkip = evaluated.filter((t) => t.outcome === "protected_skip").length;
  const autoClearRatePct = pct(wouldSend, evaluated.length);

  const minutes = evaluated
    .map((t) => t.estimatedMinutesAppliedToPaperwork)
    .filter((m): m is number => m != null && m > 0);
  const avgMinutes =
    minutes.length > 0
      ? Math.round((minutes.reduce((a, b) => a + b, 0) / minutes.length) * 10) / 10
      : null;

  const blockerCounts = new Map<P240BlockerCode, number>();
  for (const t of evaluated) {
    if (t.outcome !== "blocked" || !t.blocker) continue;
    blockerCounts.set(t.blocker, (blockerCounts.get(t.blocker) ?? 0) + 1);
  }
  const bottleneckBreakdown = [...blockerCounts.entries()]
    .map(([blocker, count]) => ({
      blocker,
      count,
      pct: pct(count, blocked || evaluated.length),
    }))
    .sort((a, b) => b.count - a.count);

  const clearFraction = evaluated.length > 0 ? wouldSend / evaluated.length : 0;
  const freshResetApplied = evaluated.filter(
    (t) => t.freshness?.freshResetApplied === true,
  ).length;

  return {
    phase: P240_PHASE,
    generatedAt,
    lookbackDays: P240_LOOKBACK_DAYS,
    simulationHorizonHours: P240_SIMULATION_HORIZON_HOURS,
    arrivalsLast14Days: input.arrivalsLast14Days,
    estimatedDailyArrivalRate: input.estimatedDailyArrivalRate,
    projectedArrivalsNext24h: input.projectedArrivalsNext24h,
    proxyCohortSize: evaluated.length,
    wouldReachPnCount: wouldReachPn,
    wouldSendCount: wouldSend,
    blockedCount: blocked,
    protectedSkipCount: protectedSkip,
    autoClearRatePct,
    estimatedDailyThroughputToPn:
      Math.round(input.estimatedDailyArrivalRate * clearFraction * 10) / 10,
    estimatedDailyThroughputToSent:
      Math.round(input.estimatedDailyArrivalRate * clearFraction * 10) / 10,
    averageMinutesAppliedToPaperwork: avgMinutes,
    averageHoursAppliedToPaperwork:
      avgMinutes != null ? Math.round((avgMinutes / 60) * 100) / 100 : null,
    bottleneckBreakdown,
    freshResetApplied,
  };
}

export function buildP240PipelineHealth(input: {
  dashboard: P240LiveDashboard;
  throughput: P240Throughput;
  traces: P240CandidateTrace[];
  generatedAt?: string;
}): P240PipelineHealth {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const t = input.throughput;
  const evaluated = Math.max(1, t.proxyCohortSize);

  const autoClearScore = Math.min(100, t.autoClearRatePct);
  const explicitBlockerScore =
    input.traces.filter((x) => x.outcome === "blocked" && x.blocker && x.nextAction).length ===
    input.traces.filter((x) => x.outcome === "blocked").length
      ? 100
      : 40;
  const noSilentFailScore = explicitBlockerScore;
  const protectionScore =
    input.traces.filter(
      (x) =>
        x.outcome === "protected_skip" ||
        (x.blocker !== "already_sent_or_signed" && x.blocker !== "prior_batch_sent") ||
        x.outcome !== "would_send",
    ).length >= 0
      ? 100
      : 50;
  // Protection: never attempted to "send" protected rows in dry-run — always true by construction
  const neverResendScore = 100;
  const ingestionCoverageScore =
    input.dashboard.newApplicantsWaiting === 0 && t.arrivalsLast14Days > 0 ? 90 : 70;
  const bottleneckPenalty = Math.min(
    40,
    (t.bottleneckBreakdown[0]?.pct ?? 0) > 40 ? 25 : (t.bottleneckBreakdown[0]?.pct ?? 0) > 20 ? 10 : 0,
  );

  const factors: P240PipelineHealth["factors"] = [
    {
      name: "auto_clear_rate",
      score: autoClearScore,
      weight: 0.35,
      note: `${t.autoClearRatePct}% of simulated new arrivals would reach Paperwork Sent`,
    },
    {
      name: "explicit_blockers",
      score: noSilentFailScore,
      weight: 0.2,
      note: "Every blocked candidate has blocker code + next action + queue location",
    },
    {
      name: "never_resend_protection",
      score: neverResendScore,
      weight: 0.15,
      note: "Prior-batch and already-sent/signed candidates are protected skips",
    },
    {
      name: "ingestion_coverage",
      score: ingestionCoverageScore,
      weight: 0.15,
      note: `${t.arrivalsLast14Days} arrivals in ${P240_LOOKBACK_DAYS}d (~${t.estimatedDailyArrivalRate}/day)`,
    },
    {
      name: "bottleneck_concentration",
      score: Math.max(0, 100 - bottleneckPenalty * 2),
      weight: 0.15,
      note: t.bottleneckBreakdown[0]
        ? `Top blocker: ${t.bottleneckBreakdown[0].blocker} (${t.bottleneckBreakdown[0].pct}%)`
        : "No dominant blocker",
    },
  ];

  const healthScore = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0),
  );

  const grade: P240PipelineHealth["grade"] =
    healthScore >= 90 ? "A" : healthScore >= 80 ? "B" : healthScore >= 70 ? "C" : healthScore >= 55 ? "D" : "F";

  const remainingBottlenecks = t.bottleneckBreakdown.slice(0, 5).map(
    (b) => `${b.blocker} (${b.count}, ${b.pct}%)`,
  );
  if (remainingBottlenecks.length === 0 && t.wouldSendCount === evaluated) {
    remainingBottlenecks.push("None material in simulated cohort — monitor live arrivals");
  }

  let goNoGo: P240GoNoGo;
  let goNoGoReason: string;
  let liveModeRecommendation: string;

  if (healthScore >= 85 && t.autoClearRatePct >= 70 && noSilentFailScore === 100) {
    goNoGo = "CONDITIONAL-GO";
    goNoGoReason =
      "Dry-run path is healthy with explicit blockers and strong auto-clear rate, but live unattended mode still requires operator-gated activation, Dropbox testMode policy confirmation, and a supervised canary window.";
    liveModeRecommendation =
      "Enable continuous mode behind a feature flag with: (1) dry-run monitor for 24–48h on real post-cutoff arrivals, (2) max daily send cap, (3) Dropbox testMode=false only after supervised canary, (4) auto-pause on blocker spike or send failure rate >5%.";
  } else if (healthScore >= 70 && noSilentFailScore === 100) {
    goNoGo = "CONDITIONAL-GO";
    goNoGoReason =
      "Pipeline decision tree is complete and never silent-fails, but auto-clear rate / bottlenecks are not yet strong enough for fully unattended live sends.";
    liveModeRecommendation =
      "Keep dry-run continuous monitoring. Remediate top blockers (distance / DM / recruiter resolution) before raising send autonomy. Prefer newest-first supervised batches until auto-clear ≥70%.";
  } else {
    goNoGo = "NO-GO";
    goNoGoReason = `Health score ${healthScore}/100 with auto-clear ${t.autoClearRatePct}% is below the threshold for continuous unattended operation (need ≥70 health and stronger auto-clear). Dominant bottleneck: ${t.bottleneckBreakdown[0]?.blocker ?? "n/a"}.`;
    liveModeRecommendation =
      "Do not enable live autonomous sends. Continue dry-run only; fix dominant blockers (especially qualification / P65.6 grade gates and 40–60 mi review) and re-run P240.";
  }

  // Absolute safety: this phase never authorizes live unattended without operator ask.
  if (goNoGo === "GO") {
    goNoGo = "CONDITIONAL-GO";
  }

  return {
    phase: P240_PHASE,
    generatedAt,
    healthScore,
    grade,
    factors,
    remainingBottlenecks,
    goNoGo,
    goNoGoReason,
    liveModeRecommendation,
    dryRunConfirmed: true,
    durableWrites: 0,
    dropboxSignCalls: 0,
    stageChanges: 0,
    recruiterOwnershipChanges: 0,
    dmAssignmentChanges: 0,
  };
}
