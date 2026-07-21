import type {
  P240CutoffResolution,
  P240LiveDashboard,
  P240PipelineHealth,
  P240Throughput,
  P240ZeroWriteAudit,
} from "@/lib/p240-autonomous-new-applicant-pipeline/types";
import {
  P240_EXECUTION_MODE,
  P240_PHASE,
} from "@/lib/p240-autonomous-new-applicant-pipeline/types";

export function formatP240AutonomousPipelineReport(input: {
  generatedAt: string;
  cutoff: P240CutoffResolution;
  dashboard: P240LiveDashboard;
  throughput: P240Throughput;
  health: P240PipelineHealth;
  zeroWriteAudit: P240ZeroWriteAudit;
  testsRun: number;
  testsPassed: number;
  artifactPaths: string[];
  priorSentCounts: Record<string, number>;
}): string {
  const { dashboard: d, throughput: t, health: h, cutoff } = input;
  const lines: string[] = [
    `# P240 — Autonomous New Applicant Pipeline (Continuous Mode)`,
    ``,
    `Generated: ${input.generatedAt}`,
    `Mode: **${P240_EXECUTION_MODE}** (DRY RUN ONLY)`,
    `Phase: ${P240_PHASE}`,
    ``,
    `## Cutoff (new applicants only)`,
    ``,
    `- Cutoff ISO: **${cutoff.cutoffIso}**`,
    `- Source: ${cutoff.source}`,
    `- P239 generatedAt: ${cutoff.p239GeneratedAt ?? "n/a"}`,
    `- Max P239 appliedDate: ${cutoff.maxP239AppliedDate ?? "n/a"}`,
    `- Prior sent exclusions (union): **${input.priorSentCounts.union ?? 0}** (p221=${input.priorSentCounts.p221 ?? 0} p227=${input.priorSentCounts.p227 ?? 0} p235=${input.priorSentCounts.p235 ?? 0} p237=${input.priorSentCounts.p237 ?? 0} p238=${input.priorSentCounts.p238 ?? 0} p239=${input.priorSentCounts.p239 ?? 0})`,
    ``,
    `## Pipeline health`,
    ``,
    `- Health score: **${h.healthScore}/100** (grade ${h.grade})`,
    `- GO / NO-GO: **${h.goNoGo}**`,
    `- Reason: ${h.goNoGoReason}`,
    `- Live-mode recommendation: ${h.liveModeRecommendation}`,
    ``,
    `### Health factors`,
    ``,
    `| Factor | Score | Weight | Note |`,
    `| --- | ---: | ---: | --- |`,
    ...h.factors.map(
      (f) => `| ${f.name} | ${f.score} | ${f.weight} | ${f.note} |`,
    ),
    ``,
    `## Throughput (next 24h simulation)`,
    ``,
    `- Arrivals last ${t.lookbackDays}d: **${t.arrivalsLast14Days}**`,
    `- Estimated daily arrival rate: **${t.estimatedDailyArrivalRate}/day**`,
    `- Projected arrivals next ${t.simulationHorizonHours}h: **${t.projectedArrivalsNext24h}**`,
    `- Proxy cohort walked: **${t.proxyCohortSize}** (labeled simulation_proxy_24h)`,
    `- Would reach Paperwork Needed: **${t.wouldReachPnCount}**`,
    `- Would send (Dropbox simulated): **${t.wouldSendCount}**`,
    `- Blocked (explicit): **${t.blockedCount}**`,
    `- Protected skip: **${t.protectedSkipCount}**`,
    `- Auto-clear rate: **${t.autoClearRatePct}%**`,
    `- Fresh Reset Applied: **${t.freshResetApplied}**`,
    `- Estimated daily throughput → PN/Sent: **${t.estimatedDailyThroughputToSent}/day**`,
    `- Average Applied → Paperwork (sim): **${t.averageMinutesAppliedToPaperwork ?? "n/a"} min** (${t.averageHoursAppliedToPaperwork ?? "n/a"} h)`,
    ``,
    `## Live monitoring dashboard`,
    ``,
    `| Queue | Count |`,
    `| --- | ---: |`,
    `| New applicants waiting | ${d.newApplicantsWaiting} |`,
    `| Awaiting recruiter | ${d.awaitingRecruiter} |`,
    `| Awaiting qualification | ${d.awaitingQualification} |`,
    `| Awaiting DM | ${d.awaitingDm} |`,
    `| Paperwork Needed / would reach | ${d.paperworkNeeded} |`,
    `| Sending | ${d.sending} |`,
    `| Sent today (sim would-send) | ${d.sentToday} |`,
    `| Failed today | ${d.failedToday} |`,
    `| Blocked candidates | ${d.blockedCandidates} |`,
    `| Protected already sent | ${d.protectedAlreadySent} |`,
    `| Real new post-cutoff | ${d.realNewPostCutoff} |`,
    `| Simulation proxy count | ${d.simulationProxyCount} |`,
    `| Fresh Reset Applied | ${d.freshResetApplied} |`,
    ``,
    `## Remaining bottlenecks`,
    ``,
    ...(h.remainingBottlenecks.length
      ? h.remainingBottlenecks.map((b) => `- ${b}`)
      : [`- None`]),
    ``,
    `## Dry-run / zero-write confirmation`,
    ``,
    `- Durable writes: **${h.durableWrites}**`,
    `- Dropbox Sign calls: **${h.dropboxSignCalls}**`,
    `- Stage changes: **${h.stageChanges}**`,
    `- Recruiter ownership changes: **${h.recruiterOwnershipChanges}**`,
    `- DM assignment changes: **${h.dmAssignmentChanges}**`,
    `- Zero-write audit unchanged: **${input.zeroWriteAudit.unchanged}**`,
    `- Fingerprinted paths: ${input.zeroWriteAudit.durablePaths.join(", ")}`,
    ``,
    `## Tests`,
    ``,
    `- Tests run: **${input.testsRun}**`,
    `- Tests passed: **${input.testsPassed}**`,
    ``,
    `## Artifacts`,
    ``,
    ...input.artifactPaths.map((p) => `- \`${p}\``),
    ``,
    `## Confirmation`,
    ``,
    `P240 executed in DRY RUN ONLY. No Dropbox Sign, no workflow stage mutations, no recruiter ownership changes, no DM assignment writes, no commit/merge/push/deploy.`,
    ``,
  ];
  return `${lines.join("\n")}\n`;
}
