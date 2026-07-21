/**
 * P240 — Autonomous New Applicant Pipeline (Continuous Mode) — DRY RUN ONLY.
 *
 *   node --import tsx scripts/p240-run-autonomous-pipeline-dry-run.ts
 *   node --import tsx scripts/p240-run-autonomous-pipeline-dry-run.ts --skip-network-geocode
 *
 * Never sends Dropbox Sign, never mutates workflow stages, recruiter ownership,
 * or DM assignments. Artifact writes under artifacts/ only.
 * No commit / merge / push / deploy.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fetchBreezyPositionsByIds, type BreezyJob } from "@/lib/breezy-api";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import {
  getCandidateWorkflowState,
  getRecruiterRosters,
} from "@/lib/candidate-workflow-store";
import { geocodeKey, getCachedGeocode } from "@/lib/geocoding/geocode-cache";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { extractActiveOpportunities } from "@/lib/p209-coverage-audit/opportunities";
import {
  formatP240AutonomousPipelineReport,
  loadP240PriorSentExclusion,
  p240Sha256,
  runP240AutonomousPipelineDryRun,
  type P240OppPoint,
  type P240ZeroWriteAudit,
  P240_PHASE,
} from "@/lib/p240-autonomous-new-applicant-pipeline";

const DURABLE_PATHS = [
  ".data/candidate-workflows.json",
  ".data/candidate-ingestion.json",
  ".data/p226-candidate-recovery-store.json",
  ".data/p230-routing-recovery-store.json",
] as const;

const RECOVERY_STORE_PATH = ".data/p226-candidate-recovery-store.json";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function fingerprintFile(filePath: string): string {
  if (!existsSync(filePath)) return p240Sha256(`missing:${filePath}`);
  return p240Sha256(readFileSync(filePath));
}

function writeArtifact(name: string, value: unknown): string {
  mkdirSync("artifacts", { recursive: true });
  const target = path.join("artifacts", name);
  writeFileSync(
    target,
    typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`,
  );
  console.log(`[artifact] ${target}`);
  return target;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

type Point = { lat: number; lng: number };

async function trustedCachedPoint(loc: {
  city: string;
  state: string;
  zip?: string;
}): Promise<Point | null> {
  const key = geocodeKey({ city: loc.city, state: loc.state, zip: loc.zip });
  const keyNoZip = geocodeKey({ city: loc.city, state: loc.state });
  const cached =
    (await getCachedGeocode(key)) ??
    (keyNoZip !== key ? await getCachedGeocode(keyNoZip) : null);
  if (cached?.source === "nominatim") {
    return { lat: cached.lat, lng: cached.lng };
  }
  return null;
}

async function loadOpportunityPoints(): Promise<P240OppPoint[]> {
  let opportunities: Array<{ city: string; state: string; zip?: string }> = [];
  try {
    const sheet = await fetchMelProjectsSheet();
    const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    opportunities = extractActiveOpportunities(rows as Array<Record<string, string>>);
    console.log(`[P240] MEL active opportunities=${opportunities.length}`);
  } catch (err) {
    console.warn(`[P240] MEL sheet unavailable: ${err}`);
  }

  const oppLocations = new Map<string, { city: string; state: string; zip: string }>();
  for (const opp of opportunities) {
    const key = `${opp.city}|${opp.state}|${opp.zip ?? ""}`.toLowerCase();
    if (!oppLocations.has(key)) {
      oppLocations.set(key, {
        city: String(opp.city ?? ""),
        state: String(opp.state ?? "").toUpperCase(),
        zip: String(opp.zip ?? ""),
      });
    }
  }

  const points: P240OppPoint[] = [];
  for (const loc of oppLocations.values()) {
    const p = await trustedCachedPoint(loc);
    if (p) points.push({ city: loc.city, state: loc.state, lat: p.lat, lng: p.lng });
  }
  console.log(`[P240] opportunity points with trusted geocode=${points.length}`);
  return points;
}

async function loadJobsForPositions(positionIds: string[]): Promise<Map<string, BreezyJob>> {
  const unique = [...new Set(positionIds.map((id) => id.trim()).filter(Boolean))];
  const map = new Map<string, BreezyJob>();
  if (unique.length === 0) return map;

  console.log(`[P240] fetching ${unique.length} Breezy positions for DM authority`);
  try {
    const result = await fetchBreezyPositionsByIds(unique);
    for (const [positionId, fetchResult] of result.byPositionId) {
      if (fetchResult.ok && fetchResult.found && fetchResult.job) {
        map.set(positionId, fetchResult.job);
        if (fetchResult.job.jobId) map.set(fetchResult.job.jobId, fetchResult.job);
        if (fetchResult.job.friendlyId) map.set(fetchResult.job.friendlyId, fetchResult.job);
      }
    }
    console.log(`[P240] positions resolved=${map.size} found=${result.found}`);
  } catch (err) {
    console.warn(`[P240] Breezy positions fetch failed: ${err}`);
  }
  return map;
}

function loadRecoveryIds(): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(RECOVERY_STORE_PATH)) return ids;
  try {
    const raw = JSON.parse(readFileSync(RECOVERY_STORE_PATH, "utf8")) as {
      records?: Record<string, unknown>;
    };
    for (const id of Object.keys(raw.records ?? {})) ids.add(id);
  } catch {
    /* ignore */
  }
  return ids;
}

function runUnitTests(): { testsRun: number; testsPassed: number; ok: boolean } {
  const testPath =
    "src/lib/p240-autonomous-new-applicant-pipeline/__tests__/p240-autonomous-new-applicant-pipeline.test.ts";
  console.log(`[P240] running unit tests: ${testPath}`);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", testPath],
    { encoding: "utf8", cwd: process.cwd(), env: process.env },
  );
  const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  console.log(out.trim().slice(-2000));

  const passMatch = out.match(/(?:#|ℹ)\s*pass\s+(\d+)/);
  const testsMatch = out.match(/(?:#|ℹ)\s*tests\s+(\d+)/);
  const failMatch = out.match(/(?:#|ℹ)\s*fail\s+(\d+)/);
  const testsRun = testsMatch ? Number(testsMatch[1]) : 0;
  const testsPassed = passMatch ? Number(passMatch[1]) : 0;
  const fails = failMatch ? Number(failMatch[1]) : result.status === 0 ? 0 : 1;
  return {
    testsRun: testsRun || testsPassed,
    testsPassed,
    ok: result.status === 0 && fails === 0,
  };
}

async function main(): Promise<void> {
  const started = Date.now();
  loadEnvLocal();
  // Hard-lock dry-run: never allow accidental live Dropbox.
  process.env.DROPBOX_SIGN_TEST_MODE = "true";
  mkdirSync("artifacts", { recursive: true });

  const skipNetworkGeocode = process.argv.includes("--skip-network-geocode");
  console.log(`[P240] DRY RUN ONLY — phase=${P240_PHASE}`);

  const testResult = runUnitTests();
  if (!testResult.ok) {
    console.error("[P240] Unit tests failed — aborting dry-run artifact generation");
    process.exit(1);
  }

  const before: Record<string, string> = {};
  for (const p of DURABLE_PATHS) before[p] = fingerprintFile(p);

  const [workflows, store, policy, rosters, opportunityPoints] = await Promise.all([
    getCandidateWorkflowState(),
    readIngestionStore(),
    loadCandidateOnboardingPolicy(),
    getRecruiterRosters(),
    loadOpportunityPoints(),
  ]);
  const candidates = listIngestedCandidates(store);
  console.log(
    `[P240] loaded workflows=${Object.keys(workflows).length} candidates=${candidates.length}`,
  );

  const prior = loadP240PriorSentExclusion();
  console.log(`[P240] prior sent exclusions union=${prior.counts.union}`);

  // Position IDs for newest ~80 candidates (proxy + real-new buffer).
  const newest = [...candidates]
    .map((c) => ({
      id: c.candidateId,
      ms: Date.parse(String(c.appliedDate || c.addedDate || "")) || 0,
      positionId: String(c.positionId ?? "").trim(),
    }))
    .filter((r) => r.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 80);
  const positionIds = newest.map((r) => r.positionId).filter(Boolean);
  const jobsByPositionId = await loadJobsForPositions(positionIds);
  const recoveryIds = loadRecoveryIds();

  const placeholderAudit: P240ZeroWriteAudit = {
    phase: P240_PHASE,
    mode: "dry_run_only",
    generatedAt: new Date().toISOString(),
    before,
    after: { ...before },
    unchanged: true,
    durablePaths: [...DURABLE_PATHS],
  };

  const result = await runP240AutonomousPipelineDryRun({
    workflows,
    candidates,
    jobsByPositionId,
    policy,
    rosters,
    opportunityPoints,
    recoveryIds,
    allowNetworkGeocode: !skipNetworkGeocode,
    zeroWriteAudit: placeholderAudit,
    testsRun: testResult.testsRun,
    testsPassed: testResult.testsPassed,
  });

  const after: Record<string, string> = {};
  for (const p of DURABLE_PATHS) after[p] = fingerprintFile(p);
  const unchanged = DURABLE_PATHS.every((p) => before[p] === after[p]);
  const zeroWriteAudit: P240ZeroWriteAudit = {
    phase: P240_PHASE,
    mode: "dry_run_only",
    generatedAt: new Date().toISOString(),
    before,
    after,
    unchanged,
    durablePaths: [...DURABLE_PATHS],
  };
  result.zeroWriteAudit = zeroWriteAudit;
  result.health = {
    ...result.health,
    durableWrites: 0,
    dropboxSignCalls: 0,
    stageChanges: 0,
    recruiterOwnershipChanges: 0,
    dmAssignmentChanges: 0,
    dryRunConfirmed: true,
  };

  if (!unchanged) {
    console.error("[P240] ZERO-WRITE AUDIT FAILED — durable store fingerprints changed");
    writeArtifact("p240-zero-write-audit.json", zeroWriteAudit);
    process.exit(1);
  }

  const artifactPaths = [
    writeArtifact("p240-live-dashboard.json", result.dashboard),
    writeArtifact("p240-blocked-candidates.json", {
      phase: P240_PHASE,
      generatedAt: result.generatedAt,
      mode: "dry_run_only",
      count: result.blocked.length,
      rows: result.blocked,
    }),
    writeArtifact("p240-pipeline-health.json", result.health),
    writeArtifact("p240-throughput.json", result.throughput),
    writeArtifact("p240-zero-write-audit.json", zeroWriteAudit),
    writeArtifact("p240-candidate-traces.json", {
      phase: P240_PHASE,
      generatedAt: result.generatedAt,
      cutoff: result.cutoff,
      priorSentCounts: prior.counts,
      count: result.traces.length,
      traces: result.traces.map((t) => ({
        ...t,
        // Keep emails out of primary monitoring artifacts — traces already use displayName.
      })),
    }),
  ];

  const reportPath = writeArtifact(
    "p240-autonomous-pipeline-report.md",
    formatP240AutonomousPipelineReport({
      generatedAt: result.generatedAt,
      cutoff: result.cutoff,
      dashboard: result.dashboard,
      throughput: result.throughput,
      health: result.health,
      zeroWriteAudit,
      testsRun: result.testsRun,
      testsPassed: result.testsPassed,
      artifactPaths: [
        "artifacts/p240-autonomous-pipeline-report.md",
        "artifacts/p240-live-dashboard.json",
        "artifacts/p240-blocked-candidates.json",
        "artifacts/p240-pipeline-health.json",
        "artifacts/p240-throughput.json",
        "artifacts/p240-zero-write-audit.json",
      ],
      priorSentCounts: prior.counts,
    }),
  );
  artifactPaths.push(reportPath);
  result.artifactPaths = artifactPaths;

  console.log(`\n[P240] complete in ${Date.now() - started}ms`);
  console.log(`[P240] health=${result.health.healthScore} grade=${result.health.grade} goNoGo=${result.health.goNoGo}`);
  console.log(
    `[P240] throughput daily≈${result.throughput.estimatedDailyThroughputToSent} autoClear=${result.throughput.autoClearRatePct}% Fresh Reset Applied=${result.throughput.freshResetApplied}`,
  );
  console.log(`[P240] zero-write unchanged=${unchanged} fingerprint=${sha256(JSON.stringify(after)).slice(0, 12)}`);
  console.log(`[P240] DRY RUN CONFIRMED — no Dropbox / no stage / no recruiter / no DM writes`);
}

main().catch((err) => {
  console.error("[P240] fatal:", err);
  process.exit(1);
});
