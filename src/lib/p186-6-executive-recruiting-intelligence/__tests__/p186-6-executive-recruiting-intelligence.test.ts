import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import {
  buildDmScorecards,
  buildExecutiveDashboard,
  buildForecasts,
  buildFunnelMetrics,
  buildPaperworkOnboardingMetrics,
  buildRecruiterScorecards,
  buildSystemHealth,
  calculateAging,
  canPerformExceptionAction,
  canViewSection,
  classifyExecutiveExceptions,
  clearP1866CacheForTests,
  computeConversionRates,
  dedupeCohort,
  detectBottlenecks,
  getCached,
  metricsAreConfident,
  paginate,
  P1866_FUNNEL_STAGES,
  readP1866Flags,
  scoreCandidateHealth,
  setCached,
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
    assignmentClear: true,
    sourceFreshnessMs: 60_000,
    paperworkStatus: "not_sent",
    ...partial,
  };
}

describe("P186.6 executive recruiting intelligence", () => {
  beforeEach(() => {
    for (const k of [
      "P186_EXECUTIVE_DASHBOARD",
      "P186_LIFECYCLE_FUNNEL",
      "P186_CANDIDATE_HEALTH_SCORE",
      "P186_AGING_METRICS",
      "P186_BOTTLENECK_ANALYSIS",
      "P186_RECRUITER_DM_SCORECARDS",
      "P186_FORECASTING",
      "P186_EXECUTIVE_EXCEPTION_CENTER",
      "P186_6_REDACTED_EXPORTS",
    ]) {
      delete process.env[k];
    }
    clearP1866CacheForTests();
  });

  it("feature flags default off", () => {
    const f = readP1866Flags();
    assert.equal(f.executiveDashboard, false);
    assert.equal(f.lifecycleFunnel, false);
    assert.equal(f.forecasting, false);
  });

  it("computes funnel counts and conversion math", () => {
    const cohort = [
      cand({ candidateId: "a1", funnelStage: "APPLIED" }),
      cand({ candidateId: "a2", funnelStage: "APPLIED" }),
      cand({ candidateId: "r1", funnelStage: "RECRUITER_REVIEW" }),
      cand({ candidateId: "p1", funnelStage: "PAPERWORK_SENT" }),
    ];
    const funnel = buildFunnelMetrics({ cohort });
    assert.equal(funnel.find((s) => s.stage === "APPLIED")?.currentCount, 2);
    assert.equal(funnel.find((s) => s.stage === "RECRUITER_REVIEW")?.currentCount, 1);
    const conversions = computeConversionRates({ cohort });
    assert.equal(conversions.application_to_review, 50);
  });

  it("deduplicates reopened candidates", () => {
    const rows = [
      cand({
        candidateId: "c1-old",
        identityKey: "person-1",
        funnelStage: "APPLIED",
        stageEnteredAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      }),
      cand({
        candidateId: "c1-new",
        identityKey: "person-1",
        funnelStage: "PAPERWORK_SIGNED",
        stageEnteredAt: new Date().toISOString(),
      }),
    ];
    const deduped = dedupeCohort(rows, P1866_FUNNEL_STAGES);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0]!.funnelStage, "PAPERWORK_SIGNED");
  });

  it("applies aging thresholds", () => {
    const aging = calculateAging({
      cohort: [
        cand({
          candidateId: "old",
          funnelStage: "RECRUITER_REVIEW",
          stageEnteredAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        }),
        cand({
          candidateId: "fresh",
          funnelStage: "RECRUITER_REVIEW",
          stageEnteredAt: new Date(Date.now() - 3600000).toISOString(),
        }),
      ],
    });
    assert.equal(aging.find((a) => a.candidateId === "old")?.band, "critical");
    assert.equal(aging.find((a) => a.candidateId === "fresh")?.band, "healthy");
  });

  it("health score is explainable and downgrades on stale data", () => {
    const healthy = scoreCandidateHealth({
      candidate: cand({
        candidateId: "h1",
        funnelStage: "PAPERWORK_SIGNED",
        paperworkStatus: "signed",
        recruiterActivityScore: 80,
        candidateResponsivenessScore: 80,
        stageEnteredAt: new Date(Date.now() - 3600000).toISOString(),
      }),
    });
    assert.ok(healthy.score >= 70);
    assert.ok(healthy.positiveFactors.length > 0);

    const stale = scoreCandidateHealth({
      candidate: cand({
        candidateId: "s1",
        funnelStage: "PAPERWORK_SIGNED",
        paperworkStatus: "signed",
        sourceFreshnessMs: 48 * 3600000,
      }),
    });
    assert.equal(stale.staleDataDowngraded, true);
    assert.ok(stale.confidence < 0.5);
  });

  it("blocker scoring reduces health", () => {
    const blocked = scoreCandidateHealth({
      candidate: cand({
        candidateId: "b1",
        funnelStage: "READY_FOR_MEL",
        missingDocuments: true,
        onboardingBlocked: true,
        workflowConflict: true,
        stageEnteredAt: new Date(Date.now() - 3600000).toISOString(),
      }),
    });
    assert.ok(blocked.blockers.length >= 2);
    assert.ok(blocked.score < 60);
  });

  it("builds recruiter/DM scorecards with minimum sample handling", () => {
    const cohort = [
      cand({ candidateId: "1", funnelStage: "APPLIED", recruiter: "R1", dm: "DM1" }),
      cand({ candidateId: "2", funnelStage: "PAPERWORK_SENT", recruiter: "R1", dm: "DM1" }),
    ];
    const recruiters = buildRecruiterScorecards({ cohort, minSample: 5 });
    assert.equal(recruiters[0]!.insufficientSample, true);
    assert.equal(recruiters[0]!.ranked, false);

    const large = Array.from({ length: 6 }, (_, i) =>
      cand({ candidateId: `x${i}`, funnelStage: "PAPERWORK_SIGNED", recruiter: "R2", dm: "DM2" }),
    );
    const r2 = buildRecruiterScorecards({ cohort: large, minSample: 5 });
    assert.equal(r2[0]!.ranked, true);
    const dms = buildDmScorecards({ cohort: large, minSample: 5 });
    assert.equal(dms[0]!.ownerType, "dm");
  });

  it("computes paperwork and onboarding metrics", () => {
    const metrics = buildPaperworkOnboardingMetrics({
      cohort: [
        cand({
          candidateId: "1",
          funnelStage: "PAPERWORK_SENT",
          paperworkStatus: "sent",
          paperworkSentAt: new Date().toISOString(),
        }),
        cand({
          candidateId: "2",
          funnelStage: "PAPERWORK_SIGNED",
          paperworkStatus: "signed",
          missingDocuments: true,
        }),
        cand({ candidateId: "3", funnelStage: "READY_FOR_MEL" }),
        cand({ candidateId: "4", funnelStage: "MEL_EXPORT_REVIEW" }),
      ],
    });
    assert.ok(metrics.awaitingSignature >= 1);
    assert.ok(metrics.readyForMelBacklog >= 1);
    assert.ok(metrics.melExportReviewBacklog >= 1);
    assert.equal(metrics.missingDocumentCases, 1);
  });

  it("detects bottlenecks", () => {
    const bottlenecks = detectBottlenecks({
      minGroupSize: 2,
      cohort: [
        cand({
          candidateId: "1",
          funnelStage: "RECRUITER_REVIEW",
          recruiter: "SlowR",
          stageEnteredAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        }),
        cand({
          candidateId: "2",
          funnelStage: "RECRUITER_REVIEW",
          recruiter: "SlowR",
          stageEnteredAt: new Date(Date.now() - 9 * 86400000).toISOString(),
        }),
      ],
    });
    assert.ok(bottlenecks.some((b) => b.dimension === "recruiter" && b.key === "SlowR"));
    assert.ok(bottlenecks.every((b) => b.advisory === true));
  });

  it("classifies executive exceptions", () => {
    const ex = classifyExecutiveExceptions({
      cohort: [
        cand({
          candidateId: "1",
          funnelStage: "PAPERWORK_SENT",
          paperworkStatus: "signed",
          missingShadow: true,
          shadowMismatch: true,
        }),
      ],
    });
    assert.ok(ex.some((e) => e.kind === "signed_but_not_advanced"));
    assert.ok(ex.some((e) => e.kind === "missing_shadow_state"));
  });

  it("forecast includes confidence and insufficient-data warning", () => {
    const small = buildForecasts({
      cohort: [cand({ candidateId: "1", funnelStage: "APPLIED" })],
      dateRangeLabel: "last_7_days",
    });
    assert.ok(small.every((f) => f.insufficientData));
    assert.ok(small.every((f) => f.warning));

    const large = buildForecasts({
      cohort: Array.from({ length: 20 }, (_, i) =>
        cand({ candidateId: `c${i}`, funnelStage: "PAPERWORK_NEEDED" }),
      ),
      dateRangeLabel: "last_7_days",
    });
    assert.ok(large.every((f) => !f.insufficientData));
    assert.ok(large[0]!.confidence > 0.4);
  });

  it("enforces role-based visibility and exception actions", () => {
    assert.equal(canViewSection("recruiter", "exceptions"), false);
    assert.equal(canViewSection("executive", "forecast"), true);
    assert.equal(canPerformExceptionAction("read_only_viewer", "acknowledge"), false);
    assert.equal(canPerformExceptionAction("operator", "request_reconciliation"), true);
  });

  it("supports API pagination and caching freshness", () => {
    const page = paginate([1, 2, 3, 4, 5], 2, 2);
    assert.deepEqual(page.items, [3, 4]);
    assert.equal(page.totalPages, 3);

    const at = setCached("k1", { ok: true }, 60_000);
    const hit = getCached<{ ok: boolean }>("k1");
    assert.equal(hit.hit, true);
    assert.equal(hit.generatedAt, at);
  });

  it("builds executive dashboard read-only with safety zeros", () => {
    const dash = buildExecutiveDashboard({
      role: "executive",
      cohort: [
        cand({ candidateId: "1", funnelStage: "APPLIED" }),
        cand({ candidateId: "2", funnelStage: "READY_FOR_MEL" }),
      ],
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
    assert.equal(dash.safety.productionWritesAttempted, 0);
    assert.equal(dash.safety.melWritesAttempted, 0);
    assert.equal(dash.safety.paperworkSendsAttempted, 0);
    assert.equal(dash.isolation.p186NonAuthoritative, true);
    assert.ok(dash.funnel);
    assert.ok(dash.health);
  });

  it("stale system health marks metrics unconfident", () => {
    const health = buildSystemHealth({
      lastBreezyEventAt: null,
      lastWorkflowEventAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    });
    assert.equal(metricsAreConfident(health), false);
  });

  it("does not import paperwork send or MEL write APIs", async () => {
    const dir = path.join(process.cwd(), "src/lib/p186-6-executive-recruiting-intelligence");
    const files = ["index.ts", "dashboard.ts", "forecast.ts", "exceptions.ts", "funnel.ts"];
    for (const f of files) {
      const text = await readFile(path.join(dir, f), "utf8");
      assert.equal(
        /from\s+["']@\/lib\/p184|from\s+["']@\/lib\/p185-production|executeOnboardingSend|sendPaperwork|exportToMelApi/i.test(
          text,
        ),
        false,
        f,
      );
    }
  });

  it("does not perform automatic lifecycle transitions", () => {
    const aging = calculateAging({
      cohort: [cand({ candidateId: "1", funnelStage: "PAPERWORK_SENT" })],
    });
    assert.equal(aging[0]!.stage, "PAPERWORK_SENT");
    assert.match(aging[0]!.recommendedNextAction, /Follow up|Monitor|Investigate|Nudge|Escalate|Authorize|Complete|Review/i);
  });
});
