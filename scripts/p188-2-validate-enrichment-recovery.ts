/**
 * P188.2 validation — read-only enrichment recovery against local production mirrors.
 * Never writes mappings, recommendations, approvals, paperwork, MEL, or P187.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  loadP1882EnrichmentBundleFromLocal,
  readP1882Flags,
  refuseProductionEnrichmentWrite,
  runP1882EnrichmentPipeline,
  P188_2_SOURCE_PHASE,
} from "@/lib/p188-2-breezy-enrichment-recovery";

function loadEnvLocal(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

const ART = path.join(process.cwd(), "artifacts");

async function main() {
  loadEnvLocal();
  delete process.env.P188_ENRICHMENT_WRITE_EXECUTION;
  delete process.env.P187_EXECUTE_PRODUCTION_CANARY;
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
  delete process.env.P188_RECOMMENDATION_API;

  await mkdir(ART, { recursive: true });

  const flags = readP1882Flags();
  const writeGate = refuseProductionEnrichmentWrite({
    enrichmentWriteExecutionFlag: flags.enrichmentWriteExecution,
    allowProductionWrites: false,
  });

  const bundle = await loadP1882EnrichmentBundleFromLocal();
  const result = runP1882EnrichmentPipeline({
    bundle,
    operatorAuthorizationPresent: false,
  });

  const recruiterArtifact = {
    sourcePhase: P188_2_SOURCE_PHASE,
    scannedAt: result.scannedAt,
    recordsScanned: result.recordsScanned,
    counts: result.recruiter.counts,
    resolved: result.recruiter.resolved.map((r) => ({
      candidateId: r.candidateId,
      recruiter: r.recruiter,
      source: r.source,
      confidence: r.confidence,
      evidenceReference: r.evidenceReference,
    })),
    ambiguous: result.recruiter.ambiguous.map((r) => ({
      candidateId: r.candidateId,
      alternateCandidates: r.alternateCandidates,
      evidenceReference: r.evidenceReference,
      operatorActionRequired: r.operatorActionRequired,
    })),
    unresolved: result.recruiter.unresolved.slice(0, 50).map((r) => ({
      candidateId: r.candidateId,
      detail: r.detail,
      operatorActionRequired: r.operatorActionRequired,
    })),
    unresolvedTotal: result.recruiter.unresolved.length,
    productionWrites: 0,
  };

  const jobArtifact = {
    sourcePhase: P188_2_SOURCE_PHASE,
    scannedAt: result.scannedAt,
    recordsScanned: result.recordsScanned,
    counts: result.job.counts,
    resolved: result.job.resolved.map((j) => ({
      candidateId: j.candidateId,
      jobId: j.jobId,
      jobTitle: j.jobTitle,
      city: j.city,
      state: j.state,
      source: j.source,
      confidence: j.confidence,
      evidenceReference: j.evidenceReference,
    })),
    ambiguous: result.job.ambiguous.map((j) => ({
      candidateId: j.candidateId,
      alternateMatches: j.alternateMatches,
      evidenceReference: j.evidenceReference,
      operatorActionRequired: j.operatorActionRequired,
    })),
    unresolved: result.job.unresolved.slice(0, 50).map((j) => ({
      candidateId: j.candidateId,
      detail: j.detail,
      operatorActionRequired: j.operatorActionRequired,
    })),
    unresolvedTotal: result.job.unresolved.length,
    productionWrites: 0,
  };

  const queueArtifact = {
    sourcePhase: P188_2_SOURCE_PHASE,
    scannedAt: result.scannedAt,
    queueSizes: Object.fromEntries(
      Object.entries(result.operatorQueues).map(([k, v]) => [k, v.length]),
    ),
    queues: {
      recruiter_ambiguous: result.operatorQueues.recruiter_ambiguous.slice(0, 100),
      job_ambiguous: result.operatorQueues.job_ambiguous.slice(0, 100),
      conflicting_evidence: result.operatorQueues.conflicting_evidence.slice(0, 100),
      stale_evidence: result.operatorQueues.stale_evidence.slice(0, 100),
      both_resolved: result.operatorQueues.both_resolved.slice(0, 50),
      one_resolved: result.operatorQueues.one_resolved.slice(0, 50),
    },
  };

  const previewArtifact = {
    sourcePhase: P188_2_SOURCE_PHASE,
    scannedAt: result.scannedAt,
    previewOnly: true,
    writeGate,
    bothResolvedCount: result.bothResolvedCount,
    oneResolvedCount: result.oneResolvedCount,
    proposedUpdates: result.previewUpdates,
    writeAuthorizationPackage: result.writeAuthorizationPackage,
    productionWrites: 0,
  };

  const readinessArtifact = {
    sourcePhase: P188_2_SOURCE_PHASE,
    scannedAt: result.scannedAt,
    ...result.readiness,
    bypassFindingsPreserved: result.bypass.findingsCount,
    bypassExcludedFromP187: result.bypass.excludedFromP187,
    pilotCandidates: result.pilotCandidates,
    sideEffects: result.sideEffects,
    finalRecommendation: result.finalRecommendation,
  };

  const forecastArtifact = {
    sourcePhase: P188_2_SOURCE_PHASE,
    scannedAt: result.scannedAt,
    predictedEligibleCount:
      result.readiness.predictedP187EligibleAfterValidRecommendations,
    note: "Forecast only after simulated successful Recommend Hire; P187 flags remain off; bypass cohort excluded.",
    p187AuthorityEnabled: false,
    operatorApprovalOccurred: false,
    canaryExecuted: false,
    bypassExcludedCount: result.bypass.findingsCount,
  };

  const report = `# P188.2 Breezy Recruiter and Job Enrichment Recovery

Generated: ${result.scannedAt}
Source phase: ${P188_2_SOURCE_PHASE}

## Validation summary

| Metric | Count |
| --- | ---: |
| Records scanned | ${result.recordsScanned} |
| Recruiter mappings found | ${result.recruiter.counts.resolved} |
| Recruiter ambiguous | ${result.recruiter.counts.ambiguous} |
| Recruiter unresolved | ${result.recruiter.counts.unresolved} |
| Job mappings found | ${result.job.counts.resolved} |
| Job ambiguous | ${result.job.counts.ambiguous} |
| Job unresolved | ${result.job.counts.unresolved} |
| Both resolved | ${result.bothResolvedCount} |
| Recommendation-ready after enrichment | ${result.readiness.readyForRecommendHire} |
| Ready for recruiter review | ${result.readiness.readyForRecruiterReview} |
| Still blocked | ${result.readiness.stillBlocked} |
| Pilot candidates available | ${result.pilotCandidates.length} |
| Historical bypass preserved | ${result.bypass.findingsCount} |
| Production writes | ${result.sideEffects.productionWrites} |
| Approvals | ${result.sideEffects.approvals} |
| Paperwork sends | ${result.sideEffects.paperworkSends} |
| MEL writes | ${result.sideEffects.melWrites} |

## P187 eligibility forecast

Predicted eligible after valid recommendations (simulation): **${result.readiness.predictedP187EligibleAfterValidRecommendations}**
P187 authority enabled: **false**
Canary executed: **false**

## Write gate

\`\`\`
${writeGate.detail}
\`\`\`

## Final recommendation

**${result.finalRecommendation}**

## Exact remaining operator action

1. Review ambiguous recruiter/job queues (\`artifacts/p188-2-operator-review-queue.json\`).
2. Confirm high-confidence preview mappings in \`artifacts/p188-2-enrichment-preview.json\`.
3. Provide operator-confirmed recruiter mappings where authoritative Breezy/audit evidence is absent.
4. Explicitly authorize a future enrichment write package (not executed in P188.2).
5. Do not enable P187 or Recommend Hire automation until controlled enrichment write succeeds and readiness re-check passes.

## Side effects (expected all zero)

- productionWrites=${result.sideEffects.productionWrites}
- approvals=${result.sideEffects.approvals}
- paperworkSends=${result.sideEffects.paperworkSends}
- melWrites=${result.sideEffects.melWrites}
- recommendationsExecuted=${result.sideEffects.recommendationsExecuted}
- p187Executed=${result.sideEffects.p187Executed}
`;

  await Promise.all([
    writeFile(
      path.join(ART, "p188-2-recruiter-recovery.json"),
      `${JSON.stringify(recruiterArtifact, null, 2)}\n`,
    ),
    writeFile(
      path.join(ART, "p188-2-job-recovery.json"),
      `${JSON.stringify(jobArtifact, null, 2)}\n`,
    ),
    writeFile(
      path.join(ART, "p188-2-operator-review-queue.json"),
      `${JSON.stringify(queueArtifact, null, 2)}\n`,
    ),
    writeFile(
      path.join(ART, "p188-2-enrichment-preview.json"),
      `${JSON.stringify(previewArtifact, null, 2)}\n`,
    ),
    writeFile(
      path.join(ART, "p188-2-recommendation-readiness.json"),
      `${JSON.stringify(readinessArtifact, null, 2)}\n`,
    ),
    writeFile(
      path.join(ART, "p188-2-p187-eligibility-forecast.json"),
      `${JSON.stringify(forecastArtifact, null, 2)}\n`,
    ),
    writeFile(path.join(ART, "p188-2-readiness-report.md"), report),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        recordsScanned: result.recordsScanned,
        recruiterResolved: result.recruiter.counts.resolved,
        jobResolved: result.job.counts.resolved,
        bothResolved: result.bothResolvedCount,
        recommendReady: result.readiness.readyForRecommendHire,
        pilot: result.pilotCandidates.length,
        bypass: result.bypass.findingsCount,
        sideEffects: result.sideEffects,
        finalRecommendation: result.finalRecommendation,
        artifacts: [
          "artifacts/p188-2-recruiter-recovery.json",
          "artifacts/p188-2-job-recovery.json",
          "artifacts/p188-2-operator-review-queue.json",
          "artifacts/p188-2-enrichment-preview.json",
          "artifacts/p188-2-recommendation-readiness.json",
          "artifacts/p188-2-p187-eligibility-forecast.json",
          "artifacts/p188-2-readiness-report.md",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
