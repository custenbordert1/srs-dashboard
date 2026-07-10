/**
 * P154.6 — Live capped send after Breezy CSV import
 *
 * Usage: npx tsx scripts/p154.6-live-send-after-csv-import.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { executeImmediatePaperworkPolicy } from "@/lib/p152-immediate-paperwork-policy/execute-immediate-paperwork-policy";
import { verifyAutopilotSystemHealth } from "@/lib/p154-controlled-production-autopilot-activation/verify-system-health";

const SESSION = {
  userId: "p154.6-live-send-after-csv",
  email: "p154.6@local",
  name: "P154.6 Live Send After CSV Import",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

const MAX_SENDS = 10;

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

async function countQueueDepth(): Promise<number> {
  const bundle = await getCandidateWorkflowBundle();
  return Object.values(bundle.workflows).filter(
    (r) =>
      !isUnassignedRecruiter(r.assignedRecruiter) &&
      r.paperworkStatus !== "signed" &&
      r.paperworkStatus !== "sent" &&
      !["Not Qualified", "Active Rep", "Loaded in MEL"].includes(r.workflowStatus),
  ).length;
}

function skipCountsFromExclusion(
  summary: Record<string, number>,
): {
  activeSignaturesSkipped: number;
  alreadySignedSkipped: number;
  duplicatesPrevented: number;
  invalidEmailSkipped: number;
} {
  return {
    activeSignaturesSkipped: summary.active_signature_request ?? 0,
    alreadySignedSkipped:
      (summary.paperwork_already_completed ?? 0) + (summary.paperwork_already_sent ?? 0),
    duplicatesPrevented: summary.duplicate_candidate ?? 0,
    invalidEmailSkipped: summary.invalid_email ?? 0,
  };
}

function formatMarkdown(report: Record<string, unknown>): string {
  const dry = report.dryRunEligibility as Record<string, number | string>;
  const live = report.liveCycle as Record<string, unknown>;
  const sigs = (live.signatureRequestIds as string[]) ?? [];
  const lines = [
    "# P154.6 — Live Capped Send After Breezy CSV Import",
    "",
    `Generated: ${report.generatedAt}`,
    "Post P154.5 CSV import — one controlled live paperwork cycle.",
    "",
    "## Pre-send eligibility dry run",
    "",
    `- Candidates evaluated: **${dry.candidatesEvaluated}**`,
    `- Eligible: **${dry.eligibleCount}**`,
    `- Projected sends (cap ${MAX_SENDS}): **${dry.projectedSendCount}**`,
    `- Eligible change vs P154.5: **${dry.eligibleChangeNote}**`,
    "",
    "## Live capped send cycle",
    "",
    `- Candidates evaluated: **${live.candidatesEvaluated}**`,
    `- Eligible before send: **${live.eligibleBeforeSend}**`,
    `- Sent: **${live.sent}**`,
    `- Skipped: **${live.skipped}**`,
    `- Duplicates prevented: **${live.duplicatesPrevented}**`,
    `- Active signatures skipped: **${live.activeSignaturesSkipped}**`,
    `- Already signed skipped: **${live.alreadySignedSkipped}**`,
    `- Failures: **${live.failures}**`,
    `- Queue remaining: **${live.queueRemaining}**`,
    `- Cap reached: **${live.capReached}**`,
    `- Stopped on error: **${live.stoppedOnError}**`,
    "",
    "## Dropbox Sign request IDs",
    "",
    ...(sigs.length > 0 ? sigs.map((id) => `- \`${id}\``) : ["- —"]),
    "",
    "## Safety",
    "",
    "- Max sends: 10",
    "- Breezy writes: no",
    "- Duplicate prevention: active",
    "- Audit: every send logged",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  loadEnvLocal();
  const generatedAt = new Date().toISOString();

  process.env.P152_MAX_SENDS_PER_CYCLE = String(MAX_SENDS);
  process.env.P152_IMMEDIATE_PAPERWORK_ENABLED = "false";

  console.error("[P154.6] Phase 1 — system health…");
  const health = await verifyAutopilotSystemHealth();
  if (!health.healthy) {
    console.error(`Health check failed: ${health.abortReason}`);
    process.exit(1);
  }

  console.error("[P154.6] Phase 2 — eligibility dry run…");
  const dryRun = await executeImmediatePaperworkPolicy({
    session: SESSION,
    dryRun: true,
    userId: SESSION.userId,
    userEmail: SESSION.email,
  });

  const drySkips = skipCountsFromExclusion(dryRun.exclusionSummary);
  const p1545Eligible = 63;
  const eligibleChangeNote =
    dryRun.eligibleCount === p1545Eligible
      ? "unchanged (63)"
      : `${dryRun.eligibleCount} (was 63 at P154.5 — ${dryRun.eligibleCount - p1545Eligible >= 0 ? "+" : ""}${dryRun.eligibleCount - p1545Eligible})`;

  console.error("[P154.6] Phase 3 — live capped send cycle…");
  process.env.P152_IMMEDIATE_PAPERWORK_ENABLED = "true";
  const live = await executeImmediatePaperworkPolicy({
    session: SESSION,
    dryRun: false,
    userId: SESSION.userId,
    userEmail: SESSION.email,
  });

  const liveSkips = skipCountsFromExclusion(live.exclusionSummary);
  const signatureRequestIds = live.executionItems
    .filter((item) => item.sendResult === "sent" && item.signatureRequestId)
    .map((item) => item.signatureRequestId as string);

  const sentDetails = live.executionItems
    .filter((item) => item.sendResult === "sent")
    .map((item) => ({
      candidateId: item.candidateId,
      candidateName: item.candidateName,
      email: item.email,
      signatureRequestId: item.signatureRequestId,
    }));

  const queueRemaining = await countQueueDepth();

  const report = {
    sourcePhase: "P154.6",
    generatedAt,
    health,
    dryRunEligibility: {
      candidatesEvaluated: dryRun.candidatesEvaluated,
      eligibleCount: dryRun.eligibleCount,
      projectedSendCount: dryRun.projectedSendCount,
      excludedCount: dryRun.excludedCount,
      exclusionSummary: dryRun.exclusionSummary,
      eligibleChangeNote,
      p1545BaselineEligible: p1545Eligible,
      ...drySkips,
    },
    liveCycle: {
      candidatesEvaluated: live.candidatesEvaluated,
      eligibleBeforeSend: dryRun.eligibleCount,
      sent: live.sentCount,
      skipped: live.skippedCount,
      duplicatesPrevented: live.duplicatesPrevented + liveSkips.duplicatesPrevented,
      activeSignaturesSkipped: liveSkips.activeSignaturesSkipped,
      alreadySignedSkipped: liveSkips.alreadySignedSkipped,
      invalidEmailSkipped: liveSkips.invalidEmailSkipped,
      failures: live.failedCount,
      queueRemaining,
      capReached: live.capReached,
      stoppedOnError: live.stoppedOnError,
      executionTimeMs: live.executionTimeMs,
      signatureRequestIds,
      sentDetails,
      executionItems: live.executionItems,
      exclusionSummary: live.exclusionSummary,
    },
    safetyFlags: {
      breezyWrites: false,
      maxSends: MAX_SENDS,
      stopOnFirstError: live.stoppedOnError,
      auditLoggingEnabled: true,
    },
    rollbackRecommendation: live.rollbackRecommendation,
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p154.6-live-send-after-csv-import.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p154.6-live-send-after-csv-import.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: live.failedCount === 0 && !live.stoppedOnError,
        jsonPath,
        mdPath,
        dryRunEligibility: {
          eligibleCount: dryRun.eligibleCount,
          projectedSendCount: dryRun.projectedSendCount,
          eligibleChangeNote,
        },
        liveCycle: {
          sent: live.sentCount,
          skipped: live.skippedCount,
          failures: live.failedCount,
          queueRemaining,
          signatureRequestIds,
        },
      },
      null,
      2,
    ),
  );

  if (live.failedCount > 0 || live.stoppedOnError) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
