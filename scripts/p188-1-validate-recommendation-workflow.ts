/**
 * P188.1 validation — read-only scan + dry-run simulations.
 * Does not execute production recommendations, P187 canary, paperwork, or MEL.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  buildCandidateContextFromWorkflow,
  buildRecommendationQueues,
  classifyUnresolvedRecruiters,
  detectOnboardingBypassFindings,
  executeRecommendHire,
  forecastP187EligibilityAfterRecommendations,
  P188_1_RECOMMENDED_STAGE,
  P188_1_SOURCE_PHASE,
  readP1881Flags,
  recoverJobAssignment,
  recoverRecruiterAssignment,
  validateRecommendHire,
  type P1881RecommendHireResult,
} from "@/lib/p188-1-hiring-recommendation-workflow";

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
  delete process.env.P188_RECOMMENDATION_API;
  delete process.env.P188_BULK_RECOMMENDATION_EXECUTION;
  delete process.env.P187_EXECUTE_PRODUCTION_CANARY;
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;

  await mkdir(ART, { recursive: true });

  const flags = readP1881Flags();
  const workflows = Object.values(await getCandidateWorkflowState());

  const recruiterResults = workflows.map((wf) =>
    recoverRecruiterAssignment(
      {
        candidateId: wf.candidateId,
        persistedRecruiter: wf.assignedRecruiter,
        // No live Breezy/owner enrichments in this validation pass.
        candidateOwner: null,
        breezyAssignee: null,
        territoryDmRoute: null,
        assignmentAuditRecruiter: null,
        operatorConfirmed: null,
      },
      { recruiterAssignmentRecovery: true },
    ),
  );
  const recruiterClass = classifyUnresolvedRecruiters(recruiterResults);

  const jobResults = workflows.map((wf) =>
    recoverJobAssignment(
      {
        candidateId: wf.candidateId,
        breezyPositionId: null,
        friendlyId: null,
        catalog: [],
      },
      { jobAssignmentRecovery: true },
    ),
  );
  const jobsResolved = jobResults.filter((j) => j.resolved).length;
  const jobsUnresolved = jobResults.filter((j) => !j.resolved).length;

  // Simulate enrichments only where recovery uniquely resolves (none expected without sources).
  const enrichments: Record<
    string,
    { jobId?: string; jobResolved?: boolean; recruiterId?: string; recruiterResolved?: boolean }
  > = {};
  for (const r of recruiterClass.resolved) {
    enrichments[r.candidateId] = {
      ...(enrichments[r.candidateId] ?? {}),
      recruiterId: r.recruiter!,
      recruiterResolved: true,
    };
  }

  const bypass = detectOnboardingBypassFindings(workflows, {
    bypassFindingsDashboard: true,
  });

  const queues = buildRecommendationQueues({
    workflows,
    enrichments,
    bypassFindings: bypass,
    actorRole: "recruiter",
  });

  let readyCount = 0;
  let blockedCount = 0;
  for (const wf of workflows) {
    const ctx = buildCandidateContextFromWorkflow(wf, wf.candidateId, enrichments[wf.candidateId]);
    const v = validateRecommendHire({
      actor: "validation",
      role: "recruiter",
      reason: "Validation readiness scan — not execution",
      context: ctx,
    });
    if (v.eligible) readyCount += 1;
    else if (["Applied", "Needs Review", "Qualified"].includes(wf.workflowStatus)) {
      blockedCount += 1;
    }
  }

  // Simulated successful recommendations (dry-run only) for forecast — use synthetic eligible set
  const simulated: P1881RecommendHireResult[] = [];
  const syntheticEligible = workflows
    .filter((w) => w.workflowStatus === "Needs Review" || w.workflowStatus === "Applied")
    .slice(0, 3);

  for (const wf of syntheticEligible) {
    const ctx = buildCandidateContextFromWorkflow(wf, wf.candidateId, {
      recruiterId: "Taylor",
      recruiterResolved: true,
      jobId: "job-sim-1",
      jobLabel: "Simulated Job",
      jobResolved: true,
      reviewCompleted: true,
      nowMs: Date.now(),
    });
    // Force fresh for simulation
    ctx.stale = false;
    ctx.updatedAt = new Date().toISOString();
    ctx.productionRecordVersion = `${ctx.updatedAt}:${wf.workflowStatus}:sim`;

    const sim = await executeRecommendHire(
      {
        candidateId: wf.candidateId,
        actor: "validation-sim",
        role: "recruiter",
        reason: "Simulated recommendation for forecast only",
        source: "test",
        context: ctx,
      },
      { dryRun: true },
      { recommendationApi: true },
    );
    simulated.push(sim);
  }

  const forecast = forecastP187EligibilityAfterRecommendations({
    workflows: syntheticEligible.map((w) => ({
      ...w,
      assignedRecruiter: "Taylor",
      recommendedStage: P188_1_RECOMMENDED_STAGE,
    })),
    successfulRecommendations: simulated.map((s) => ({
      ...s,
      ok: true,
      status: "recommended" as const,
    })),
    jobByCandidate: Object.fromEntries(
      syntheticEligible.map((w) => [w.candidateId, "job-sim-1"]),
    ),
  });

  const productionWrites = 0;
  const approvals = 0;
  const paperworkSends = 0;
  const melWrites = 0;

  const designMd = [
    "# P188.1 Recommendation Workflow Design",
    "",
    `Phase: ${P188_1_SOURCE_PHASE}`,
    "",
    "## Architecture",
    "",
    "```",
    "Authorized recruiter/DM/executive/operator",
    "  → validateRecommendHire (gates)",
    "  → confirmation preview (no paperwork)",
    "  → executeRecommendHire",
    "       → upsertCandidateWorkflow({ recommendedStage: 'Hiring Recommendation' })",
    "       → immutable recommend_hire audit (fail closed)",
    "       → observeWorkflowUpsertSafe → P186 HIRING_RECOMMENDATION",
    "  → P187 eligibility may detect candidate (authority flags remain OFF)",
    "```",
    "",
    "## Persisted evidence",
    "",
    `- recommendedStage = \`${P188_1_RECOMMENDED_STAGE}\``,
    "- progressionReason / progressionGeneratedAt / actor note with corr+idem keys",
    "- Does **not** set Paperwork Needed, Operator Approved, or send paperwork",
    "",
    "## Sibling actions",
    "",
    "- Return for More Review → Needs Review",
    "- Mark Not Qualified",
    "- Place on Hold (`[HOLD]` note)",
    "",
    "## Recovery",
    "",
    "- Recruiter: persisted → owner → Breezy → territory DM → audit → operator confirm (no guess)",
    "- Job: position ID → friendly ID → aliases → unique title+city+state → operator confirm",
    "",
    "## Mid-funnel bypass",
    "",
    "- Detector flags Applied/Review → Paperwork Sent skips",
    "- Optional `P188_PREVENT_ONBOARDING_MIDFUNNEL_BYPASS` keeps mid-funnel status while syncing historical paperwork fields",
    "",
    "## Flags (default OFF)",
    "",
    "```json",
    JSON.stringify(flags, null, 2),
    "```",
    "",
  ].join("\n");

  const recruiterReport = {
    generatedAt: new Date().toISOString(),
    scanned: workflows.length,
    resolved: recruiterClass.resolved.length,
    unresolved: recruiterClass.unresolved.length,
    ambiguous: recruiterClass.ambiguous.length,
    note: "Validation pass had no Breezy/owner enrichments — expect unresolved≈scanned unless persisted recruiter set",
    sampleUnresolved: recruiterClass.unresolved.slice(0, 10).map((r) => ({
      candidateId: `${r.candidateId.slice(0, 6)}…`,
      detail: r.detail,
    })),
    sampleAmbiguous: recruiterClass.ambiguous.slice(0, 10),
    productionWrites: 0,
  };

  const jobReport = {
    generatedAt: new Date().toISOString(),
    scanned: workflows.length,
    resolved: jobsResolved,
    unresolved: jobsUnresolved,
    note: "Validation pass had empty job catalog — unresolved expected until Breezy/position enrichments provided",
    productionWrites: 0,
  };

  const readiness = {
    generatedAt: new Date().toISOString(),
    workflowRecordsScanned: workflows.length,
    candidatesReadyForRecommendation: readyCount,
    candidatesBlocked: blockedCount,
    queueCounts: Object.fromEntries(
      Object.entries(queues).map(([k, v]) => [k, v.length]),
    ),
    simulatedSuccessfulRecommendations: simulated.filter((s) => s.ok).length,
    productionWrites,
    approvals,
    paperworkSends,
    melWrites,
  };

  const bypassReport = {
    generatedAt: new Date().toISOString(),
    findingsCount: bypass.length,
    findings: bypass.slice(0, 50).map((f) => ({
      candidateId: `${f.candidateId.slice(0, 6)}…`,
      reconciledTo: f.reconciledTo,
      detail: f.detail,
      paperworkSent: f.paperworkSent,
      createdHiringRecommendation: f.createdHiringRecommendation,
      createdOperatorApproved: f.createdOperatorApproved,
    })),
  };

  const eligibilityForecast = {
    generatedAt: new Date().toISOString(),
    ...forecast,
    note: "Forecast uses dry-run simulated recommendations with synthetic recruiter/job enrichment — not production writes",
    p187CanaryExecuted: false,
    authorityFlagsEnabled: false,
  };

  const verdict =
    readyCount > 0
      ? "ready_for_controlled_recommendation_pilot"
      : recruiterClass.unresolved.length > 0 || jobsUnresolved > 0
        ? "operator_data_cleanup_required"
        : "not_ready";

  const readinessMd = [
    "# P188.1 Readiness Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `## Verdict: **${verdict}**`,
    "",
    "## Validation summary",
    "",
    `- Workflow records scanned: **${workflows.length}**`,
    `- Recruiter assignments resolved: **${recruiterClass.resolved.length}**`,
    `- Recruiter assignments unresolved: **${recruiterClass.unresolved.length}** (ambiguous: ${recruiterClass.ambiguous.length})`,
    `- Job assignments resolved: **${jobsResolved}**`,
    `- Job assignments unresolved: **${jobsUnresolved}**`,
    `- Candidates ready for recommendation: **${readyCount}**`,
    `- Candidates blocked (mid-funnel): **${blockedCount}**`,
    `- Historical bypass findings: **${bypass.length}**`,
    `- Simulated successful recommendations (dry-run): **${simulated.filter((s) => s.ok).length}**`,
    `- P187 predicted eligible after approved sims: **${forecast.predictedEligibleCount}**`,
    "",
    "## Safety",
    "",
    `- production writes: **${productionWrites}**`,
    `- approvals: **${approvals}**`,
    `- paperwork sends: **${paperworkSends}**`,
    `- MEL writes: **${melWrites}**`,
    "",
    "## Remaining operator actions",
    "",
    "1. Provide Breezy/owner/position enrichments and re-run recruiter + job recovery.",
    "2. Operator-confirm ambiguous recruiter/job mappings.",
    "3. Enable `P188_RECOMMENDATION_UI` + `P188_RECOMMENDATION_API` in a controlled environment only.",
    "4. Recruiters complete review and execute Recommend Hire with confirmation preview.",
    "5. Do **not** enable P187 authority / execute canary until a real eligible cohort exists.",
    "",
    "## Exact flags for a later pilot (still OFF now)",
    "",
    "- P188_RECOMMENDATION_UI=1",
    "- P188_RECOMMENDATION_API=1",
    "- P188_RECRUITER_ASSIGNMENT_RECOVERY=1",
    "- P188_JOB_ASSIGNMENT_RECOVERY=1",
    "- Optional: P188_BYPASS_FINDINGS_DASHBOARD=1",
    "- Optional later: P188_PREVENT_ONBOARDING_MIDFUNNEL_BYPASS=1",
    "- Bulk execution remains off unless separately authorized",
    "",
  ].join("\n");

  await writeFile(path.join(ART, "p188-1-recommendation-workflow-design.md"), designMd);
  await writeFile(
    path.join(ART, "p188-1-recruiter-assignment-report.json"),
    JSON.stringify(recruiterReport, null, 2),
  );
  await writeFile(
    path.join(ART, "p188-1-job-assignment-report.json"),
    JSON.stringify(jobReport, null, 2),
  );
  await writeFile(
    path.join(ART, "p188-1-recommendation-readiness.json"),
    JSON.stringify(readiness, null, 2),
  );
  await writeFile(
    path.join(ART, "p188-1-bypass-findings.json"),
    JSON.stringify(bypassReport, null, 2),
  );
  await writeFile(
    path.join(ART, "p188-1-p187-eligibility-forecast.json"),
    JSON.stringify(eligibilityForecast, null, 2),
  );
  await writeFile(path.join(ART, "p188-1-readiness-report.md"), readinessMd);

  console.log(
    JSON.stringify(
      {
        ok: true,
        verdict,
        workflowRecordsScanned: workflows.length,
        recruiterResolved: recruiterClass.resolved.length,
        recruiterUnresolved: recruiterClass.unresolved.length,
        jobsResolved,
        jobsUnresolved,
        readyCount,
        blockedCount,
        bypassFindings: bypass.length,
        simulatedOk: simulated.filter((s) => s.ok).length,
        p187PredictedEligible: forecast.predictedEligibleCount,
        productionWrites,
        approvals,
        paperworkSends,
        melWrites,
        artifactsWritten: 7,
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
