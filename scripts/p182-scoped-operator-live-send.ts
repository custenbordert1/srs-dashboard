/**
 * P182 — Scoped operator live send (P178-ready cohort only).
 *
 * Usage: npx tsx scripts/p182-scoped-operator-live-send.ts
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
import { P167_DROPBOX_CYCLE_BUDGET, projectDropboxUsage } from "@/lib/p167-intelligent-production-scheduler";
import { executeP159OperationsControl } from "@/lib/p159-operations-control-center";
import { resolveP169EnvConfig } from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config";
import {
  evaluateSendCycleGates,
  resolveGateProfileForP159LiveCycleAsync,
} from "@/lib/p179-operator-controlled-send-gate-profile";
import {
  defaultOperatorLiveCycleScope,
  resolveOperatorScopePool,
  resolveP178ReadyCandidateIds,
} from "@/lib/p181-scoped-operator-paperwork-queue";

const PATRICIA_IRBY_ID = "98400c5310f6";
const SOURCE_PHASE = "P182";

const SESSION: AuthSession = {
  userId: "p182-scoped-operator-live-send",
  email: "p182@local",
  name: "P182 Scoped Operator Live Send",
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
};

async function buildScopedCandidateRows(): Promise<{
  scope: ReturnType<typeof defaultOperatorLiveCycleScope>;
  scopedPoolCount: number;
  candidates: ScopedCandidateRow[];
  eligible: ScopedCandidateRow[];
  remainingEligible: ScopedCandidateRow[];
  patricia: ScopedCandidateRow | null;
  p178ReadyIds: string[];
}> {
  const scope = defaultOperatorLiveCycleScope();
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
    scope,
    allCandidates,
    workflows: bundle.workflows,
    jobsByPositionId,
  });

  const p178ReadyIds = await resolveP178ReadyCandidateIds({
    candidates: allCandidates,
    workflows: bundle.workflows,
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
    };
  });

  const eligible = candidates.filter((c) => c.p152Eligible);
  const remainingEligible = eligible.filter((c) => !c.alreadySent && !c.alreadySigned);
  const patricia = candidates.find((c) => c.candidateId === PATRICIA_IRBY_ID) ?? null;

  return {
    scope,
    scopedPoolCount: scopedPool.length,
    candidates,
    eligible,
    remainingEligible,
    patricia,
    p178ReadyIds,
  };
}

function formatMarkdown(report: Record<string, unknown>): string {
  const pre = report.preSend as Record<string, unknown>;
  const post = report.postSend as Record<string, unknown> | undefined;
  const lines = [
    `# ${SOURCE_PHASE} — Scoped Operator Live Send`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Pre-send",
    "",
    `- Send queue profile: **${pre.sendQueueProfile}**`,
    `- Scoped cohort: \`${JSON.stringify(pre.scope)}\``,
    `- Scoped pool count: **${pre.scopedPoolCount}**`,
    `- Eligible in scope: **${pre.eligibleCount}**`,
    `- Remaining eligible (not sent/signed): **${pre.remainingEligibleCount}**`,
    `- Send cap (Dropbox budget): **${pre.sendCap}**`,
    `- Projected Dropbox API calls: **${pre.projectedDropboxApiCalls}**`,
    `- Continuous mode: **${pre.continuousMode}**`,
    `- Daemon active: **${pre.daemonActive}**`,
    `- Operator gate pass: **${pre.operatorGatePass}**`,
    "",
    "### Patricia Irby",
    "",
    pre.patriciaIrby
      ? [
          `- In scoped pool: **${(pre.patriciaIrby as Record<string, unknown>).inScopedPool}**`,
          `- P152 eligible: **${(pre.patriciaIrby as Record<string, unknown>).p152Eligible}**`,
          `- Paperwork status: **${(pre.patriciaIrby as Record<string, unknown>).paperworkStatus}**`,
          `- Remaining eligible: **${(pre.patriciaIrby as Record<string, unknown>).remainingEligible}**`,
          `- Blockers: ${((pre.patriciaIrby as Record<string, unknown>).blockers as string[]).join(", ") || "none"}`,
        ].join("\n")
      : "- Not in scoped pool",
    "",
    "### Selected candidates (remaining eligible)",
    "",
    ...((pre.selectedCandidates as Array<{ name: string; email: string; candidateId: string }>) ?? []).map(
      (c) => `- ${c.name} (\`${c.candidateId}\`) — ${c.email}`,
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
      `- Executed: **${post.executed}**`,
      `- Sent: **${post.sentCount}**`,
      `- Skipped: **${post.skippedCount}**`,
      `- Failures: **${post.failedCount}**`,
      `- Cap reached: **${post.capReached}**`,
      `- Stopped on error: **${post.stoppedOnError}**`,
      `- Execution time (ms): **${post.executionTimeMs}**`,
      `- Dropbox requests (delta): **${post.dropboxRequestDelta}**`,
      `- Dropbox 429 events (delta): **${post.dropbox429Delta}**`,
      `- Patricia Irby sent: **${post.patriciaIrbySent}**`,
      `- Remaining P178-ready: **${post.remainingP178ReadyCount}**`,
      `- Global pool leak detected: **${post.globalPoolLeakDetected}**`,
      "",
      "### Sent candidates",
      "",
      ...((post.sentCandidates as Array<{ name: string; candidateId: string; signatureRequestId: string | null }>) ??
        []
      ).map(
        (c) =>
          `- ${c.name} (\`${c.candidateId}\`)${c.signatureRequestId ? ` — ${c.signatureRequestId}` : ""}`,
      ),
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

  const dropboxBefore = getDropboxSignApiMetricsSnapshot();
  const runnerBefore = await loadP1547RunnerState();
  const continuousMode = isP154ContinuousEnabled();
  const daemonActive = runnerBefore.continuousEnabled && runnerBefore.currentStatus === "running";

  console.error("[P182] Building scoped pre-send report…");
  const scoped = await buildScopedCandidateRows();

  const maxSendsFromBudget = Math.floor(P167_DROPBOX_CYCLE_BUDGET / 2);
  const sendCap = Math.min(scoped.remainingEligible.length, maxSendsFromBudget);
  const dropboxProjection = projectDropboxUsage(sendCap);

  const p169Config = resolveP169EnvConfig();
  const gateProfile = await resolveGateProfileForP159LiveCycleAsync({
    confirmLive: true,
    sessionRole: SESSION.role,
  });
  const operatorGates = await evaluateSendCycleGates({
    profile: "operator",
    readinessThreshold: p169Config.readinessThreshold,
  });

  const blockers: string[] = [];
  if (gateProfile !== "operator") blockers.push(`Gate profile resolved to ${gateProfile}, expected operator`);
  if (continuousMode) blockers.push("Continuous mode is enabled");
  if (daemonActive) blockers.push("Daemon is active");
  if (runnerBefore.processingLock) blockers.push("Processing lock is held");
  if (!operatorGates.pass) blockers.push(...operatorGates.blockingFactors);
  if (scoped.remainingEligible.length === 0) blockers.push("No remaining eligible candidates in scoped pool");
  if (!dropboxProjection.withinBudget) {
    blockers.push(
      `Dropbox budget exceeded for ${sendCap} sends (${dropboxProjection.totalRequests}/${dropboxProjection.budgetCeiling})`,
    );
  }

  for (const candidate of scoped.remainingEligible) {
    if (candidate.p152Blockers.length > 0) {
      blockers.push(`${candidate.name}: ${candidate.p152Blockers.join(", ")}`);
    }
  }

  const preSend = {
    sendQueueProfile: "operator",
    scope: scoped.scope,
    scopedPoolCount: scoped.scopedPoolCount,
    eligibleCount: scoped.eligible.length,
    remainingEligibleCount: scoped.remainingEligible.length,
    p178ReadyCount: scoped.p178ReadyIds.length,
    sendCap,
    projectedDropboxApiCalls: dropboxProjection.totalRequests,
    dropboxWithinBudget: dropboxProjection.withinBudget,
    continuousMode,
    daemonActive,
    runnerStatus: runnerBefore.currentStatus,
    lockHeld: Boolean(runnerBefore.processingLock),
    gateProfile,
    operatorGatePass: operatorGates.pass,
    operatorWarnings: operatorGates.warnings,
    operatorHardBlockers: operatorGates.blockingFactors,
    selectedCandidates: scoped.remainingEligible.slice(0, sendCap).map((c) => ({
      candidateId: c.candidateId,
      name: c.name,
      email: c.email,
    })),
    patriciaIrby: scoped.patricia
      ? {
          candidateId: scoped.patricia.candidateId,
          name: scoped.patricia.name,
          inScopedPool: true,
          p152Eligible: scoped.patricia.p152Eligible,
          paperworkStatus: scoped.patricia.paperworkStatus,
          remainingEligible:
            scoped.patricia.p152Eligible &&
            !scoped.patricia.alreadySent &&
            !scoped.patricia.alreadySigned,
          blockers: scoped.patricia.p152Blockers,
        }
      : { inScopedPool: false },
    blockers,
    scopedCandidateIds: scoped.candidates.map((c) => c.candidateId),
  };

  console.error(JSON.stringify({ phase: "pre-send", ...preSend }, null, 2));

  const hardBlockers = blockers.filter(
    (b) =>
      !b.includes("Production readiness") &&
      !b.includes("P154 controlled production autopilot env gate") &&
      !b.includes("Scheduler recommends") &&
      !b.includes("Executive approval"),
  );

  const canExecute =
    gateProfile === "operator" &&
    !continuousMode &&
    !daemonActive &&
    !runnerBefore.processingLock &&
    operatorGates.pass &&
    scoped.remainingEligible.length > 0 &&
    dropboxProjection.withinBudget;

  let postSend: Record<string, unknown> | undefined;

  if (!canExecute) {
    console.error("[P182] Pre-send checks failed — live send not executed.");
    console.error(`Hard blockers: ${hardBlockers.join("; ") || "see blockers list"}`);
  } else {
    process.env.P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED = "true";
    process.env.P152_IMMEDIATE_PAPERWORK_ENABLED = "true";
    process.env.P152_MAX_SENDS_PER_CYCLE = String(sendCap);
    process.env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE = String(sendCap);
    process.env.P154_CONTINUOUS_ENABLED = "false";

    console.error(`[P182] Executing operator live cycle (cap ${sendCap})…`);
    const startedMs = Date.now();

    const result = await executeP159OperationsControl({
      session: SESSION,
      action: "live_cycle",
      confirmLive: true,
      sendQueueScope: scoped.scope,
    });

    const dropboxAfter = getDropboxSignApiMetricsSnapshot();
    const scopedAfter = await buildScopedCandidateRows();
    const scopedIdSet = new Set(scoped.candidates.map((c) => c.candidateId));

    const sentIds =
      result.cycleReport?.controlledCycle?.sentCandidateIds ??
      result.cycleReport?.controlledCycle?.cycle.sentCandidateIds ??
      [];

    const sentCandidates = scoped.candidates
      .filter((c) => sentIds.includes(c.candidateId))
      .map((c) => ({
        candidateId: c.candidateId,
        name: c.name,
        email: c.email,
        signatureRequestId: null as string | null,
      }));

    const audit = await loadPaperworkAutomationAuditLog().catch(() => []);
    for (const sent of sentCandidates) {
      const event = [...audit]
        .reverse()
        .find((e) => e.candidateId === sent.candidateId && e.executed && !e.simulated);
      if (event && "signatureRequestId" in event) {
        sent.signatureRequestId =
          typeof (event as { signatureRequestId?: string }).signatureRequestId === "string"
            ? (event as { signatureRequestId: string }).signatureRequestId
            : null;
      }
    }

    const globalLeakIds = sentIds.filter((id) => !scopedIdSet.has(id));
    const patriciaSent = sentIds.includes(PATRICIA_IRBY_ID);

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
      capReached: getP154MaxPaperworkSendsPerCycle() <= (result.cycleReport?.metrics.sent ?? 0),
      stoppedOnError: result.cycleReport?.stoppedOnError ?? false,
      executionTimeMs: Date.now() - startedMs,
      sentCandidateIds: sentIds,
      sentCandidates,
      dropboxRequestDelta: dropboxAfter.totalRequests - dropboxBefore.totalRequests,
      dropboxPostDelta: dropboxAfter.postRequests - dropboxBefore.postRequests,
      dropbox429Delta: dropboxAfter.responses429 - dropboxBefore.responses429,
      dropboxRateLimitedPausedMsDelta:
        dropboxAfter.rateLimitedPausedMs - dropboxBefore.rateLimitedPausedMs,
      patriciaIrbySent: patriciaSent,
      remainingP178ReadyCount: scopedAfter.p178ReadyIds.length,
      remainingP178ReadyIds: scopedAfter.p178ReadyIds,
      globalPoolLeakDetected: globalLeakIds.length > 0,
      globalLeakCandidateIds: globalLeakIds,
      cycleReport: result.cycleReport,
      workingTreeStatus,
    };

    console.error(JSON.stringify({ phase: "post-send", ...postSend }, null, 2));
  }

  const report = {
    sourcePhase: SOURCE_PHASE,
    generatedAt,
    preSend,
    postSend,
    safetyFlags: {
      operatorScopedOnly: true,
      breezyWrites: false,
      continuousModeRemainedOff: !isP154ContinuousEnabled(),
      envLocalNotModified: true,
    },
  };

  const jsonPath = path.join("artifacts", "p182-scoped-operator-live-send.json");
  const mdPath = path.join("artifacts", "p182-scoped-operator-live-send.md");
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
