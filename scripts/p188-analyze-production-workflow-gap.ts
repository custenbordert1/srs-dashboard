/**
 * P188 — Read-only production workflow gap analysis + artifact writer.
 * Does not mutate candidates, enable automation, send paperwork, or change flags.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildFlowDiagramMarkdown,
  buildHiringRecommendationCodePath,
  P188_SAFETY,
  runProductionGapAnalysis,
  summarizeClassificationsForArtifact,
  buildHiringRecommendationGaps,
} from "@/lib/p188-production-workflow-gap-analysis";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";

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
  await mkdir(ART, { recursive: true });

  const state = await getCandidateWorkflowState();
  const workflows = Object.values(state);
  const report = runProductionGapAnalysis(workflows);
  const classifications = summarizeClassificationsForArtifact(workflows);
  const { gaps, explanations } = buildHiringRecommendationGaps(workflows);
  const codePath = buildHiringRecommendationCodePath();

  const withRec = workflows.filter((w) => Boolean(w.recommendedStage?.trim())).length;
  const unassigned = workflows.filter(
    (w) => !w.assignedRecruiter || w.assignedRecruiter === "Unassigned",
  ).length;

  // 1) production-lifecycle-analysis.md
  const lifecycleMd = [
    "# Production Lifecycle Analysis (P188)",
    "",
    `Generated: ${report.generatedAt}`,
    `Commit: \`${report.productionCommit}\``,
    `Candidates scanned: **${report.candidatesScanned}**`,
    "",
    "## Stage ownership & writers",
    "",
    "| Stage | Count (furthest) | Avg age (d) | Owner | Writer | API | Expected next |",
    "|---|---:|---:|---|---|---|---|",
    ...report.stageStats.map(
      (s) =>
        `| ${s.stage} | ${s.totalCandidates} | ${s.averageAgeDays ?? "—"} | ${s.stageOwner} | ${s.productionWriter} | ${s.apiResponsible} | ${s.expectedNextTransition} |`,
    ),
    "",
    "## Entering / exiting notes",
    "",
    ...report.stageStats.map(
      (s) =>
        `### ${s.stage}\n- Entering: ${s.candidatesEnteringHint}\n- Exiting: ${s.candidatesExitingHint}\n- Workflow: ${s.workflowResponsible}\n`,
    ),
    "",
    "## Flow stop",
    "",
    report.flowStopPoint,
    "",
    buildFlowDiagramMarkdown(report.flowStopPoint),
    "",
    "## Safety",
    "",
    "```json",
    JSON.stringify(P188_SAFETY, null, 2),
    "```",
    "",
  ].join("\n");

  // 2) production-stage-distribution.json
  const distribution = {
    generatedAt: report.generatedAt,
    productionCommit: report.productionCommit,
    candidatesScanned: report.candidatesScanned,
    rawStatusLikeDistribution: report.stageDistribution,
    furthestLegitimateStageCounts: report.furthestStageCounts,
    recommendedStagePersistedCount: withRec,
    unassignedRecruiterCount: unassigned,
    hiringRecommendationCount: report.hiringRecommendationCount,
    sampleClassifications: classifications.slice(0, 40),
    safety: P188_SAFETY,
  };

  // 3) hiring-recommendation-gap-analysis.md
  const gapReasonRollup: Record<string, number> = {};
  for (const g of gaps) {
    if (g.missingRecommendationEvidence) gapReasonRollup.missingRecommendationEvidence = (gapReasonRollup.missingRecommendationEvidence ?? 0) + 1;
    if (g.missingRecruiterAction) gapReasonRollup.missingRecruiterAction = (gapReasonRollup.missingRecruiterAction ?? 0) + 1;
    if (g.missingApiCall) gapReasonRollup.missingApiCall = (gapReasonRollup.missingApiCall ?? 0) + 1;
    if (g.missingWorkflowTransition) gapReasonRollup.missingWorkflowTransition = (gapReasonRollup.missingWorkflowTransition ?? 0) + 1;
    if (g.unresolvedJob) gapReasonRollup.unresolvedJob = (gapReasonRollup.unresolvedJob ?? 0) + 1;
    if (g.unresolvedOwner) gapReasonRollup.unresolvedOwner = (gapReasonRollup.unresolvedOwner ?? 0) + 1;
    if (g.staleWorkflow) gapReasonRollup.staleWorkflow = (gapReasonRollup.staleWorkflow ?? 0) + 1;
    if (g.missingStateMapping) gapReasonRollup.missingStateMapping = (gapReasonRollup.missingStateMapping ?? 0) + 1;
    if (g.lifecycleBug) gapReasonRollup.lifecycleBug = (gapReasonRollup.lifecycleBug ?? 0) + 1;
  }

  const hrGapMd = [
    "# Hiring Recommendation Gap Analysis (P188)",
    "",
    `Hiring Recommendation furthest-stage count: **${report.hiringRecommendationCount}**`,
    `Persisted recommendedStage rows: **${withRec}**`,
    "",
    "## Why zero candidates reached Hiring Recommendation",
    "",
    ...explanations.map((e) => `- ${e}`),
    "",
    "## Block-reason rollup (pre + bypassed candidates)",
    "",
    "```json",
    JSON.stringify(gapReasonRollup, null, 2),
    "```",
    "",
    "## Expected vs actual",
    "",
    "- **Expected:** Applied → Recruiter Review → durable Hiring Recommendation (`recommendedStage`) → Operator Approved → Paperwork Needed → send.",
    "- **Actual:** Applied backlog (majority) OR onboarding reconcile jump to Paperwork Sent/Signed; no durable HR evidence; owners Unassigned; no job on workflow records.",
    "",
    "## Sample gaps (redacted)",
    "",
    ...gaps.slice(0, 15).map(
      (g) =>
        `- ${g.redactedCandidateId}: expected="${g.expectedBehavior}" actual="${g.actualBehavior}"`,
    ),
    "",
  ].join("\n");

  // 4) workflow-call-graph.md
  const callGraphMd = [
    "# Workflow Call Graph — Hiring Recommendation creation (P188)",
    "",
    "```",
    "UI candidates list",
    "  → build-candidate-workflow-row.enrichRowWithCandidateProgression  [display_only]",
    "  → (optional) candidate-workflow-client auto-progression",
    "       → POST /api/candidates/workflows/auto-progression  [exists]",
    "            → runCandidateProgressionEngine(persist:true)",
    "                 → buildCandidateProgressionDecision",
    "                 → applyCandidateProgressions",
    "                      → upsertCandidateWorkflow(recommendedStage)  [storage]",
    "                      → audit generate_candidate_progression",
    "",
    "Parallel / competing:",
    "  P151 / P83 applyCandidateAdvancements  [disabled / bypasses to Paperwork Needed]",
    "  POST /api/candidates/workflows manual status  [exists]",
    "  reconcile-workflow-from-onboarding  [executes — bypasses HR]",
    "",
    "Shadow only:",
    "  P186.1 deriveLifecycleState(recommendedStage → HIRING_RECOMMENDATION)  [replaced/shadow]",
    "",
    "Missing:",
    "  dedicated create-hiring-recommendation API  [never_called / does not exist]",
    "```",
    "",
    "## Node inventory",
    "",
    "| ID | Kind | Status | Path |",
    "|---|---|---|---|",
    ...codePath.map((n) => `| ${n.id} | ${n.kind} | ${n.status} | \`${n.path}\` |`),
    "",
    ...codePath.map(
      (n) => `### ${n.id}\n- Role: ${n.role}\n- Detail: ${n.detail}\n`,
    ),
  ].join("\n");

  // 5) transition-root-cause-report.md
  const rootCauseMd = [
    "# Transition Root Cause Report (P188)",
    "",
    "| Missing transition | Root cause | Impact | Proposed fix | Effort | Risk |",
    "|---|---|---|---|---|---|",
    ...report.recommendations.map(
      (r) =>
        `| ${r.missingTransition} | ${r.rootCause} | ${r.impact} | ${r.proposedFix} | ${r.implementationEffort} | ${r.productionRisk} |`,
    ),
    "",
    "**No fixes implemented in P188.**",
    "",
  ].join("\n");

  // 6) executive-production-gap-report.md
  const execMd = [
    "# Executive Production Gap Report (P188)",
    "",
    "## Bottom line",
    "",
    `P187 cannot select a canary cohort because **${report.hiringRecommendationCount}** production candidates are at Hiring Recommendation.`,
    "",
    "Hiring Recommendation is **not** a stored workflow status. It is inferred when durable `recommendedStage` contains hire/recommend/paperwork signals. That field is **empty for all scanned candidates**.",
    "",
    "## Funnel snapshot (furthest legitimate stage)",
    "",
    ...Object.entries(report.furthestStageCounts).map(([k, v]) => `- **${k}:** ${v}`),
    "",
    "## Where production stops",
    "",
    report.flowStopPoint,
    "",
    "## Primary causes",
    "",
    "1. **No durable recommendation evidence** (`recommendedStage` = 0).",
    "2. **Mid-funnel bypass** via onboarding reconciliation (Applied → Paperwork Sent/Signed).",
    "3. **No recruiter ownership** (all Unassigned) and **no job on workflow records** — P187 gates fail even if recommendations appear.",
    "4. **HR creation path is fragmented**: UI display-only enrichment; auto-progression API unused in practice; no dedicated Recommend Hire API.",
    "",
    "## What not to do yet",
    "",
    "- Do not run P187 production canary.",
    "- Do not enable continuous automation to “force” recommendations.",
    "- Do not treat Paperwork Sent as proof of Operator Approved.",
    "",
    "## Recommended next work (future phases — not P188)",
    "",
    "1. Ship explicit recruiter **Recommend hire** write to `recommendedStage` + audit.",
    "2. Assign recruiters / resolve job IDs for eligibility.",
    "3. Prevent onboarding reconcile from skipping approval for unapproved Applied candidates.",
    "4. Re-run P187.1 cohort selection.",
    "",
    "## Validation",
    "",
    "```json",
    JSON.stringify(report.safety, null, 2),
    "```",
    "",
  ].join("\n");

  await writeFile(path.join(ART, "production-lifecycle-analysis.md"), lifecycleMd);
  await writeFile(
    path.join(ART, "production-stage-distribution.json"),
    JSON.stringify(distribution, null, 2),
  );
  await writeFile(path.join(ART, "hiring-recommendation-gap-analysis.md"), hrGapMd);
  await writeFile(path.join(ART, "workflow-call-graph.md"), callGraphMd);
  await writeFile(path.join(ART, "transition-root-cause-report.md"), rootCauseMd);
  await writeFile(path.join(ART, "executive-production-gap-report.md"), execMd);

  console.log(
    JSON.stringify(
      {
        ok: true,
        candidatesScanned: report.candidatesScanned,
        hiringRecommendationCount: report.hiringRecommendationCount,
        furthestStageCounts: report.furthestStageCounts,
        recommendedStagePersistedCount: withRec,
        unassignedRecruiterCount: unassigned,
        safety: report.safety,
        artifactsWritten: 6,
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
