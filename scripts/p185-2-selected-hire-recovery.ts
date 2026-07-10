/**
 * P185.2 — Selected-hire recovery + P184 dry-run queue population.
 * Does not enable live sending.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatP1852Markdown,
  runP1852SelectedHireRecovery,
} from "../src/lib/p185-2-selected-hire-recovery";

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

async function main(): Promise<void> {
  loadEnvLocal();
  const result = await runP1852SelectedHireRecovery({
    beforeEligible: 0,
    beforeQueueDepth: 0,
    forceDurableLocal: true,
  });

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });

  await writeFile(
    path.join(artifactsDir, "p185-2-selected-hire-recovery.json"),
    `${JSON.stringify(result.report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(artifactsDir, "p185-2-selected-hire-recovery.md"),
    formatP1852Markdown(result.report),
    "utf8",
  );
  await writeFile(
    path.join(artifactsDir, "p185-2-paperwork-backlog-projection.json"),
    `${JSON.stringify(result.report.projection, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(artifactsDir, "p185-2-selection-evidence-summary.json"),
    `${JSON.stringify(
      {
        generatedAt: result.report.generatedAt,
        sources: result.report.evidenceSourcesInspected,
        counts: {
          authoritativeCandidates: result.evidenceSummary.authoritativeCandidateIds.length,
          p181: result.evidenceSummary.p181.length,
          p83Executed: result.evidenceSummary.p83Executed.length,
          p97: result.evidenceSummary.p97.length,
          p158: result.evidenceSummary.p158.length,
        },
        authoritativeCandidateIds: result.evidenceSummary.authoritativeCandidateIds,
        classifications: result.report.classifications,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(artifactsDir, "p185-2-template-readiness.json"),
    `${JSON.stringify(
      {
        generatedAt: result.report.generatedAt,
        ready: result.templates.filter((t) => t.templateReady).length,
        blocked: result.templates.filter((t) => !t.templateReady).length,
        // no real template IDs — keys only
        byMethod: result.templates.reduce(
          (acc, t) => {
            acc[t.resolutionMethod] = (acc[t.resolutionMethod] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
        blockedCandidateIds: result.templates
          .filter((t) => !t.templateReady)
          .map((t) => t.candidateId)
          .slice(0, 50),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const dataDir = process.env.SRS_RECRUITING_DATA_DIR || path.join(process.cwd(), ".data");
  await mkdir(dataDir, { recursive: true });
  const byBucket: Record<string, typeof result.operatorReview> = {
    A_verified_ready: [],
    B_template_blocked: [],
    C_unresolved_job: [],
    D_likely_selected: [],
    E_conflicting_or_withdrawn: [],
    F_active_packet: [],
    G_completed: [],
    H_applied_not_selected: [],
    I_hired_exception: [],
  };
  for (const row of result.operatorReview) {
    const key =
      row.bucket === "A"
        ? "A_verified_ready"
        : row.bucket === "B"
          ? "B_template_blocked"
          : row.bucket === "C"
            ? "C_unresolved_job"
            : row.bucket === "D"
              ? "D_likely_selected"
              : row.bucket === "E"
                ? "E_conflicting_or_withdrawn"
                : row.bucket === "I"
                  ? "I_hired_exception"
                  : "H_applied_not_selected";
    byBucket[key]!.push(row);
  }
  // Also dump F/G/H counts without full PII lists in operator file for A-E,I only (already filtered)
  await writeFile(
    path.join(dataDir, "p185-2-selected-hire-operator-review-local.json"),
    `${JSON.stringify(
      {
        generatedAt: result.report.generatedAt,
        byBucket,
        classificationCounts: result.report.classifications,
        normalizations: result.normalizations,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        liveReady: result.report.liveReady,
        counts: result.report.counts,
        comparison: result.report.comparison,
        projection: result.report.projection,
        classifications: result.report.classifications,
        liveBlockers: result.report.liveBlockers,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
