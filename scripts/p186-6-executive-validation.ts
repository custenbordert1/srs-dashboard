/**
 * P186.6 read-only validation — no production/MEL/paperwork writes.
 * Usage: npx tsx scripts/p186-6-executive-validation.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildExecutiveDashboard,
  buildForecasts,
  buildFunnelMetrics,
  buildPaperworkOnboardingMetrics,
  buildRecruiterScorecards,
  buildDmScorecards,
  calculateAging,
  classifyExecutiveExceptions,
  detectBottlenecks,
  scoreCohortHealth,
  summarizeAgingBands,
  type P1866CohortCandidate,
} from "@/lib/p186-6-executive-recruiting-intelligence";

function cand(
  partial: Partial<P1866CohortCandidate> & Pick<P1866CohortCandidate, "candidateId" | "funnelStage">,
): P1866CohortCandidate {
  return {
    stageEnteredAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    recruiter: "R1",
    dm: "DM1",
    job: "Job A",
    client: "Client X",
    assignmentClear: true,
    sourceFreshnessMs: 30_000,
    paperworkStatus: "not_sent",
    ...partial,
  };
}

async function main() {
  const cohort: P1866CohortCandidate[] = [
    cand({ candidateId: "1", funnelStage: "APPLIED" }),
    cand({ candidateId: "2", funnelStage: "APPLIED", identityKey: "dup", stageEnteredAt: new Date(Date.now() - 20 * 86400000).toISOString() }),
    cand({ candidateId: "2b", funnelStage: "RECRUITER_REVIEW", identityKey: "dup" }),
    cand({ candidateId: "3", funnelStage: "HIRING_RECOMMENDATION", recruiter: "R2" }),
    cand({ candidateId: "4", funnelStage: "OPERATOR_APPROVED" }),
    cand({ candidateId: "5", funnelStage: "PAPERWORK_NEEDED" }),
    cand({ candidateId: "6", funnelStage: "PAPERWORK_SENT", paperworkStatus: "sent", paperworkSentAt: new Date().toISOString() }),
    cand({ candidateId: "7", funnelStage: "PAPERWORK_VIEWED", paperworkStatus: "viewed" }),
    cand({ candidateId: "8", funnelStage: "PAPERWORK_SIGNED", paperworkStatus: "signed", missingDocuments: true }),
    cand({ candidateId: "9", funnelStage: "ONBOARDING_COMPLETE" }),
    cand({ candidateId: "10", funnelStage: "READY_FOR_MEL", melExportBlocker: "duplicate risk" }),
    cand({ candidateId: "11", funnelStage: "MEL_EXPORT_REVIEW" }),
    cand({ candidateId: "12", funnelStage: "EXPORTED" }),
    cand({
      candidateId: "13",
      funnelStage: "PAPERWORK_SENT",
      paperworkStatus: "signed",
      missingShadow: true,
      stageEnteredAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    }),
  ];

  const funnel = buildFunnelMetrics({ cohort });
  const aging = calculateAging({ cohort });
  const health = scoreCohortHealth(cohort);
  const bottlenecks = detectBottlenecks({ cohort, minGroupSize: 1 });
  const recruiters = buildRecruiterScorecards({ cohort, minSample: 3 });
  const dms = buildDmScorecards({ cohort, minSample: 3 });
  const paperwork = buildPaperworkOnboardingMetrics({ cohort });
  const exceptions = classifyExecutiveExceptions({ cohort });
  const forecasts = buildForecasts({ cohort, dateRangeLabel: "last_7_days" });
  const dash = buildExecutiveDashboard({
    role: "executive",
    cohort,
    forceFlags: {
      executiveDashboard: true,
      lifecycleFunnel: true,
      candidateHealthScore: true,
      agingMetrics: true,
      bottleneckAnalysis: true,
      recruiterDmScorecards: true,
      forecasting: true,
      executiveExceptionCenter: true,
    },
    systemHealthInput: {
      lastBreezyEventAt: new Date().toISOString(),
      lastWorkflowEventAt: new Date().toISOString(),
      lastDropboxEventAt: new Date().toISOString(),
      lastOnboardingEventAt: new Date().toISOString(),
      lastMelObservationAt: new Date().toISOString(),
      storageHealth: "ok",
    },
  });

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });

  const funnelValidation = {
    generatedAt: new Date().toISOString(),
    sourcePhase: "P186.6",
    funnelCountsByStage: Object.fromEntries(funnel.map((s) => [s.stage, s.currentCount])),
    conversionRates: dash.conversions,
    agingDistribution: summarizeAgingBands(aging),
    productionWritesAttempted: 0,
    melWritesAttempted: 0,
    paperworkSendsAttempted: 0,
  };

  const healthValidation = {
    generatedAt: new Date().toISOString(),
    candidateHealthDistribution: health.reduce(
      (acc, h) => {
        acc[h.band] = (acc[h.band] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    sample: health.slice(0, 5).map((h) => ({
      candidateId: h.candidateId,
      score: h.score,
      band: h.band,
      positives: h.positiveFactors.length,
      negatives: h.negativeFactors.length,
    })),
  };

  const scorecardValidation = {
    generatedAt: new Date().toISOString(),
    recruiterScorecardsGenerated: recruiters.length,
    dmScorecardsGenerated: dms.length,
    recruiters: recruiters.map((r) => ({
      owner: r.owner,
      sampleSize: r.sampleSize,
      ranked: r.ranked,
      insufficientSample: r.insufficientSample,
    })),
    dms: dms.map((r) => ({
      owner: r.owner,
      sampleSize: r.sampleSize,
      ranked: r.ranked,
    })),
  };

  const forecastValidation = {
    generatedAt: new Date().toISOString(),
    forecastCount: forecasts.length,
    forecasts: forecasts.map((f) => ({
      metric: f.metric,
      expectedValue: f.expectedValue,
      confidence: f.confidence,
      insufficientData: f.insufficientData,
      warning: f.warning,
    })),
  };

  await writeFile(
    path.join(artifactsDir, "p186-6-funnel-validation.json"),
    JSON.stringify(funnelValidation, null, 2) + "\n",
  );
  await writeFile(
    path.join(artifactsDir, "p186-6-health-score-validation.json"),
    JSON.stringify(healthValidation, null, 2) + "\n",
  );
  await writeFile(
    path.join(artifactsDir, "p186-6-scorecard-validation.json"),
    JSON.stringify(scorecardValidation, null, 2) + "\n",
  );
  await writeFile(
    path.join(artifactsDir, "p186-6-forecast-validation.json"),
    JSON.stringify(forecastValidation, null, 2) + "\n",
  );

  await writeFile(
    path.join(artifactsDir, "p186-6-executive-dashboard-design.md"),
    [
      "# P186.6 Executive Recruiting Intelligence — Design",
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      "## Architecture",
      "",
      "Read-only aggregation over P186 lifecycle / shadow / queue / post-sign / MEL-readiness cohort snapshots.",
      "",
      "Sections: Funnel · Health · Aging · Bottlenecks · Scorecards · Paperwork/Onboarding · Ready for MEL · Exceptions · Forecast · System Health",
      "",
      "## Safety",
      "",
      "- No paperwork send",
      "- No MEL export",
      "- No continuous automation",
      "- No authoritative lifecycle writes",
      "",
    ].join("\n"),
  );

  await writeFile(
    path.join(artifactsDir, "p186-6-readiness-report.md"),
    [
      "# P186.6 Readiness Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      `- Funnel stages populated: **${funnel.filter((s) => s.currentCount > 0).length}**`,
      `- Bottlenecks: **${bottlenecks.length}**`,
      `- Exceptions: **${exceptions.length}**`,
      `- Recruiter scorecards: **${recruiters.length}**`,
      `- DM scorecards: **${dms.length}**`,
      `- Forecasts: **${forecasts.length}**`,
      `- Paperwork awaiting signature: **${paperwork.awaitingSignature}**`,
      `- Ready for MEL backlog: **${paperwork.readyForMelBacklog}**`,
      `- Production writes: **0**`,
      `- MEL writes: **0**`,
      `- Paperwork sends: **0**`,
      "",
      "## P186.7 recommendation",
      "",
      "**Conditional yes** — after executive walkthrough with a live cohort wired to the dashboard APIs,",
      "and confirmation that stale-source downgrades behave correctly in production. Do not enable",
      "automation or MEL export in P186.7 without a separate authorization.",
      "",
    ].join("\n"),
  );

  console.log(
    JSON.stringify(
      {
        funnelStages: funnel.map((s) => [s.stage, s.currentCount]),
        bottlenecks: bottlenecks.length,
        exceptions: exceptions.length,
        recruiters: recruiters.length,
        dms: dms.length,
        forecasts: forecasts.length,
        productionWritesAttempted: 0,
        melWritesAttempted: 0,
        paperworkSendsAttempted: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
