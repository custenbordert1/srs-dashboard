/**
 * P204 — AI Candidate Qualification Engine simulation (read-only).
 * Does not write lifecycle, Dropbox, MEL, P192, or production flags.
 *
 *   npm run p204:simulate
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runP204QualificationSimulation } from "@/lib/p204-ai-candidate-qualification";

async function main() {
  mkdirSync("artifacts", { recursive: true });
  const { report, publicDecisions } = await runP204QualificationSimulation();

  const breakdown = {
    generatedAt: report.generatedAt,
    sourcePhase: report.sourcePhase,
    appliedAnalyzed: report.appliedAnalyzed,
    recommendations: report.recommendations,
    byRecommendation: {
      advance_paperwork_needed: publicDecisions.filter(
        (d) => d.recommendation === "advance_paperwork_needed",
      ).length,
      needs_recruiter_review: publicDecisions.filter(
        (d) => d.recommendation === "needs_recruiter_review",
      ).length,
      reject: publicDecisions.filter((d) => d.recommendation === "reject").length,
    },
    sampleAdvance: publicDecisions
      .filter((d) => d.recommendation === "advance_paperwork_needed")
      .slice(0, 25),
    sampleReview: publicDecisions
      .filter((d) => d.recommendation === "needs_recruiter_review")
      .slice(0, 25),
    sampleReject: publicDecisions
      .filter((d) => d.recommendation === "reject")
      .slice(0, 25),
  };

  const confidenceAnalysis = {
    generatedAt: report.generatedAt,
    sourcePhase: report.sourcePhase,
    averageConfidence: report.averageConfidence,
    confidenceDistribution: report.confidenceDistribution,
    falsePositiveReview: report.falsePositiveReview,
    topReasonCodes: report.topReasonCodes,
    byRecommendationAverages: {
      advance: avg(
        publicDecisions
          .filter((d) => d.recommendation === "advance_paperwork_needed")
          .map((d) => d.confidence),
      ),
      review: avg(
        publicDecisions
          .filter((d) => d.recommendation === "needs_recruiter_review")
          .map((d) => d.confidence),
      ),
      reject: avg(
        publicDecisions.filter((d) => d.recommendation === "reject").map((d) => d.confidence),
      ),
    },
    componentAverages: {
      p193: avg(publicDecisions.map((d) => d.components.p193Confidence)),
      p1934: avg(publicDecisions.map((d) => d.components.p1934Confidence)),
      readiness: avg(publicDecisions.map((d) => d.components.readinessConfidence)),
      resume: avg(publicDecisions.map((d) => d.components.resumeScore)),
      questionnaire: avg(publicDecisions.map((d) => d.components.questionnaireScore)),
    },
  };

  const readiness = `# P204 — AI Candidate Qualification Readiness

Generated: ${report.generatedAt}

## Summary

| Item | Value |
|---|---|
| Applied candidates analyzed | **${report.appliedAnalyzed}** |
| Advance to Paperwork Needed | **${report.recommendations.advance}** (${report.recommendations.advancePct}%) |
| Needs Recruiter Review | **${report.recommendations.review}** (${report.recommendations.reviewPct}%) |
| Reject | **${report.recommendations.reject}** (${report.recommendations.rejectPct}%) |
| Average confidence | **${report.averageConfidence}** |
| False-positive review | ${report.falsePositiveReview.count} (${report.falsePositiveReview.pctOfReviews}% of reviews) |
| Estimated recruiter hours saved | **${report.estimatedRecruiterHoursSaved}** (at ${report.assumptions.minutesPerManualReview} min/review) |
| Lifecycle / Dropbox / MEL / P192 writes | **0 / 0 / 0 / 0** |

## Top decision factors

${report.topReasonCodes.map((r) => `- \`${r.code}\`: ${r.count}`).join("\n")}

## Confidence distribution

${Object.entries(report.confidenceDistribution)
  .map(([bucket, count]) => `- ${bucket}: ${count}`)
  .join("\n")}

## Recommendation

**${report.recommendation}**

P204 is a decision engine only — no candidates were advanced, rejected, or status-changed.
`;

  writeFileSync(
    path.join("artifacts", "p204-ai-qualification-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  writeFileSync(
    path.join("artifacts", "p204-recommendation-breakdown.json"),
    `${JSON.stringify(breakdown, null, 2)}\n`,
  );
  writeFileSync(
    path.join("artifacts", "p204-confidence-analysis.json"),
    `${JSON.stringify(confidenceAnalysis, null, 2)}\n`,
  );
  writeFileSync(path.join("artifacts", "p204-readiness-report.md"), readiness);

  console.log(
    JSON.stringify(
      {
        appliedAnalyzed: report.appliedAnalyzed,
        advance: report.recommendations.advance,
        review: report.recommendations.review,
        reject: report.recommendations.reject,
        averageConfidence: report.averageConfidence,
        hoursSaved: report.estimatedRecruiterHoursSaved,
        recommendation: report.recommendation,
      },
      null,
      2,
    ),
  );
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
