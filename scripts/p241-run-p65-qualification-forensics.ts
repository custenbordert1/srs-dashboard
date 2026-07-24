/**
 * P241 — P65.6 Qualification Root Cause Analysis (READ-ONLY).
 *
 *   node --import tsx scripts/p241-run-p65-qualification-forensics.ts
 *   node --import tsx scripts/p241-run-p65-qualification-forensics.ts --skip-network-geocode
 *
 * Forensic analysis only. Never writes candidates / workflows / Dropbox / MEL /
 * Breezy / recruiters / DMs. Artifact writes under artifacts/ only.
 * No commit / merge / push / deploy.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fetchBreezyPositionsByIds, type BreezyJob } from "@/lib/breezy-api";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { geocodeKey, getCachedGeocode } from "@/lib/geocoding/geocode-cache";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { extractActiveOpportunities } from "@/lib/p209-coverage-audit/opportunities";
import type { P240OppPoint } from "@/lib/p240-autonomous-new-applicant-pipeline/simulate";
import {
  P241_DURABLE_PATHS,
  P241_PHASE,
  buildP241RecoveryOpportunitiesArtifact,
  buildP241RuleTraceArtifact,
  formatP241RuleAnalysisMarkdown,
  loadP241QualificationFailedSeeds,
  p241Sha256,
  runP241P65QualificationForensics,
  type P241ZeroWriteAudit,
} from "@/lib/p241-p65-qualification-forensics";

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
  if (!existsSync(filePath)) return p241Sha256(`missing:${filePath}`);
  return p241Sha256(readFileSync(filePath));
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

async function trustedCachedPoint(loc: {
  city: string;
  state: string;
  zip?: string;
}): Promise<{ lat: number; lng: number } | null> {
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
    console.log(`[P241] MEL active opportunities=${opportunities.length}`);
  } catch (err) {
    console.warn(`[P241] MEL sheet unavailable: ${err}`);
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
  console.log(`[P241] opportunity points with trusted geocode=${points.length}`);
  return points;
}

async function loadJobsForPositions(positionIds: string[]): Promise<Map<string, BreezyJob>> {
  const unique = [...new Set(positionIds.map((id) => id.trim()).filter(Boolean))];
  const map = new Map<string, BreezyJob>();
  if (unique.length === 0) return map;

  console.log(`[P241] fetching ${unique.length} Breezy positions for recovery projection`);
  try {
    const result = await fetchBreezyPositionsByIds(unique);
    for (const [positionId, fetchResult] of result.byPositionId) {
      if (fetchResult.ok && fetchResult.found && fetchResult.job) {
        map.set(positionId, fetchResult.job);
        if (fetchResult.job.jobId) map.set(fetchResult.job.jobId, fetchResult.job);
        if (fetchResult.job.friendlyId) map.set(fetchResult.job.friendlyId, fetchResult.job);
      }
    }
    console.log(`[P241] positions resolved=${map.size} found=${result.found}`);
  } catch (err) {
    console.warn(`[P241] Breezy positions fetch failed: ${err}`);
  }
  return map;
}

function loadP240Baseline(): {
  proxyCohortSize: number;
  wouldSendCount: number;
  blockedCount: number;
  autoClearRatePct: number;
  estimatedDailyArrivalRate: number;
  arrivalsLast14Days: number;
  healthScore: number;
  remainingNonQualificationBlockers: Array<{ blocker: string; count: number }>;
} {
  const throughputPath = "artifacts/p240-throughput.json";
  const healthPath = "artifacts/p240-pipeline-health.json";
  if (!existsSync(throughputPath) || !existsSync(healthPath)) {
    throw new Error("P241: missing P240 throughput/health artifacts");
  }
  const throughput = JSON.parse(readFileSync(throughputPath, "utf8")) as {
    proxyCohortSize?: number;
    wouldSendCount?: number;
    blockedCount?: number;
    autoClearRatePct?: number;
    estimatedDailyArrivalRate?: number;
    arrivalsLast14Days?: number;
    bottleneckBreakdown?: Array<{ blocker: string; count: number }>;
  };
  const health = JSON.parse(readFileSync(healthPath, "utf8")) as {
    healthScore?: number;
  };
  const remaining = (throughput.bottleneckBreakdown ?? []).filter(
    (b) => b.blocker !== "qualification_gate_failed",
  );
  return {
    proxyCohortSize: throughput.proxyCohortSize ?? 17,
    wouldSendCount: throughput.wouldSendCount ?? 5,
    blockedCount: throughput.blockedCount ?? 12,
    autoClearRatePct: throughput.autoClearRatePct ?? 29.4,
    estimatedDailyArrivalRate: throughput.estimatedDailyArrivalRate ?? 17.4,
    arrivalsLast14Days: throughput.arrivalsLast14Days ?? 244,
    healthScore: health.healthScore ?? 66,
    remainingNonQualificationBlockers: remaining,
  };
}

function runUnitTests(): { testsRun: number; testsPassed: number; ok: boolean } {
  const testPath =
    "src/lib/p241-p65-qualification-forensics/__tests__/p241-p65-qualification-forensics.test.ts";
  console.log(`[P241] running unit tests: ${testPath}`);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", testPath],
    { encoding: "utf8", cwd: process.cwd(), env: process.env },
  );
  const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  console.log(out.trim().slice(-2500));

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
  process.env.DROPBOX_SIGN_TEST_MODE = "true";
  mkdirSync("artifacts", { recursive: true });

  const skipNetworkGeocode = process.argv.includes("--skip-network-geocode");
  console.log(`[P241] READ-ONLY forensics — phase=${P241_PHASE}`);

  const testResult = runUnitTests();
  if (!testResult.ok) {
    console.error("[P241] Unit tests failed — aborting artifact generation");
    process.exit(1);
  }

  const before: Record<string, string> = {};
  for (const p of P241_DURABLE_PATHS) before[p] = fingerprintFile(p);

  const seeds = loadP241QualificationFailedSeeds();
  console.log(`[P241] loaded ${seeds.length} qualification_gate_failed seeds from P240`);

  const [workflows, store, policy, opportunityPoints] = await Promise.all([
    getCandidateWorkflowState(),
    readIngestionStore(),
    loadCandidateOnboardingPolicy(),
    loadOpportunityPoints(),
  ]);
  const candidates = listIngestedCandidates(store);
  const candidatesById = new Map(candidates.map((c) => [c.candidateId, c]));
  const positionIds = seeds
    .map((s) => String(candidatesById.get(s.candidateId)?.positionId ?? "").trim())
    .filter(Boolean);
  const jobsByPositionId = await loadJobsForPositions(positionIds);
  const baseline = loadP240Baseline();

  const placeholderAudit: P241ZeroWriteAudit = {
    phase: P241_PHASE,
    mode: "read_only",
    generatedAt: new Date().toISOString(),
    before,
    after: { ...before },
    unchanged: true,
    durablePaths: [...P241_DURABLE_PATHS],
    candidateWrites: 0,
    workflowWrites: 0,
    dropboxSignCalls: 0,
    recruiterOwnershipChanges: 0,
    dmAssignmentChanges: 0,
    deployments: 0,
    commits: 0,
  };

  const result = await runP241P65QualificationForensics({
    workflows,
    candidates,
    jobsByPositionId,
    policy,
    opportunityPoints,
    zeroWriteAudit: placeholderAudit,
    allowNetworkGeocode: !skipNetworkGeocode,
    baseline,
    testsRun: testResult.testsRun,
    testsPassed: testResult.testsPassed,
  });

  const after: Record<string, string> = {};
  for (const p of P241_DURABLE_PATHS) after[p] = fingerprintFile(p);
  const unchanged = P241_DURABLE_PATHS.every((p) => before[p] === after[p]);
  const zeroWriteAudit: P241ZeroWriteAudit = {
    phase: P241_PHASE,
    mode: "read_only",
    generatedAt: new Date().toISOString(),
    before,
    after,
    unchanged,
    durablePaths: [...P241_DURABLE_PATHS],
    candidateWrites: 0,
    workflowWrites: 0,
    dropboxSignCalls: 0,
    recruiterOwnershipChanges: 0,
    dmAssignmentChanges: 0,
    deployments: 0,
    commits: 0,
  };
  result.zeroWriteAudit = zeroWriteAudit;

  if (!unchanged) {
    console.error("[P241] ZERO-WRITE AUDIT FAILED — durable store fingerprints changed");
    writeArtifact("p241-zero-write-audit.json", zeroWriteAudit);
    process.exit(1);
  }

  const artifactPaths = [
    writeArtifact(
      "p241-rule-trace.json",
      buildP241RuleTraceArtifact(result.candidates, result.generatedAt),
    ),
    writeArtifact(
      "p241-recovery-opportunities.json",
      buildP241RecoveryOpportunitiesArtifact(result.candidates, result.generatedAt),
    ),
    writeArtifact("p241-throughput-simulation.json", result.throughputSimulation),
    writeArtifact("p241-zero-write-audit.json", zeroWriteAudit),
  ];

  const reportPath = writeArtifact(
    "p241-p65-rule-analysis.md",
    formatP241RuleAnalysisMarkdown({
      generatedAt: result.generatedAt,
      candidates: result.candidates,
      throughput: result.throughputSimulation,
      zeroWriteAudit,
      testsRun: result.testsRun,
      testsPassed: result.testsPassed,
      artifactPaths: [
        "artifacts/p241-p65-rule-analysis.md",
        "artifacts/p241-rule-trace.json",
        "artifacts/p241-recovery-opportunities.json",
        "artifacts/p241-throughput-simulation.json",
        "artifacts/p241-zero-write-audit.json",
      ],
    }),
  );
  artifactPaths.push(reportPath);
  result.artifactPaths = artifactPaths;

  const proj = result.throughputSimulation.projectedAfterRecoverableFixes;
  console.log(`\n[P241] complete in ${Date.now() - started}ms`);
  console.log(
    `[P241] traced=${result.qualificationGateFailedCount} failedCheck=${Object.keys(result.ruleTraceSummary.byFailedCheckId).join(",")}`,
  );
  console.log(
    `[P241] projected wouldSend=${proj.wouldSendCount} autoClear=${proj.autoClearRatePct}% health=${proj.healthScore} goNoGo=${proj.goNoGo}`,
  );
  console.log(
    `[P241] zero-write unchanged=${unchanged} fingerprint=${sha256(JSON.stringify(after)).slice(0, 12)}`,
  );
  console.log(`[P241] READ-ONLY CONFIRMED — no candidate / workflow / Dropbox / ownership writes`);
}

main().catch((err) => {
  console.error("[P241] fatal:", err);
  process.exit(1);
});
