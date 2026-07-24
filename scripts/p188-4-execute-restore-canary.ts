/**
 * Gated P188.4 restore canary entrypoint.
 * Refuses unless P188_OWNERSHIP_RESTORE_EXECUTION=true, --allow-production-writes, and --token.
 */
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadP158AssignmentAuditLog } from "@/lib/p158-autonomous-recruiter-assignment";
import {
  buildRestorePreview,
  executeOwnershipRestoreBatch,
  packageRestoreCanary,
  P188_4_RESTORE_CANARY_SIZE,
} from "@/lib/p188-4-recruiter-ownership-durability";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const allow = process.argv.includes("--allow-production-writes");
  const token = arg("--token");
  const limit = Number(arg("--limit") ?? P188_4_RESTORE_CANARY_SIZE);

  const workflows = Object.values(await getCandidateWorkflowState());
  const breezy = Object.values((await readIngestionStore()).candidates ?? {});
  const p158 = await loadP158AssignmentAuditLog();
  const preview = await buildRestorePreview({
    workflows,
    breezyCandidates: breezy,
    p158Events: p158,
  });
  const batch = packageRestoreCanary(preview.bucketA, limit);

  const result = await executeOwnershipRestoreBatch({
    candidates: batch,
    actor: "operator-canary",
    actorRole: "operator",
    reason: "P188.4 controlled restore canary",
    operatorAuthorizationToken: token,
    allowProductionWrites: allow,
    forceFlags: {
      restoreExecution: process.env.P188_OWNERSHIP_RESTORE_EXECUTION === "true",
    },
  });

  console.log(JSON.stringify({ batchSize: batch.length, result }, null, 2));
  if (!result.executed) process.exit(2);
  if (result.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
