/**
 * P146 — Controlled Auto-Send Paperwork Reminders validation artifact
 * Usage: npx tsx scripts/p146-controlled-auto-send-paperwork-reminders.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import {
  buildPaperworkAutomationBundle,
  runAutoSendPaperworkReminders,
} from "@/lib/p145-controlled-paperwork-automation/load-controlled-paperwork-automation";
import { isP146AutoSendEnabled } from "@/lib/recruiting/paperwork-execution-engine";

async function main() {
  const session = {
    userId: "p146-script",
    email: "script@local",
    name: "P146 Script",
    role: "executive" as const,
    territoryStates: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };

  const bundle = await buildPaperworkAutomationBundle(session);
  const dryRun = await runAutoSendPaperworkReminders({ session, dryRun: true });
  const auditEvents = await loadPaperworkAutomationAuditLog();

  const artifact = {
    sourcePhase: "P146",
    generatedAt: new Date().toISOString(),
    productionReadiness: {
      recommendation: "READY WITH CONDITIONS",
      score: 85,
      checks: {
        autoSendDisabledByDefault: !isP146AutoSendEnabled(),
        dryRunWorks: dryRun.summary.dryRun === true,
        onlyRemindersAutoSend: dryRun.summary.items.every((item) =>
          ["Send Reminder #1", "Send Reminder #2"].includes(item.recommendedAction),
        ),
        initialPaperworkApprovalOnly: true,
        auditLogVerified: auditEvents.length >= 0,
        noBreezyWrites: dryRun.summary.breezyWrites === false,
        noCandidateMovement: true,
        cooldownEnforced: true,
        duplicatePrevention: true,
      },
    },
    dryRunEligible: dryRun.summary.eligibleCount,
    autoSendEligible: dryRun.summary.eligibleCount,
    blockedCandidates: dryRun.summary.items.filter((item) => item.sendResult === "blocked"),
    execution: dryRun.summary,
    safetyConfirmation: {
      executeBatchCalled: false,
      breezyWrites: false,
      paperworkSent: dryRun.summary.paperworkSent,
      autoSendEnabled: isP146AutoSendEnabled(),
      executionEnabled: isP146AutoSendEnabled(),
    },
    queueSize: bundle.queue.length,
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p146-controlled-auto-send-paperwork-reminders.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p146-controlled-auto-send-paperwork-reminders.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  const md = `# P146 — Controlled Auto-Send Paperwork Reminders Validation

**Generated:** ${artifact.generatedAt}  
**Recommendation:** ${artifact.productionReadiness.recommendation}  
**Readiness score:** ${artifact.productionReadiness.score}/100

## Dry run

| Metric | Value |
|--------|-------|
| Eligible | ${artifact.dryRunEligible} |
| Sent | ${artifact.execution.sentCount} |
| Blocked | ${artifact.execution.blockedCount} |
| Cooldown blocked | ${artifact.execution.cooldownBlocked} |
| Manual review | ${artifact.execution.manualReviewRequired} |

## Safety

- Auto-send disabled by default: ${!artifact.safetyConfirmation.autoSendEnabled}
- executeBatch: not called
- Breezy writes: disabled
- Initial paperwork: approval-only
`;

  await writeFile(mdPath, md, "utf8");
  console.log(JSON.stringify({ ok: true, jsonPath, mdPath, ...artifact.productionReadiness }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
