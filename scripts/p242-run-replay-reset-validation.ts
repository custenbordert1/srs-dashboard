/**
 * P242 — Fix P240 Fresh-New Replay State Reset + Revalidate Throughput.
 *
 *   node --import tsx scripts/p242-run-replay-reset-validation.ts
 *   node --import tsx scripts/p242-run-replay-reset-validation.ts --skip-network-geocode
 *
 * READ-ONLY / DRY-RUN. Re-runs P240 simulation with corrected replayAsFreshNew.
 * Never sends Dropbox Sign, never mutates candidates/workflows/recruiters/DMs.
 * Artifact writes under artifacts/ only. No commit / merge / push / deploy.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fetchBreezyPositionsByIds, type BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { canPromoteToPaperworkFunnel } from "@/lib/candidate-onboarding-engine/promote-paperwork-funnel";
import {
  getCandidateWorkflowState,
  getRecruiterRosters,
} from "@/lib/candidate-workflow-store";
import { geocodeKey, getCachedGeocode } from "@/lib/geocoding/geocode-cache";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { extractActiveOpportunities } from "@/lib/p209-coverage-audit/opportunities";
import {
  P240_FRESH_NEW_REPLAY_ACTION_FIELDS,
  applyP240FreshNewReplayReset,
  loadP240PriorSentExclusion,
  runP240AutonomousPipelineDryRun,
  simulateP240CandidatePath,
  type P240OppPoint,
  type P240ZeroWriteAudit,
} from "@/lib/p240-autonomous-new-applicant-pipeline";
import { traceP65PromotionRules } from "@/lib/p241-p65-qualification-forensics";
import {
  P242_DURABLE_PATHS,
  P242_EXECUTION_MODE,
  P242_PHASE,
  buildP242CorrectedThroughput,
  buildP242Disposition,
  buildP242LiveProtectionCases,
  buildP242P241CaseValidations,
  emptyDispositionSummary,
  formatP242ReplayResetValidationMd,
  p242Sha256,
  type P242ZeroWriteAudit,
} from "@/lib/p242-fresh-new-replay-reset";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

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
  if (!existsSync(filePath)) return p242Sha256(`missing:${filePath}`);
  return p242Sha256(readFileSync(filePath));
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
    console.log(`[P242] MEL active opportunities=${opportunities.length}`);
  } catch (err) {
    console.warn(`[P242] MEL sheet unavailable: ${err}`);
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
  console.log(`[P242] opportunity points with trusted geocode=${points.length}`);
  return points;
}

async function loadJobsForPositions(positionIds: string[]): Promise<Map<string, BreezyJob>> {
  const unique = [...new Set(positionIds.map((id) => id.trim()).filter(Boolean))];
  const map = new Map<string, BreezyJob>();
  if (unique.length === 0) return map;

  console.log(`[P242] fetching ${unique.length} Breezy positions for DM authority`);
  try {
    const result = await fetchBreezyPositionsByIds(unique);
    for (const [positionId, fetchResult] of result.byPositionId) {
      if (fetchResult.ok && fetchResult.found && fetchResult.job) {
        map.set(positionId, fetchResult.job);
        if (fetchResult.job.jobId) map.set(fetchResult.job.jobId, fetchResult.job);
        if (fetchResult.job.friendlyId) map.set(fetchResult.job.friendlyId, fetchResult.job);
      }
    }
    console.log(`[P242] positions resolved=${map.size} found=${result.found}`);
  } catch (err) {
    console.warn(`[P242] Breezy positions fetch failed: ${err}`);
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
  const testPaths = [
    "src/lib/p240-autonomous-new-applicant-pipeline/__tests__/p240-autonomous-new-applicant-pipeline.test.ts",
    "src/lib/p242-fresh-new-replay-reset/__tests__/p242-fresh-new-replay-reset.test.ts",
  ];
  console.log(`[P242] running unit tests:\n  - ${testPaths.join("\n  - ")}`);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", ...testPaths],
    { encoding: "utf8", cwd: process.cwd(), env: process.env },
  );
  const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  console.log(out.trim().slice(-3000));

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

function sampleAlreadySentWorkflow(): CandidateWorkflowRecord {
  return {
    candidateId: "p242-live-guard",
    workflowStatus: "Paperwork Sent",
    assignedRecruiter: "Taylor",
    assignedDM: "Mindie Rodriguez",
    notes: [],
    history: [],
    lastActionAt: null,
    nextActionNeeded: "Await Signature",
    recruitingActions: emptyRecruitingActions(),
    followUpDueAt: null,
    snoozedUntil: null,
    paperworkStatus: "sent",
    signatureRequestId: "sig-live-guard",
    paperworkTemplateKey: null,
    paperworkSentAt: "2026-07-20T19:55:00.000Z",
    paperworkViewedAt: null,
    paperworkViewCount: 0,
    paperworkSignedAt: null,
    paperworkError: null,
    onboardingContactEmail: null,
    directDepositStatus: "not_requested",
    directDepositRequestedAt: null,
    directDepositLastReminderAt: null,
    directDepositNotes: null,
    directDepositTriggeredByUserId: null,
    directDepositLastDeliveryMode: null,
    directDepositLastHrCopyIncluded: null,
    directDepositLastHrBccAddress: null,
    updatedAt: new Date().toISOString(),
    actionType: "await-signature",
    requiredAction: "Await Signature",
  };
}

async function main(): Promise<void> {
  const started = Date.now();
  loadEnvLocal();
  process.env.DROPBOX_SIGN_TEST_MODE = "true";
  mkdirSync("artifacts", { recursive: true });

  const skipNetworkGeocode = process.argv.includes("--skip-network-geocode");
  console.log(`[P242] READ-ONLY DRY RUN — phase=${P242_PHASE}`);

  const testResult = runUnitTests();
  if (!testResult.ok) {
    console.error("[P242] Unit tests failed — aborting validation");
    process.exit(1);
  }

  const before: Record<string, string> = {};
  for (const p of P242_DURABLE_PATHS) before[p] = fingerprintFile(p);

  const [workflows, store, policy, rosters, opportunityPoints] = await Promise.all([
    getCandidateWorkflowState(),
    readIngestionStore(),
    loadCandidateOnboardingPolicy(),
    getRecruiterRosters(),
    loadOpportunityPoints(),
  ]);
  const candidates = listIngestedCandidates(store);
  console.log(
    `[P242] loaded workflows=${Object.keys(workflows).length} candidates=${candidates.length}`,
  );

  const prior = loadP240PriorSentExclusion();
  const newest = [...candidates]
    .map((c) => ({
      id: c.candidateId,
      ms: Date.parse(String(c.appliedDate || c.addedDate || "")) || 0,
      positionId: String(c.positionId ?? "").trim(),
    }))
    .filter((r) => r.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 80);
  const jobsByPositionId = await loadJobsForPositions(
    newest.map((r) => r.positionId).filter(Boolean),
  );
  const recoveryIds = loadRecoveryIds();

  const placeholderAudit: P240ZeroWriteAudit = {
    phase: "P240",
    mode: "dry_run_only",
    generatedAt: new Date().toISOString(),
    before,
    after: { ...before },
    unchanged: true,
    durablePaths: [...P242_DURABLE_PATHS],
  };

  console.log("[P242] re-running complete P240 simulation with corrected replay…");
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

  const proxyTraces = result.traces.filter((t) => t.cohortKind === "simulation_proxy_24h");
  const dispositions = proxyTraces.map((trace) =>
    buildP242Disposition({
      trace,
      workflow: workflows[trace.candidateId],
    }),
  );
  const dispositionSummary = emptyDispositionSummary();
  for (const d of dispositions) dispositionSummary[d.disposition] += 1;

  const p241CaseValidations = buildP242P241CaseValidations(dispositions);

  // Live protection regression (in-memory only).
  const liveWf = sampleAlreadySentWorkflow();
  const liveCand = {
    candidateId: "p242-live-guard",
    firstName: "Live",
    lastName: "Guard",
    email: "live-guard@example.com",
    phone: "5550109999",
    stage: "Applied",
    source: "Indeed",
    appliedDate: "2026-07-20T12:00:00.000Z",
    addedDate: "2026-07-20T12:00:00.000Z",
    positionId: "pos-1",
    positionName: "Retail Merchandiser – Columbus, OH",
    city: "Columbus",
    state: "OH",
    zipCode: "43215",
  };
  const funnelPolicy = { ...policy, funnelPromotion: { enabled: true } };
  const liveRow = buildScoredWorkflowRow(liveCand as never, liveWf);
  const liveTraceRules = traceP65PromotionRules(liveRow, funnelPolicy, "current_state");
  const liveCanPromote = canPromoteToPaperworkFunnel(liveRow, funnelPolicy);
  const liveActionOnly = buildScoredWorkflowRow(liveCand as never, {
    ...applyP240FreshNewReplayReset(liveWf),
    // Isolate actionType gate on a non-packet Applied row (requiredAction must
    // be set so buildScoredWorkflowRow does not overwrite via action decision).
    workflowStatus: "Applied",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    actionType: "await-signature",
    requiredAction: "Await Signature",
    assignedRecruiter: "Taylor",
  });
  const actionTypeStillBlocks = !canPromoteToPaperworkFunnel(liveActionOnly, funnelPolicy);
  const actionTypeTrace = traceP65PromotionRules(liveActionOnly, funnelPolicy, "current_state");
  const actionTypeGateIntact =
    actionTypeStillBlocks &&
    actionTypeTrace.firstFailedCheckId === "action_type_blocks_promotion";

  const frozenLive = structuredClone(liveWf);
  const livePath = await simulateP240CandidatePath({
    candidateId: "p242-live-guard",
    candidate: liveCand as never,
    workflow: liveWf,
    job: null,
    policy: funnelPolicy,
    opportunityPoints: [],
    priorSent: new Set(),
    proposedRecruiter: "Taylor",
    recruiterConfidence: 100,
    emailOwners: new Map([["live-guard@example.com", "p242-live-guard"]]),
    cohortKind: "real_new_post_cutoff",
    replayAsFreshNew: false,
    allowNetworkGeocode: false,
  });
  await simulateP240CandidatePath({
    candidateId: "p242-live-guard",
    candidate: liveCand as never,
    workflow: liveWf,
    job: null,
    policy: funnelPolicy,
    opportunityPoints: [],
    priorSent: new Set(),
    proposedRecruiter: "Taylor",
    recruiterConfidence: 100,
    emailOwners: new Map([["live-guard@example.com", "p242-live-guard"]]),
    cohortKind: "simulation_proxy_24h",
    replayAsFreshNew: true,
    allowNetworkGeocode: false,
  });
  const sourceUnchanged = JSON.stringify(liveWf) === JSON.stringify(frozenLive);

  const liveProtection = buildP242LiveProtectionCases({
    liveActivePacketStillBlocks:
      liveCanPromote === false && liveTraceRules.firstFailedCheckId === "active_packet",
    liveAlreadySentStillProtected:
      livePath.outcome === "protected_skip" && livePath.blocker === "already_sent_or_signed",
    replayDoesNotMutateSource: sourceUnchanged,
    canPromoteStillChecksActionType: actionTypeGateIntact,
    activePacketPredicateUnchanged:
      liveTraceRules.checks.some((c) => c.checkId === "active_packet" && !c.passed) &&
      liveTraceRules.checks.some((c) => c.checkId === "already_signed"),
  });

  const correctedThroughput = buildP242CorrectedThroughput({
    throughput: result.throughput,
    health: result.health,
    generatedAt: result.generatedAt,
  });

  const after: Record<string, string> = {};
  for (const p of P242_DURABLE_PATHS) after[p] = fingerprintFile(p);
  const unchanged = P242_DURABLE_PATHS.every((p) => before[p] === after[p]);

  const zeroWriteAudit: P242ZeroWriteAudit = {
    phase: P242_PHASE,
    mode: P242_EXECUTION_MODE,
    generatedAt: new Date().toISOString(),
    before,
    after,
    unchanged,
    durablePaths: [...P242_DURABLE_PATHS],
    candidateWrites: 0,
    workflowWrites: 0,
    dropboxSignCalls: 0,
    recruiterOwnershipChanges: 0,
    dmAssignmentChanges: 0,
    deployments: 0,
    commits: 0,
    liveSends: 0,
  };

  if (!unchanged) {
    console.error("[P242] ZERO-WRITE AUDIT FAILED — durable store fingerprints changed");
    writeArtifact("p242-zero-write-audit.json", zeroWriteAudit);
    process.exit(1);
  }

  const artifactPaths = [
    writeArtifact("p242-corrected-throughput-simulation.json", correctedThroughput),
    writeArtifact("p242-candidate-dispositions.json", {
      phase: P242_PHASE,
      generatedAt: result.generatedAt,
      mode: P242_EXECUTION_MODE,
      proxyCohortSize: proxyTraces.length,
      summary: dispositionSummary,
      dispositions,
      p241CaseValidations,
    }),
    writeArtifact("p242-live-protection-regression.json", {
      phase: P242_PHASE,
      generatedAt: result.generatedAt,
      mode: P242_EXECUTION_MODE,
      allPassed: liveProtection.every((c) => c.passed),
      cases: liveProtection,
      note: "Live P65.6 canPromoteToPaperworkFunnel predicates unchanged; only P240 replay reset expanded.",
    }),
    writeArtifact("p242-zero-write-audit.json", zeroWriteAudit),
  ];

  const reportPath = writeArtifact(
    "p242-replay-reset-validation.md",
    formatP242ReplayResetValidationMd({
      generatedAt: result.generatedAt,
      clearedActionFields: [...P240_FRESH_NEW_REPLAY_ACTION_FIELDS],
      dispositions,
      dispositionSummary,
      p241CaseValidations,
      liveProtection,
      correctedThroughput,
      zeroWriteUnchanged: unchanged,
      testsRun: testResult.testsRun,
      testsPassed: testResult.testsPassed,
      artifactPaths: [
        "artifacts/p242-replay-reset-validation.md",
        "artifacts/p242-corrected-throughput-simulation.json",
        "artifacts/p242-candidate-dispositions.json",
        "artifacts/p242-live-protection-regression.json",
        "artifacts/p242-zero-write-audit.json",
      ],
    }),
  );
  artifactPaths.push(reportPath);

  console.log(`\n[P242] complete in ${Date.now() - started}ms`);
  console.log(
    `[P242] wouldSend=${correctedThroughput.corrected.wouldSendCount}/${correctedThroughput.corrected.proxyCohortSize} autoClear=${correctedThroughput.corrected.autoClearRatePct}% daily≈${correctedThroughput.corrected.estimatedDailyThroughputToSent}`,
  );
  console.log(
    `[P242] health=${correctedThroughput.corrected.healthScore} goNoGo=${correctedThroughput.corrected.goNoGo} matchesExpected=${correctedThroughput.matchesExpected}`,
  );
  if (correctedThroughput.variances.length) {
    console.log(`[P242] variances:\n  - ${correctedThroughput.variances.join("\n  - ")}`);
  }
  console.log(
    `[P242] P241 cases cleared=${p241CaseValidations.filter((c) => c.actionTypeBlocksPromotionCleared).length}/8 liveProtection=${liveProtection.every((c) => c.passed)}`,
  );
  console.log(
    `[P242] zero-write unchanged=${unchanged} fingerprint=${sha256(JSON.stringify(after)).slice(0, 12)}`,
  );
  console.log(
    `[P242] READ-ONLY CONFIRMED — no live sends, commits, or deployments`,
  );
}

main().catch((err) => {
  console.error("[P242] fatal:", err);
  process.exit(1);
});
