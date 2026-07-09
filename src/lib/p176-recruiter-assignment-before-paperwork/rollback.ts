import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { P176_SOURCE_PHASE } from "@/lib/p176-recruiter-assignment-before-paperwork/types";

export async function writeP176WorkflowRollback(input: {
  runId: string;
  workflows: Record<string, CandidateWorkflowRecord>;
}): Promise<string> {
  const rollbackDir = path.join(recruitingDataDir(), "rollback");
  await mkdir(rollbackDir, { recursive: true });
  const rollbackPath = path.join(rollbackDir, `p176-workflow-${input.runId}.json`);
  await writeFile(
    rollbackPath,
    `${JSON.stringify(
      {
        sourcePhase: P176_SOURCE_PHASE,
        createdAt: new Date().toISOString(),
        runId: input.runId,
        workflows: input.workflows,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return rollbackPath;
}
