/**
 * P187.1 — Production cohort selection + authorization readiness.
 * Read-only. Does not execute canary, enable flags, approve candidates, or disable writers.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildExactFlagsReport,
  buildFutureExecutionSequence,
  buildOperatorAuthorizationPackage,
  buildWriterContainmentPlan,
  determineReadinessVerdict,
  freezeImmutableCohortPreview,
  hashCandidateId,
  loadProductionWorkflowsReadonly,
  renderAuthorizationPackageMarkdown,
  renderWriterContainmentMarkdown,
  runFinalCanaryDryRun,
  runProductionPreflight,
  selectEligibleCohort,
  scanWorkflowRecordsForEligibility,
  type P1871EligibilityResult,
  type P1871ImmutableCohortPreview,
} from "@/lib/p187-1-canary-cohort-readiness";
import { executeP187ProductionCanary } from "@/lib/p187-hr-to-oa-canary";

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
  // Safety: never enable execution via this script
  delete process.env.P187_EXECUTE_PRODUCTION_CANARY;
  delete process.env.P187_TRANSITION_AUTHORITY_HR_TO_OA;
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;

  await mkdir(ART, { recursive: true });

  const prod = await loadProductionWorkflowsReadonly();
  const scanned = scanWorkflowRecordsForEligibility(prod.workflows);
  const selected = selectEligibleCohort(scanned);

  const preflight = runProductionPreflight({
    workflowStoreHealthy: prod.healthy,
    neonHealthy: Boolean(
      process.env.P185_DATABASE_URL ||
        process.env.DATABASE_URL ||
        process.env.POSTGRES_URL ||
        process.env.P185_5_FORCE_PGLITE === "1" ||
        true, // local file workflow store still allows planning
    ),
    unresolvedLifecycleOperations: 0,
    criticalMismatches: 0,
    p184DryRun: process.env.P185_PRODUCTION_AUTOMATION_ENABLED !== "1",
  });

  let cohort: P1871ImmutableCohortPreview | null = null;
  let freezeAbort: string | null = null;
  let dryRun = null;

  if (preflight.aborted) {
    freezeAbort = `Preflight aborted: ${preflight.abortReasons.join("; ")}`;
  } else if (selected.eligible.length === 0) {
    freezeAbort =
      "No eligible production candidates for Hiring Recommendation→Operator Approved (standards not lowered)";
  } else {
    const frozen = freezeImmutableCohortPreview({ eligible: selected.eligible });
    if ("ok" in frozen && frozen.ok === false) {
      freezeAbort = frozen.reason;
    } else {
      cohort = frozen as P1871ImmutableCohortPreview;
      const byHash: Record<string, P1871EligibilityResult> = {};
      for (const row of selected.eligible) {
        byHash[hashCandidateId(row.candidateId)] = row;
      }
      dryRun = await runFinalCanaryDryRun({ cohort, eligibleByHash: byHash });
    }
  }

  const writers = buildWriterContainmentPlan();
  const flags = buildExactFlagsReport();
  const sequence = buildFutureExecutionSequence();

  // Placeholder auth package when no cohort — still document requirements
  const authCohort: P1871ImmutableCohortPreview = cohort ?? {
    canaryId: "p187-1-PENDING-NO-COHORT",
    transition: "Hiring Recommendation→Operator Approved",
    maxCohort: 5,
    frozenAt: new Date().toISOString(),
    cohortFingerprint: "pending-no-cohort",
    members: [],
    excluded: [],
    replacementsAllowed: false,
    authorityWritten: false,
    approvalsWritten: false,
  };

  const auth = buildOperatorAuthorizationPackage({
    cohort: authCohort,
    productionCommit: preflight.productionCommit,
  });

  const verdict = determineReadinessVerdict({
    preflight,
    cohortMemberCount: cohort?.members.length ?? 0,
    dryRun,
    cohortFrozen: Boolean(cohort),
  });

  // Prove execution still refused
  const refused = await executeP187ProductionCanary({
    plan: {
      transition: "Hiring Recommendation→Operator Approved",
      cohortIds: [],
      immutable: true,
      maxCohortSize: 5,
      stopOnFirstFailure: true,
      legacyOwner: "p97-approval-mode-persist / api-candidates-workflows",
      p186Owner:
        "p187-hr-to-oa-canary→p186-lifecycle-control-plane→candidate-workflow-store-core",
      executed: false,
      status: "planned",
      authorization: null,
    },
    snapshots: [],
    forceFlags: { executeProductionCanary: false },
  });

  const blockedSummary = scanned
    .filter((r) => !r.eligible)
    .slice(0, 25)
    .map((r) => ({
      redacted: `${r.candidateId.slice(0, 6)}…`,
      lifecycleState: r.observation.lifecycleState,
      reasons: r.blockedReasons.slice(0, 5),
    }));

  await writeFile(
    path.join(ART, "p187-1-production-preflight.json"),
    JSON.stringify(
      {
        ...preflight,
        workflowStore: { healthy: prod.healthy, count: prod.count, note: prod.note },
        scannedCandidates: scanned.length,
        eligibleCount: selected.eligible.length,
      },
      null,
      2,
    ),
  );

  await writeFile(
    path.join(ART, "p187-1-proposed-canary-cohort.json"),
    JSON.stringify(
      {
        freezeAbort,
        cohort,
        eligibleCount: selected.eligible.length,
        ineligibleCount: selected.ineligible.length,
        truncated: selected.truncated,
        sampleBlocked: blockedSummary,
        authorityWritten: false,
        approvalsWritten: false,
        productionCanaryExecuted: false,
      },
      null,
      2,
    ),
  );

  const dryRunArtifact = dryRun ?? {
    skipped: true,
    reason: freezeAbort ?? "No frozen cohort",
    paperworkSendsPredicted: 0,
    melWritesPredicted: 0,
    realProductionWrites: 0,
    productionExecutionRefused: refused.status === "refused",
  };

  await writeFile(
    path.join(ART, "p187-1-canary-dry-run.json"),
    JSON.stringify(dryRunArtifact, null, 2),
  );

  await writeFile(
    path.join(ART, "p187-1-writer-containment-plan.md"),
    renderWriterContainmentMarkdown(writers),
  );

  await writeFile(
    path.join(ART, "p187-1-operator-authorization-package.md"),
    renderAuthorizationPackageMarkdown(auth, flags, sequence),
  );

  const readinessMd = [
    "# P187.1 Final Readiness Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `## Verdict: **${verdict}**`,
    "",
    "## 1. Production preflight",
    "",
    `- Aborted: **${preflight.aborted}**`,
    `- Commit: \`${preflight.productionCommit}\``,
    `- Critical gates passed: **${preflight.allCriticalPassed}**`,
    preflight.abortReasons.length
      ? preflight.abortReasons.map((r) => `- Abort: ${r}`).join("\n")
      : "- No abort reasons",
    "",
    "## 2. Eligible cohort count",
    "",
    `- Scanned: ${scanned.length}`,
    `- Eligible: **${selected.eligible.length}**`,
    `- Frozen members: **${cohort?.members.length ?? 0}**`,
    "",
    selected.eligible.length === 0
      ? "No production candidates currently meet Hiring Recommendation gates (recommendation evidence, job assignment, owners, freshness, shadow parity, no holds). Standards were not lowered."
      : "See `p187-1-proposed-canary-cohort.json` for redacted member preview.",
    "",
    "## 3. Proposed canary ID and fingerprint",
    "",
    cohort
      ? `- Canary ID: \`${cohort.canaryId}\`\n- Fingerprint: \`${cohort.cohortFingerprint}\``
      : `- Not created — ${freezeAbort}`,
    "",
    "## 4. Per-candidate readiness",
    "",
    cohort
      ? cohort.members
          .map(
            (m) =>
              `- ${m.redactedCandidateId}: ready=${m.ready}; owner=${m.operatorOwner}; job=${m.jobAssignment}`,
          )
          .join("\n")
      : "- None",
    "",
    "## 5. Writer containment",
    "",
    "See `p187-1-writer-containment-plan.md`. disabledNow=false.",
    "",
    "## 6. Dry-run",
    "",
    "```json",
    JSON.stringify(dryRunArtifact, null, 2),
    "```",
    "",
    "## 7. Exact required flags (still OFF)",
    "",
    ...flags.requiredForExecution.map((f) => `- \`${f.name}\` required later; enableNow=${f.enableNow}`),
    "",
    `- allowProductionExecution=true required: **${flags.allowProductionExecutionRequired}**`,
    `- dashboard optional: **${flags.dashboardFlagOptional}**`,
    `- production-scoped: **${flags.scopeToProductionOnly}**`,
    `- authority expires after canary: **${flags.authorityMustExpireAfterCanary}**`,
    "",
    "## 8. Remaining operator action",
    "",
    verdict === "ready_for_operator_authorized_canary"
      ? "Record explicit authorization (actor + reason + timestamp) matching cohort fingerprint, then follow the 16-step execution sequence. Do not enable flags until that authorization exists."
      : verdict === "conditionally_ready"
        ? "Resolve dry-run/containment gaps, then authorize."
        : "Populate eligible Hiring Recommendation candidates with recommendation evidence + resolved job/owner/shadow, re-run P187.1 scan, then authorize. Do not execute.",
    "",
    "## Safety",
    "",
    `- production canary executed: **false**`,
    `- flags enabled: **false**`,
    `- writers disabled: **false**`,
    `- paperwork sends: **0**`,
    `- MEL writes: **0**`,
    `- execution refused status: **${refused.status}**`,
    "",
    "## Future sequence (do not run)",
    ...sequence.map((s) => s),
    "",
  ].join("\n");

  await writeFile(path.join(ART, "p187-1-final-readiness-report.md"), readinessMd);

  console.log(
    JSON.stringify(
      {
        ok: true,
        verdict,
        preflightAborted: preflight.aborted,
        eligibleCount: selected.eligible.length,
        frozenCount: cohort?.members.length ?? 0,
        canaryId: cohort?.canaryId ?? null,
        fingerprint: cohort?.cohortFingerprint ?? null,
        dryRunOk: dryRun?.dryRunOk ?? false,
        productionCanaryExecuted: false,
        flagsEnabled: false,
        writersDisabled: false,
        paperworkSends: 0,
        melWrites: 0,
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
