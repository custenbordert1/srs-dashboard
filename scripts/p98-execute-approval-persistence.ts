/**
 * P98 — Execute approval persistence for all 27 P97 queue candidates.
 * Usage: npx tsx scripts/p98-execute-approval-persistence.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { executeApprovalModePersistence } from "@/lib/approval-mode-production";
import { buildApprovalModeProductionFromStores } from "@/lib/approval-mode-production";
import { buildP84SendQueuePreviewFromStores } from "@/lib/p84-send-queue-preview";
import { loadP97State, p97AuditLogPath, p97RollbackPath } from "@/lib/approval-mode-production/approval-mode-store";
import { loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";

function loadEnvLocal(): void {
  try {
    const envPath = path.resolve(".env.local");
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // use process env
  }
}

async function main() {
  loadEnvLocal();

  const p96Path = path.join(process.cwd(), ".data/p96-p84-send-queue-preview.json");
  const p96 = JSON.parse(readFileSync(p96Path, "utf8")) as {
    sendQueue: Array<{ candidateId: string }>;
  };
  const candidateIds = p96.sendQueue.map((e) => e.candidateId);

  const p84Flags = await loadP84FeatureFlags();
  if (p84Flags.liveSend) {
    throw new Error("P98 blocked: P84 liveSend is enabled.");
  }

  const result = await executeApprovalModePersistence({
    candidateIds,
    approvedBy: "P98 Executive Dry Run",
    approvedByUserId: "p98-execute-script",
    mtdOnly: true,
  });

  const [p97Report, p84Preview, state, workflows] = await Promise.all([
    buildApprovalModeProductionFromStores({ mtdOnly: true }),
    buildP84SendQueuePreviewFromStores({ mtdOnly: true }),
    loadP97State(),
    getCandidateWorkflowState(),
  ]);

  const verification = result.persisted.map((id) => {
    const w = workflows[id];
    return {
      candidateId: id,
      assignedRecruiter: w?.assignedRecruiter,
      assignedDM: w?.assignedDM,
      workflowStatus: w?.workflowStatus,
      actionType: w?.actionType,
    };
  });

  const sample = p97Report.queue.find((q) => q.candidateId === "6d548b240ab0") ?? p97Report.queue[0];

  console.log(
    JSON.stringify(
      {
        persistedCount: result.persisted.length,
        skipped: result.skipped,
        p97Metrics: p97Report.metrics,
        p84PreviewMetrics: p84Preview.metrics,
        rollbackCount: state.persisted.length,
        auditLogPath: p97AuditLogPath(),
        rollbackArtifactPath: p97RollbackPath(),
        liveSend: false,
        p84Flags: { ...p84Flags, liveSend: false },
        verificationSample: verification.slice(0, 3),
        samplePersistedTrace: sample,
        remainingBlockersBeforeLivePaperwork: p97Report.remainingBlockersBeforeLivePaperwork,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
