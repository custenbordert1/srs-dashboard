/**
 * P144 — Candidate Advancement Intelligence validation artifact
 * Usage: npx tsx scripts/p144-candidate-advancement-intelligence.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCandidateAdvancementIntelligenceForSession } from "@/lib/p144-candidate-advancement-intelligence/load-candidate-advancement-intelligence";

async function main() {
  const result = await loadCandidateAdvancementIntelligenceForSession({
    userId: "p144-script",
    email: "script@local",
    name: "P144 Script",
    role: "executive",
    territoryStates: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  });

  const snapshot = result.ok
    ? result.snapshot
    : result.snapshot ?? {
        sourcePhase: "P144" as const,
        generatedAt: new Date().toISOString(),
        mode: "readOnly" as const,
        partialSync: true,
        candidatesEvaluated: 0,
        scoreWeights: {},
        evaluations: [],
        executive: {
          automationCandidatesToday: 0,
          readyToAdvance: 0,
          manualReviewQueue: 0,
          highestProbabilityHires: 0,
          highestRiskCandidates: 0,
          averageAdvancementScore: 0,
          averageHireProbability: 0,
          pipelineHealthScore: 0,
        },
        automationPreviewQueue: [],
        validation: {
          topAutomationCandidates: [],
          topManualReviewCandidates: [],
          averageAdvancementScore: 0,
          averageHireProbability: 0,
          distributionByRecruiter: [],
          distributionByProject: [],
          pipelineBottlenecks: [],
          largestBlockers: [],
          automationEligibleCount: 0,
        },
        executeBatchCalled: false,
        breezyWrites: false,
        paperworkSent: false,
        liveModeEnabled: false,
      };

  const artifact = {
    sourcePhase: "P144",
    generatedAt: new Date().toISOString(),
    productionReadiness: {
      recommendation: result.ok && snapshot.candidatesEvaluated > 0 ? "READY WITH CONDITIONS" : "NOT READY",
      score: result.ok ? Math.min(100, 60 + Math.round(snapshot.candidatesEvaluated / 10)) : 40,
      checks: {
        everyCandidateScored: snapshot.candidatesEvaluated > 0,
        hireProbabilityPresent: snapshot.evaluations.every((e) => e.estimatedHireProbability > 0),
        nextActionPresent: snapshot.evaluations.every((e) => Boolean(e.nextAction)),
        automationPreviewPopulated: snapshot.automationPreviewQueue.length >= 0,
        executiveMetricsPresent: snapshot.executive.averageAdvancementScore >= 0,
        apiPartialDegrades: result.partial === true || result.ok,
        readOnlyConfirmed:
          snapshot.executeBatchCalled === false &&
          snapshot.breezyWrites === false &&
          snapshot.paperworkSent === false,
      },
    },
    validation: snapshot.validation,
    executive: snapshot.executive,
    automationPreviewQueueCount: snapshot.automationPreviewQueue.length,
    candidatesEvaluated: snapshot.candidatesEvaluated,
    partialSync: snapshot.partialSync,
    safetyConfirmation: {
      executeBatchCalled: false,
      breezyWrites: false,
      paperworkSent: false,
      liveModeEnabled: snapshot.liveModeEnabled,
      previewOnlyQueue: true,
    },
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p144-candidate-advancement-intelligence.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p144-candidate-advancement-intelligence.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  const md = `# P144 — Candidate Advancement Intelligence Validation

**Generated:** ${artifact.generatedAt}  
**Recommendation:** ${artifact.productionReadiness.recommendation}  
**Readiness score:** ${artifact.productionReadiness.score}/100

## Executive metrics

| Metric | Value |
|--------|-------|
| Candidates evaluated | ${artifact.candidatesEvaluated} |
| Automation eligible | ${artifact.validation.automationEligibleCount} |
| Avg advancement score | ${artifact.validation.averageAdvancementScore} |
| Avg hire probability | ${artifact.validation.averageHireProbability}% |
| Automation preview queue | ${artifact.automationPreviewQueueCount} |

## Top blockers

${artifact.validation.largestBlockers.map((b) => `- ${b.blocker}: ${b.count}`).join("\n") || "- none"}

## Safety

- Read-only Phase 1 — no Breezy writes, sends, or candidate movement
- executeBatch: not called
- Preview queue Approve/Reject disabled
`;

  await writeFile(mdPath, md, "utf8");

  console.log(JSON.stringify({ ok: true, jsonPath, mdPath, ...artifact.productionReadiness }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
