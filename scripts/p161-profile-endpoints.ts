/**
 * P161.1 Phase 1 — Profile slow executive endpoints (read-only).
 *
 * Times each sub-build that composes /api/recruiting/production-readiness and
 * /api/recruiting/app-health so we can rank the most expensive components.
 *
 * Usage: npx tsx scripts/p161-profile-endpoints.ts
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    // ignore
  }
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<{ label: string; ms: number }> {
  const start = performance.now();
  try {
    await fn();
  } catch (error) {
    const ms = performance.now() - start;
    console.log(`  ${label}: ERROR after ${ms.toFixed(0)}ms — ${(error as Error).message?.slice(0, 80)}`);
    return { label, ms };
  }
  const ms = performance.now() - start;
  return { label, ms };
}

async function main() {
  loadEnvLocal();

  const { buildP160ProductionReadiness } = await import("@/lib/p160-production-readiness");
  const { buildP159OperationsControlCenter } = await import("@/lib/p159-operations-control-center");
  const { buildP160Infrastructure } = await import(
    "@/lib/p160-production-readiness/build-infrastructure"
  );
  const { buildP160Integrations } = await import(
    "@/lib/p160-production-readiness/build-integrations"
  );
  const { buildP160AutomationReadiness } = await import(
    "@/lib/p160-production-readiness/build-automation-readiness"
  );
  const { buildP160DeploymentChecklist } = await import(
    "@/lib/p160-production-readiness/build-deployment-checklist"
  );
  const { loadPrioritizationCohort } = await import(
    "@/lib/p156-candidate-prioritization/load-prioritization-cohort"
  );
  const { loadDecisionCohort } = await import(
    "@/lib/p157-recruiter-decision-engine/load-decision-cohort"
  );
  const { buildAssignmentDashboard } = await import(
    "@/lib/p158-autonomous-recruiter-assignment"
  );
  const { buildP155OperationsDashboard } = await import(
    "@/lib/p155-autopilot-operations-dashboard"
  );
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { readIngestionStore } = await import("@/lib/candidate-ingestion/ingestion-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");

  const rows: { label: string; ms: number }[] = [];

  console.log("=== Leaf loaders (cold) ===");
  rows.push(await time("readIngestionStore", async () => void (await readIngestionStore())));
  rows.push(await time("getCandidateWorkflowBundle", async () => void (await getCandidateWorkflowBundle())));
  rows.push(await time("fetchBreezyJobs(published)", async () => void (await fetchBreezyJobs("published"))));

  console.log("=== Cohort + dashboards ===");
  rows.push(await time("loadPrioritizationCohort (P156)", async () => void (await loadPrioritizationCohort())));
  rows.push(await time("loadDecisionCohort (P157)", async () => void (await loadDecisionCohort())));
  rows.push(await time("buildAssignmentDashboard (P158)", async () => void (await buildAssignmentDashboard())));
  rows.push(await time("buildP155OperationsDashboard", async () => void (await buildP155OperationsDashboard())));

  console.log("=== P160 sub-sections ===");
  rows.push(await time("buildP160Infrastructure", async () => void (await buildP160Infrastructure())));
  rows.push(await time("buildP160Integrations", async () => void (await buildP160Integrations())));
  rows.push(await time("buildP160AutomationReadiness", async () => void (await buildP160AutomationReadiness())));
  rows.push(await time("buildP160DeploymentChecklist", async () => void (await buildP160DeploymentChecklist())));

  console.log("=== Full endpoint builds ===");
  rows.push(await time("buildP159OperationsControlCenter (full)", async () => void (await buildP159OperationsControlCenter())));
  rows.push(await time("buildP160ProductionReadiness (full)", async () => void (await buildP160ProductionReadiness())));

  rows.sort((a, b) => b.ms - a.ms);
  console.log("\n=== Ranked (most expensive first) ===");
  for (const r of rows) {
    console.log(`${r.ms.toFixed(0).padStart(7)}ms  ${r.label}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
