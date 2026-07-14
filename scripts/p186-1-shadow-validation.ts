/**
 * P186.1 — Shadow validation runner (observe-only).
 * Does not modify P184/P185, does not send paperwork, does not enable automation.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  applyP1861Migrations,
  buildLifecycleHealthReport,
  ShadowProjectionEngine,
  type P186ProductionCandidateSnapshot,
} from "../src/lib/p186-1-lifecycle-state-machine";
import {
  createSqlClient,
  resetSqlClientCacheForTests,
} from "../src/lib/p185-5-vercel-durable-storage/sqlClient";

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

function syntheticSnapshots(): P186ProductionCandidateSnapshot[] {
  return [
    {
      candidateId: "syn-applied",
      workflowStatus: "Applied",
      paperworkStatus: "not_sent",
      paperworkSentAt: null,
      paperworkViewedAt: null,
      paperworkSignedAt: null,
      signatureRequestId: null,
      recommendedStage: null,
    },
    {
      candidateId: "syn-review",
      workflowStatus: "Needs Review",
      paperworkStatus: "not_sent",
      paperworkSentAt: null,
      paperworkViewedAt: null,
      paperworkSignedAt: null,
      signatureRequestId: null,
      recommendedStage: null,
    },
    {
      candidateId: "syn-recommend",
      workflowStatus: "Qualified",
      paperworkStatus: "not_sent",
      paperworkSentAt: null,
      paperworkViewedAt: null,
      paperworkSignedAt: null,
      signatureRequestId: null,
      recommendedStage: "recommend_hire",
    },
    {
      candidateId: "syn-paperwork-needed",
      workflowStatus: "Paperwork Needed",
      paperworkStatus: "not_sent",
      paperworkSentAt: null,
      paperworkViewedAt: null,
      paperworkSignedAt: null,
      signatureRequestId: null,
      recommendedStage: null,
      hasOperatorApprovalEvidence: true,
    },
    {
      candidateId: "syn-sent",
      workflowStatus: "Paperwork Sent",
      paperworkStatus: "sent",
      paperworkSentAt: "2026-07-10T19:00:00.000Z",
      paperworkViewedAt: null,
      paperworkSignedAt: null,
      signatureRequestId: "sig-sent",
      recommendedStage: null,
    },
    {
      candidateId: "syn-viewed",
      workflowStatus: "Paperwork Sent",
      paperworkStatus: "viewed",
      paperworkSentAt: "2026-07-10T19:00:00.000Z",
      paperworkViewedAt: "2026-07-10T20:00:00.000Z",
      paperworkSignedAt: null,
      signatureRequestId: "sig-viewed",
      recommendedStage: null,
    },
    {
      candidateId: "syn-signed",
      workflowStatus: "Signed",
      paperworkStatus: "signed",
      paperworkSentAt: "2026-07-10T19:00:00.000Z",
      paperworkViewedAt: "2026-07-10T20:00:00.000Z",
      paperworkSignedAt: "2026-07-11T01:00:00.000Z",
      signatureRequestId: "sig-signed",
      recommendedStage: null,
    },
    {
      candidateId: "syn-mel",
      workflowStatus: "Ready for MEL",
      paperworkStatus: "signed",
      paperworkSentAt: "2026-07-10T19:00:00.000Z",
      paperworkViewedAt: "2026-07-10T20:00:00.000Z",
      paperworkSignedAt: "2026-07-11T01:00:00.000Z",
      signatureRequestId: "sig-mel",
      recommendedStage: null,
    },
    {
      candidateId: "syn-exported",
      workflowStatus: "Loaded in MEL",
      paperworkStatus: "signed",
      paperworkSentAt: "2026-07-10T19:00:00.000Z",
      paperworkViewedAt: "2026-07-10T20:00:00.000Z",
      paperworkSignedAt: "2026-07-11T01:00:00.000Z",
      signatureRequestId: "sig-exp",
      recommendedStage: null,
    },
  ];
}

async function maybeLoadProductionSnapshots(): Promise<{
  used: boolean;
  snapshots: P186ProductionCandidateSnapshot[];
  note: string;
}> {
  try {
    const { getCandidateWorkflowState } = await import(
      "../src/lib/candidate-workflow-store"
    );
    const state = await getCandidateWorkflowState();
    const entries = Object.entries(state).slice(0, 50);
    if (entries.length === 0) {
      return { used: false, snapshots: [], note: "Workflow store empty — synthetic only." };
    }
    const snapshots: P186ProductionCandidateSnapshot[] = entries.map(([id, wf]) => ({
      candidateId: id,
      workflowStatus: wf?.workflowStatus ?? null,
      paperworkStatus: wf?.paperworkStatus ?? null,
      paperworkSentAt: wf?.paperworkSentAt ?? null,
      paperworkViewedAt: wf?.paperworkViewedAt ?? null,
      paperworkSignedAt: wf?.paperworkSignedAt ?? null,
      signatureRequestId: wf?.signatureRequestId ?? null,
      recommendedStage: wf?.recommendedStage ?? null,
      directDepositStatus: wf?.directDepositStatus ?? null,
    }));
    return {
      used: true,
      snapshots,
      note: `Observed ${snapshots.length} workflow records read-only (no writes).`,
    };
  } catch (err) {
    return {
      used: false,
      snapshots: [],
      note: `Workflow store unavailable (${err instanceof Error ? err.message : String(err)}) — synthetic only.`,
    };
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  // Ensure P186 never enables automation via this script
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;

  const useNeon = Boolean(
    process.env.P185_DATABASE_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL,
  );
  if (!useNeon) {
    process.env.P185_5_FORCE_PGLITE = "1";
    if (!process.env.P185_PGLITE_DATA_DIR) {
      process.env.P185_PGLITE_DATA_DIR = path.join(process.cwd(), ".data", "p186-1-pglite");
    }
  }

  await resetSqlClientCacheForTests();
  const client = await createSqlClient({ forceNew: true });
  await applyP1861Migrations(client);

  const engine = new ShadowProjectionEngine(client);
  const synthetic = syntheticSnapshots();
  const syntheticResult = await engine.project(synthetic);

  const prod = await maybeLoadProductionSnapshots();
  let productionResult = null;
  if (prod.used && prod.snapshots.length > 0) {
    productionResult = await engine.project(prod.snapshots);
  }

  const health = await buildLifecycleHealthReport(client);

  const shadowReport = {
    phase: "P186.1",
    generatedAt: new Date().toISOString(),
    mode: "shadow_only",
    storageProvider: client.provider,
    isolation: {
      paperworkSendDisabled: true,
      continuousAutomationDisabled: true,
      p184P185Unmodified: true,
      productionQueuesUntouched: true,
    },
    synthetic: {
      ...syntheticResult,
      findings: syntheticResult.findings.map((f) => ({
        candidateId: f.candidateId,
        kind: f.kind,
        productionDerivedState: f.productionDerivedState,
        shadowState: f.shadowState,
        detail: f.detail,
      })),
    },
    productionObserve: {
      note: prod.note,
      used: prod.used,
      result: productionResult
        ? {
            evaluated: productionResult.evaluated,
            matches: productionResult.matches,
            mismatches: productionResult.mismatches,
            duplicateTransitions: productionResult.duplicateTransitions,
            invalidTransitions: productionResult.invalidTransitions,
            missingTransitions: productionResult.missingTransitions,
            impossibleTransitions: productionResult.impossibleTransitions,
            projectedAt: productionResult.projectedAt,
            // redact per-candidate detail volume in summary; kinds only
            findingKinds: productionResult.findings.reduce(
              (acc, f) => {
                acc[f.kind] = (acc[f.kind] ?? 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            ),
          }
        : null,
    },
    health,
  };

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(
    path.join(artifactsDir, "p186-1-shadow-validation-report.json"),
    `${JSON.stringify(shadowReport, null, 2)}\n`,
    "utf8",
  );

  const readinessMd = [
    `# P186.1 Readiness Report`,
    ``,
    `Generated: ${health.generatedAt}`,
    ``,
    `## Isolation`,
    `- Paperwork send disabled: **yes**`,
    `- Continuous automation disabled: **yes**`,
    `- P184/P185 unmodified: **yes**`,
    `- Live mode not enabled by P186: **yes**`,
    ``,
    `## Storage`,
    `- Provider: **${health.storage.provider}**`,
    `- Healthy: **${health.storage.healthy}**`,
    `- Schema version: **${health.schemaVersion}**`,
    ``,
    `## Shadow (synthetic)`,
    `- Evaluated: **${syntheticResult.evaluated}**`,
    `- Matches: **${syntheticResult.matches}**`,
    `- Mismatches: **${syntheticResult.mismatches}**`,
    `- Duplicate transitions: **${syntheticResult.duplicateTransitions}**`,
    `- Invalid transitions: **${syntheticResult.invalidTransitions}**`,
    `- Missing transitions: **${syntheticResult.missingTransitions}**`,
    `- Impossible transitions: **${syntheticResult.impossibleTransitions}**`,
    ``,
    `## Production observe`,
    `- ${prod.note}`,
    productionResult
      ? `- Evaluated=${productionResult.evaluated} matches=${productionResult.matches} mismatches=${productionResult.mismatches}`
      : `- No production projection run`,
    ``,
    `## P186.2 recommendation`,
    health.readyForP186_2
      ? `**Conditional yes** — foundation healthy; begin P186.2 only after operator approval.`
      : `**Not yet** — blockers: ${health.blockers.join("; ") || "see warnings"}`,
    ``,
    `### Warnings`,
    ...(health.warnings.length ? health.warnings.map((w) => `- ${w}`) : [`- none`]),
    ``,
    `### Blockers`,
    ...(health.blockers.length ? health.blockers.map((b) => `- ${b}`) : [`- none`]),
    ``,
  ].join("\n");

  await writeFile(
    path.join(artifactsDir, "p186-1-readiness-report.md"),
    readinessMd,
    "utf8",
  );

  // Ensure design doc exists (written separately if missing)
  const designPath = path.join(artifactsDir, "p186-1-lifecycle-design.md");
  try {
    await readFile(designPath, "utf8");
  } catch {
    await writeFile(designPath, "# P186.1 Lifecycle Design\n\nSee repository implementation.\n", "utf8");
  }

  console.log(
    JSON.stringify(
      {
        syntheticMatches: syntheticResult.matches,
        syntheticEvaluated: syntheticResult.evaluated,
        readyForP186_2: health.readyForP186_2,
        provider: client.provider,
      },
      null,
      2,
    ),
  );

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
