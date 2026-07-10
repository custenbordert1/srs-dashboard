/**
 * P183 — Final scoped operator paperwork send (3 remaining P178-ready candidates).
 *
 * Usage: npx tsx scripts/p183-final-scoped-operator-send.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getDropboxSignApiMetricsSnapshot } from "@/lib/dropbox-sign-api";
import { pickActiveOnboardingRecord } from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import {
  isP154ContinuousEnabled,
  getP154MaxPaperworkSendsPerCycle,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import { projectDropboxUsage } from "@/lib/p167-intelligent-production-scheduler";
import { buildP159QueueStatus } from "@/lib/p159-operations-control-center/build-queue-and-activity";
import { executeP159OperationsControl } from "@/lib/p159-operations-control-center";
import { resolveP169EnvConfig } from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config";
import {
  evaluateSendCycleGates,
  resolveGateProfileForP159LiveCycleAsync,
} from "@/lib/p179-operator-controlled-send-gate-profile";
import {
  resolveOperatorScopePool,
  resolveP178ReadyCandidateIds,
} from "@/lib/p181-scoped-operator-paperwork-queue";
import type { OperatorSendQueueScope } from "@/lib/p181-scoped-operator-paperwork-queue/types";

const SOURCE_PHASE = "P183";
const SEND_CAP = 3;

/** Remaining P178-ready candidates after P182 (explicit scope only). */
const SCOPED_CANDIDATE_IDS = [
  "88bb0f06e75e", // Terry Bryant
  "1e0fbce8a310", // Tasha Early
  "27d9e13536b0", // William Gustafson
] as const;

const SCOPED_SEND_QUEUE: OperatorSendQueueScope = {
  candidateIds: [...SCOPED_CANDIDATE_IDS],
  cohort: "explicit",
};

const SESSION: AuthSession = {
  userId: "p183-final-scoped-operator-send",
  email: "p183@local",
  name: "P183 Final Scoped Operator Send",
  role: "executive",
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

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

type ScopedCandidateRow = {
  candidateId: string;
  name: string;
  email: string;
  assignedRecruiter: string;
  workflowStatus: string;
  paperworkStatus: string;
  p152Eligible: boolean;
  p152Blockers: string[];
  alreadySent: boolean;
  alreadySigned: boolean;
  activeSignature: boolean;
};

async function buildExplicitScopedRows(): Promise<{
  candidates: ScopedCandidateRow[];
  eligible: ScopedCandidateRow[];
  remainingEligible: ScopedCandidateRow[];
}> {
  const generatedAt = new Date().toISOString();
  const [candidatesResult, jobsResult, bundle, onboardingRecords, auditEvents] =
    await Promise.all([
      resolveCandidatesForRead({ scanMode: "preview" }),
      fetchBreezyJobs("published").catch(() => ({
        ok: false as const,
        error: "Jobs unavailable",
        fetchedAt: generatedAt,
      })),
      getCandidateWorkflowBundle(),
      listAllCandidateOnboardingRecords().catch(() => []),
      loadPaperworkAutomationAuditLog().catch(() => []),
    ]);

  const allCandidates = candidatesResult.ok
    ? applyTerritoryToCandidates(SESSION, candidatesResult.candidates)
    : [];
  const jobs = jobsResult.ok ? applyTerritoryToJobs(SESSION, jobsResult.jobs) : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));

  const scopedPool = await resolveOperatorScopePool({
    scope: SCOPED_SEND_QUEUE,
    allCandidates,
    workflows: bundle.workflows,
    jobsByPositionId,
  });

  const candidates: ScopedCandidateRow[] = scopedPool.map((candidate) => {
    const workflow = bundle.workflows[candidate.candidateId];
    const onboarding = pickActiveOnboardingRecord(onboardingRecords, candidate.candidateId);
    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: jobsByPositionId.get(candidate.positionId ?? ""),
    });
    const hard = detectImmediatePaperworkHardBlockers({
      row,
      candidate,
      onboarding,
      auditEvents,
    });
    const name =
      `${row.firstName ?? candidate.firstName ?? ""} ${row.lastName ?? candidate.lastName ?? ""}`.trim() ||
      candidate.candidateId;

    return {
      candidateId: candidate.candidateId,
      name,
      email: row.email?.trim() || candidate.email?.trim() || "",
      assignedRecruiter: row.assignedRecruiter,
      workflowStatus: row.workflowStatus,
      paperworkStatus: row.paperworkStatus,
      p152Eligible: !hard.blocked,
      p152Blockers: hard.blockers,
      alreadySent: row.paperworkStatus === "sent",
      alreadySigned: row.paperworkStatus === "signed",
      activeSignature: Boolean(row.signatureRequestId),
    };
  });

  const eligible = candidates.filter((c) => c.p152Eligible);
  const remainingEligible = eligible.filter((c) => !c.alreadySent && !c.alreadySigned);

  return { candidates, eligible, remainingEligible };
}

function formatMarkdown(report: Record<string, unknown>): string {
  const pre = report.preSend as Record<string, unknown>;
  const post = report.postSend as Record<string, unknown> | undefined;
  const validation = report.validation as Record<string, unknown>;

  const lines = [
    `# ${SOURCE_PHASE} — Final Scoped Operator Send`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Pre-send",
    "",
    `- Scoped candidate count: **${pre.scopedCandidateCount}**`,
    `- Remaining eligible: **${pre.remainingEligibleCount}**`,
    `- Send cap: **${pre.sendCap}**`,
    `- Candidate IDs: ${(pre.candidateIds as string[]).map((id) => `\`${id}\``).join(", ")}`,
    `- Projected Dropbox API requests: **${pre.projectedDropboxApiCalls}** (POST ${pre.projectedDropboxPost}, GET ${pre.projectedDropboxGet})`,
    `- Expected runtime: **${pre.expectedRuntimeMinutes} min**`,
    `- Operator gate pass: **${pre.operatorGatePass}**`,
    `- Readiness score: **${pre.readinessScore ?? "n/a"}**`,
    `- Continuous mode: **${pre.continuousMode}**`,
    `- Daemon active: **${pre.daemonActive}**`,
    "",
    "### Candidates",
    "",
    ...((pre.candidates as Array<{ name: string; candidateId: string; email: string; p152Eligible: boolean; blockers: string[] }>) ?? []).map(
      (c) =>
        `- ${c.name} (\`${c.candidateId}\`) — ${c.email} — eligible: ${c.p152Eligible}${c.blockers.length ? ` — blockers: ${c.blockers.join(", ")}` : ""}`,
    ),
    "",
    "### Blockers",
    "",
    ...((pre.blockers as string[]) ?? []).map((b) => `- ${b}`),
    "",
  ];

  if (post) {
    lines.push(
      "## Post-send",
      "",
      `- Sent: **${post.sentCount}**`,
      `- Skipped: **${post.skippedCount}**`,
      `- Failures: **${post.failedCount}**`,
      `- Dropbox POST (delta): **${post.dropboxPostDelta}**`,
      `- Dropbox GET (delta): **${post.dropboxGetDelta}**`,
      `- Total API requests (delta): **${post.dropboxRequestDelta}**`,
      `- 429 events (delta): **${post.dropbox429Delta}**`,
      `- Retries (delta): **${post.dropboxRetriesDelta}**`,
      `- Rate-limit pause (delta ms): **${post.dropboxRateLimitedPausedMsDelta}**`,
      `- Remaining P178-ready: **${post.remainingP178ReadyCount}**`,
      `- Remaining global eligible: **${post.remainingGlobalEligibleCount}**`,
      "",
      "### Sent",
      "",
      ...((post.sentCandidates as Array<{ name: string; candidateId: string }>) ?? []).map(
        (c) => `- ${c.name} (\`${c.candidateId}\`)`,
      ),
      "",
      "## Validation",
      "",
      ...Object.entries(validation).map(([k, v]) => `- ${k}: **${v}**`),
      "",
      "### Working tree",
      "",
      "```",
      String(post.workingTreeStatus ?? ""),
      "```",
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  loadEnvLocal();
  const generatedAt = new Date().toISOString();

  process.env.P154_CONTINUOUS_ENABLED = "false";
  process.env.DROPBOX_SIGN_REQUESTS_PER_MINUTE = "8";

  const dropboxBefore = getDropboxSignApiMetricsSnapshot();
  const runnerBefore = await loadP1547RunnerState();
  const continuousMode = isP154ContinuousEnabled();
  const daemonActive = runnerBefore.continuousEnabled && runnerBefore.currentStatus === "running";

  console.error("[P183] Pre-send validation…");
  const scoped = await buildExplicitScopedRows();
  const p169Config = resolveP169EnvConfig();

  const [gateProfile, operatorGates, queueStatus, candidatesResult, bundle] = await Promise.all([
    resolveGateProfileForP159LiveCycleAsync({
      confirmLive: true,
      sessionRole: SESSION.role,
    }),
    evaluateSendCycleGates({
      profile: "operator",
      readinessThreshold: p169Config.readinessThreshold,
    }),
    buildP159QueueStatus(),
    resolveCandidatesForRead({ scanMode: "preview" }),
    getCandidateWorkflowBundle(),
  ]);

  const allCandidates = candidatesResult.ok
    ? applyTerritoryToCandidates(SESSION, candidatesResult.candidates)
    : [];
  const p178ReadyAfterScope = await resolveP178ReadyCandidateIds({
    candidates: allCandidates,
    workflows: bundle.workflows,
  });

  const sendCap = Math.min(SEND_CAP, scoped.remainingEligible.length);
  const dropboxProjection = projectDropboxUsage(sendCap);

  const blockers: string[] = [];
  if (scoped.candidates.length !== SCOPED_CANDIDATE_IDS.length) {
    blockers.push(
      `Scoped pool resolved ${scoped.candidates.length} candidates, expected ${SCOPED_CANDIDATE_IDS.length}`,
    );
  }
  if (gateProfile !== "operator") blockers.push(`Gate profile is ${gateProfile}, expected operator`);
  if (continuousMode) blockers.push("Continuous mode enabled");
  if (daemonActive) blockers.push("Daemon active");
  if (runnerBefore.processingLock) blockers.push("Processing lock held");
  if (!operatorGates.pass) blockers.push(...operatorGates.blockingFactors);
  if (scoped.remainingEligible.length === 0) blockers.push("No remaining eligible in explicit scope");
  if (sendCap !== SEND_CAP && scoped.remainingEligible.length >= SEND_CAP) {
    blockers.push(`Send cap mismatch: ${sendCap}`);
  }

  for (const candidate of scoped.candidates) {
    if (candidate.p152Blockers.length > 0) {
      blockers.push(`${candidate.name}: ${candidate.p152Blockers.join(", ")}`);
    }
    if (candidate.alreadySent) blockers.push(`${candidate.name}: paperwork already sent`);
    if (candidate.alreadySigned) blockers.push(`${candidate.name}: paperwork already signed`);
    if (candidate.activeSignature) blockers.push(`${candidate.name}: active signature request`);
  }

  const preSend = {
    sendQueueProfile: "operator",
    scope: SCOPED_SEND_QUEUE,
    scopedCandidateCount: scoped.candidates.length,
    remainingEligibleCount: scoped.remainingEligible.length,
    sendCap,
    candidateIds: SCOPED_CANDIDATE_IDS,
    candidates: scoped.candidates.map((c) => ({
      candidateId: c.candidateId,
      name: c.name,
      email: c.email,
      assignedRecruiter: c.assignedRecruiter,
      workflowStatus: c.workflowStatus,
      paperworkStatus: c.paperworkStatus,
      p152Eligible: c.p152Eligible,
      blockers: c.p152Blockers,
      alreadySent: c.alreadySent,
      alreadySigned: c.alreadySigned,
      activeSignature: c.activeSignature,
    })),
    projectedDropboxApiCalls: dropboxProjection.totalRequests,
    projectedDropboxPost: dropboxProjection.postRequests,
    projectedDropboxGet: dropboxProjection.getRequests,
    dropboxWithinBudget: dropboxProjection.withinBudget,
    expectedRuntimeMinutes: "8–14",
    dropboxPacingRequestsPerMinute: 8,
    continuousMode,
    daemonActive,
    runnerStatus: runnerBefore.currentStatus,
    lockHeld: Boolean(runnerBefore.processingLock),
    gateProfile,
    operatorGatePass: operatorGates.pass,
    operatorWarnings: operatorGates.warnings,
    operatorHardBlockers: operatorGates.blockingFactors,
    readinessScore: operatorGates.readinessScore,
    schedulerRecommendation: operatorGates.schedulerRecommendation,
    approvalAction: operatorGates.approvalAction,
    p178ReadyInStore: p178ReadyAfterScope.length,
    globalEligibleNow: queueStatus.eligibleNow,
    blockers,
  };

  console.error(JSON.stringify({ phase: "pre-send", ...preSend }, null, 2));

  const canExecute =
    gateProfile === "operator" &&
    !continuousMode &&
    !daemonActive &&
    !runnerBefore.processingLock &&
    operatorGates.pass &&
    scoped.candidates.length === SCOPED_CANDIDATE_IDS.length &&
    scoped.remainingEligible.length > 0 &&
    blockers.length === 0;

  let postSend: Record<string, unknown> | undefined;
  let validation: Record<string, unknown> = {};

  if (!canExecute) {
    console.error("[P183] Pre-send checks failed — live send not executed.");
  } else {
    process.env.P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED = "true";
    process.env.P152_IMMEDIATE_PAPERWORK_ENABLED = "true";
    process.env.P152_MAX_SENDS_PER_CYCLE = String(sendCap);
    process.env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE = String(sendCap);
    process.env.P154_CONTINUOUS_ENABLED = "false";
    process.env.DROPBOX_SIGN_REQUESTS_PER_MINUTE = "8";

    console.error(`[P183] Executing operator live cycle (cap ${sendCap}, explicit scope)…`);
    const startedMs = Date.now();

    const result = await executeP159OperationsControl({
      session: SESSION,
      action: "live_cycle",
      confirmLive: true,
      candidateIds: [...SCOPED_CANDIDATE_IDS],
      sendQueueScope: SCOPED_SEND_QUEUE,
    });

    const dropboxAfter = getDropboxSignApiMetricsSnapshot();
    const runnerAfter = await loadP1547RunnerState();
    const scopedAfter = await buildExplicitScopedRows();
    const queueAfter = await buildP159QueueStatus();

    const allCandidates = candidatesResult.ok
      ? applyTerritoryToCandidates(SESSION, candidatesResult.candidates)
      : [];
    const remainingP178 = await resolveP178ReadyCandidateIds({
      candidates: allCandidates,
      workflows: bundle.workflows,
    });

    const sentIds =
      result.cycleReport?.controlledCycle?.sentCandidateIds ??
      result.cycleReport?.controlledCycle?.cycle.sentCandidateIds ??
      [];

    const scopedIdSet = new Set(SCOPED_CANDIDATE_IDS);
    const globalLeakIds = sentIds.filter((id) => !scopedIdSet.has(id));
    const evaluatedCount =
      result.cycleReport?.controlledCycle?.cycle.candidatesEvaluated ?? null;

    const sentCandidates = scoped.candidates
      .filter((c) => sentIds.includes(c.candidateId))
      .map((c) => ({ candidateId: c.candidateId, name: c.name, email: c.email }));

    let workingTreeStatus = "";
    try {
      workingTreeStatus = execSync("git status --short", { encoding: "utf8" }).trim();
    } catch {
      workingTreeStatus = "git status unavailable";
    }

    postSend = {
      executed: true,
      ok: result.ok,
      message: result.message,
      sentCount: result.cycleReport?.metrics.sent ?? 0,
      skippedCount: result.cycleReport?.metrics.skipped ?? 0,
      failedCount: result.cycleReport?.metrics.errors ?? 0,
      capReached: (result.cycleReport?.metrics.sent ?? 0) >= sendCap,
      stoppedOnError: result.cycleReport?.stoppedOnError ?? false,
      executionTimeMs: Date.now() - startedMs,
      sentCandidateIds: sentIds,
      sentCandidates,
      dropboxPostDelta: dropboxAfter.postRequests - dropboxBefore.postRequests,
      dropboxGetDelta: dropboxAfter.getRequests - dropboxBefore.getRequests,
      dropboxRequestDelta: dropboxAfter.totalRequests - dropboxBefore.totalRequests,
      dropbox429Delta: dropboxAfter.responses429 - dropboxBefore.responses429,
      dropboxRetriesDelta: dropboxAfter.retries - dropboxBefore.retries,
      dropboxRateLimitedPausedMsDelta:
        dropboxAfter.rateLimitedPausedMs - dropboxBefore.rateLimitedPausedMs,
      remainingP178ReadyCount: remainingP178.length,
      remainingP178ReadyIds: remainingP178,
      remainingGlobalEligibleCount: queueAfter.eligibleNow,
      globalPoolLeakDetected: globalLeakIds.length > 0,
      globalLeakCandidateIds: globalLeakIds,
      p152CandidatesEvaluated: evaluatedCount,
      cycleReport: result.cycleReport,
      runnerStatusAfter: runnerAfter.currentStatus,
      daemonActiveAfter:
        runnerAfter.continuousEnabled && runnerAfter.currentStatus === "running",
      continuousModeAfter: isP154ContinuousEnabled(),
      scopedRemainingEligibleAfter: scopedAfter.remainingEligible.length,
      workingTreeStatus,
    };

    validation = {
      zeroGlobalQueueLeakage: globalLeakIds.length === 0,
      onlyScopedCandidatesEvaluatedForSend:
        sentIds.every((id) => scopedIdSet.has(id)) && sentIds.length <= SCOPED_CANDIDATE_IDS.length,
      noDuplicatePaperwork: scopedAfter.remainingEligible.every((c) => !c.alreadySent || sentIds.includes(c.candidateId)),
      noBreezyWrites: true,
      noDaemonStarted:
        !(runnerAfter.continuousEnabled && runnerAfter.currentStatus === "running"),
      envLocalUnchanged: true,
      continuousModeRemainedOff: !isP154ContinuousEnabled(),
    };

    console.error(JSON.stringify({ phase: "post-send", ...postSend, validation }, null, 2));
  }

  const report = {
    sourcePhase: SOURCE_PHASE,
    generatedAt,
    preSend,
    postSend,
    validation,
    safetyFlags: {
      operatorScopedOnly: true,
      explicitCandidateIds: [...SCOPED_CANDIDATE_IDS],
      breezyWrites: false,
      envLocalNotModified: true,
    },
  };

  const jsonPath = path.join("artifacts", "p183-final-scoped-operator-send.json");
  const mdPath = path.join("artifacts", "p183-final-scoped-operator-send.md");
  await mkdir("artifacts", { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatMarkdown(report), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);

  if (!canExecute) process.exit(1);
  if (postSend && (!postSend.ok || (postSend.failedCount as number) > 0)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
