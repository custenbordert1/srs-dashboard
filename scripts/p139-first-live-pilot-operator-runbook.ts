/**
 * P139 — First Live Pilot Operator Runbook
 * Usage: npx tsx scripts/p139-first-live-pilot-operator-runbook.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildFirstLivePilotOperatorRunbook,
  buildRunbookMarkdown,
} from "@/lib/p139-first-live-pilot-operator-runbook";

async function main() {
  const report = await buildFirstLivePilotOperatorRunbook();
  const jsonPath = path.join(process.cwd(), "artifacts", "p139-first-live-pilot-operator-runbook.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p139-first-live-pilot-operator-runbook.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    operator: report.operator,
    candidate: report.candidate,
    p137ReadinessStatus: report.p137ReadinessStatus,
    p138VerificationStatus: report.p138VerificationStatus,
    safetyChecklist: report.safetyChecklist,
    humanReviewChecklist: report.humanReviewChecklist,
    terminalCommands: report.terminalCommands,
    rollbackInstructions: report.rollbackInstructions,
    executeBatchCalled: report.executeBatchCalled,
    breezyWrites: report.breezyWrites,
    liveModeEnabled: report.liveModeEnabled,
    paperworkSent: report.paperworkSent,
    continuousRunnerEnabled: report.continuousRunnerEnabled,
  };

  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, buildRunbookMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        jsonPath,
        mdPath,
        candidateId: report.candidate.candidateId,
        candidateName: report.candidate.candidateName,
        p137GoNoGo: report.p137ReadinessStatus.goNoGo,
        p138OverallResult: report.p138VerificationStatus.overallResult,
        executeBatchCalled: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
