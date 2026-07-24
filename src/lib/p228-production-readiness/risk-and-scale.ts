import type {
  P228BatchSize,
  P228DataQuality,
  P228DropboxSignHealth,
  P228EligibilityTotals,
  P228GoNoGo,
  P228HistoricalContext,
  P228PipelineInventory,
  P228RiskAssessment,
  P228RiskLevel,
  P228ScaleRecommendation,
} from "@/lib/p228-production-readiness/types";

function levelFromScore(score: number): P228RiskLevel {
  if (score >= 75) return "Low";
  if (score >= 50) return "Medium";
  return "High";
}

export function assessRisk(input: {
  pipeline: P228PipelineInventory;
  eligibility: P228EligibilityTotals;
  dataQuality: P228DataQuality;
  dropbox: P228DropboxSignHealth;
  historical: P228HistoricalContext;
  unassignedRecruiterPct: number;
  missingDmPct: number;
  coverageUnknownPct: number;
}): P228RiskAssessment {
  const { pipeline, eligibility, dataQuality, dropbox, historical } = input;

  const clampScore = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

  const pipelineScore = clampScore(
    70 +
      Math.min(20, pipeline.workflowActive / 20) -
      (pipeline.paperworkNeeded === 0 && eligibility.eligible === 0 ? 5 : 0) +
      (historical.p227LiveSendsSucceeded === 3 ? 10 : 0),
  );

  const dataScore = dataQuality.score;

  const routingScore = clampScore(
    90 -
      input.coverageUnknownPct * 40 -
      input.missingDmPct * 35 -
      Math.min(20, eligibility.over_60_miles),
  );

  const recruiterScore = clampScore(95 - input.unassignedRecruiterPct * 55);

  const workflowScore = clampScore(
    88 - Math.min(15, dataQuality.orphanWorkflow / 50) + (historical.p223InboxRestored ? 5 : 0),
  );

  const dropboxScore = clampScore(
    (historical.p227LiveSendsSucceeded === 3 && historical.p227SideEffects === 0 ? 88 : 55) -
      dropbox.failed * 5 -
      dropbox.duplicatePreventionCount * 3 -
      (historical.p227TestMode ? 8 : 0),
  );

  const recoveryScore =
    historical.p226RecoveredEligible >= 2 && historical.p227LiveSendsSucceeded === 3
      ? 90
      : 60;

  const dashboardScore = clampScore(
    80 + (historical.p223InboxRestored ? 10 : 0) - Math.min(15, dataQuality.orphanWorkflow / 80),
  );

  const dimensions: P228RiskAssessment["dimensions"] = {
    pipeline_stability: {
      level: levelFromScore(pipelineScore),
      score: pipelineScore,
      explanation:
        pipelineScore < 75
          ? `Workflow-active=${pipeline.workflowActive}; paperworkNeeded=${pipeline.paperworkNeeded}; send-eligible=${eligibility.eligible}. Funnel is stable but thin at send-ready stage after P227.`
          : null,
    },
    data_quality: {
      level: levelFromScore(dataScore),
      score: dataScore,
      explanation:
        dataScore < 75
          ? `Data quality ${dataScore}/100 — orphanWorkflow=${dataQuality.orphanWorkflow}, workflowRestored=${dataQuality.workflowRestored}, duplicates=${dataQuality.duplicates}.`
          : null,
    },
    routing_quality: {
      level: levelFromScore(routingScore),
      score: routingScore,
      explanation:
        routingScore < 75
          ? `Coverage unknown ${(input.coverageUnknownPct * 100).toFixed(0)}%, missing DM ${(input.missingDmPct * 100).toFixed(0)}%, over-60 blockers=${eligibility.over_60_miles}.`
          : null,
    },
    recruiter_ownership: {
      level: levelFromScore(recruiterScore),
      score: recruiterScore,
      explanation:
        recruiterScore < 75
          ? `${(input.unassignedRecruiterPct * 100).toFixed(0)}% of workflow-active candidates lack a named recruiter (P227 still succeeded with Unassigned).`
          : null,
    },
    workflow_integrity: {
      level: levelFromScore(workflowScore),
      score: workflowScore,
      explanation:
        workflowScore < 75
          ? `Orphan workflow records=${dataQuality.orphanWorkflow}; P223 restoration mitigates inbox gaps.`
          : null,
    },
    dropbox_reliability: {
      level: levelFromScore(dropboxScore),
      score: dropboxScore,
      explanation:
        dropboxScore < 75
          ? historical.p227TestMode
            ? "Controlled sends succeeded (P219–P227) but remain testMode=true — production (testMode=false) not yet authorized."
            : `Dropbox failures=${dropbox.failed}, duplicate prevention hits=${dropbox.duplicatePreventionCount}.`
          : null,
    },
    recovery_reliability: {
      level: levelFromScore(recoveryScore),
      score: recoveryScore,
      explanation:
        recoveryScore < 75
          ? "Recovery path not fully validated end-to-end."
          : null,
    },
    dashboard_accuracy: {
      level: levelFromScore(dashboardScore),
      score: dashboardScore,
      explanation:
        dashboardScore < 75
          ? "Inbox/dashboard may under-count workflow-restored rows without P223 union."
          : null,
    },
  };

  const scores = Object.values(dimensions).map((d) => d.score);
  const operationalReadinessScore = Math.round(
    scores.reduce((a, b) => a + b, 0) / scores.length,
  );

  return { dimensions, operationalReadinessScore };
}

export function recommendScale(input: {
  eligiblePopulation: number;
  risk: P228RiskAssessment;
  historical: P228HistoricalContext;
  topBlockers: Array<{ blocker: string; count: number }>;
}): P228ScaleRecommendation {
  const { eligiblePopulation, risk, historical } = input;
  const readiness = risk.operationalReadinessScore;
  const highRisks = Object.entries(risk.dimensions).filter(([, v]) => v.level === "High");

  let recommendedMaximumBatchSize: P228BatchSize = 5;
  const rationale: string[] = [];

  if (highRisks.length > 0) {
    recommendedMaximumBatchSize = 5;
    rationale.push(
      `High residual risk on ${highRisks.map(([k]) => k).join(", ")} — keep next batch at 5.`,
    );
  } else if (readiness < 55) {
    recommendedMaximumBatchSize = 5;
    rationale.push("Operational readiness <55 — keep next batch at 5.");
  } else if (historical.p227LiveSendsSucceeded === 3 && historical.p227SideEffects === 0) {
    if (readiness >= 80 && !historical.p227TestMode && eligiblePopulation >= 20) {
      recommendedMaximumBatchSize = 20;
      rationale.push("Strong readiness, production mode, and eligible pool ≥20 support batch 20.");
    } else if (readiness >= 70 && eligiblePopulation >= 10) {
      recommendedMaximumBatchSize = 10;
      rationale.push("P227 validated 3 sends; eligible pool supports cautious step-up to 10.");
    } else {
      recommendedMaximumBatchSize = 5;
      rationale.push(
        "P219–P221 (2) and P227 (3) succeeded in testMode; next safe operator-controlled batch is 5 once eligible candidates exist.",
      );
    }
  }

  if (eligiblePopulation === 0) {
    rationale.push(
      "Current send-eligible population is 0 (P227 consumed Melinda/Christina/Sarah; remaining Paperwork Needed are over-60).",
    );
    rationale.push("Authorize batch size for the next eligible cohort — do not force-send ineligible candidates.");
  }

  if (historical.p227TestMode) {
    rationale.push("All recent Dropbox Sign validation used testMode=true — do not jump to Unlimited or production mode yet.");
  }

  rationale.push("Unlimited operator-controlled is not recommended until production-mode sends and larger eligible pool are proven.");

  return {
    recommendedMaximumBatchSize,
    rationale,
    eligiblePopulation,
    historicalValidation: {
      p219_p221_success: true,
      p227_success: true,
      p227_targets: 3,
      p227_sideEffects: 0,
      testModeOnly: true,
    },
    remainingBlockersTop: input.topBlockers.slice(0, 10).map((b) => ({
      blocker: b.blocker as P228ScaleRecommendation["remainingBlockersTop"][number]["blocker"],
      count: b.count,
    })),
    riskSummary: `Operational readiness ${readiness}/100; high-risk dimensions: ${
      highRisks.map(([k]) => k).join(", ") || "none"
    }.`,
  };
}

export function decideGoNoGo(input: {
  risk: P228RiskAssessment;
  scale: P228ScaleRecommendation;
  historical: P228HistoricalContext;
  eligiblePopulation: number;
}): P228GoNoGo {
  const conditions: string[] = [];
  const blockers: string[] = [];
  const high = Object.entries(input.risk.dimensions).filter(([, v]) => v.level === "High");

  if (high.length >= 3) {
    blockers.push(`Too many High risk dimensions (${high.map(([k]) => k).join(", ")})`);
  }

  if (!input.historical.p227LiveSendsSucceeded) {
    blockers.push("P227 controlled live send not verified");
  }

  if (blockers.length > 0) {
    return { decision: "NO GO", conditions: [], blockers };
  }

  conditions.push(
    `Maximum next batch size: ${input.scale.recommendedMaximumBatchSize} (operator-controlled)`,
  );
  conditions.push("Keep Dropbox Sign testMode=true until explicit production-mode authorization");
  conditions.push("Only Paperwork Needed + P214 send-eligible candidates (≤39 miles auto; 40–60 manual review)");
  conditions.push("Exclude over-60 / coverage-unknown without documented exception");
  conditions.push("No MEL / Breezy / recruiter ownership changes in send batches");
  conditions.push("Duplicate signature prevention must remain enforced");
  conditions.push("Re-run P228 eligibility snapshot before each live batch");

  if (input.eligiblePopulation === 0) {
    conditions.push(
      "No send-eligible candidates currently — wait for new Paperwork Needed cohort or approved recovery before executing",
    );
  }

  if (input.risk.dimensions.recruiter_ownership.level !== "Low") {
    conditions.push("Prefer named recruiter assignment before scaling beyond batch 10");
  }

  if (input.risk.operationalReadinessScore >= 70) {
    return { decision: "GO WITH CONDITIONS", conditions, blockers: [] };
  }

  conditions.push("Operational readiness below 70 — hold batch size at 5 and reassess after next successful send");
  return { decision: "GO WITH CONDITIONS", conditions, blockers: [] };
}
