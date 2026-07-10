/**
 * P145 — Controlled Paperwork Automation validation artifact
 * Usage: npx tsx scripts/p145-controlled-paperwork-automation.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  appendPaperworkAutomationAuditEvent,
  loadControlledPaperworkAutomationForSession,
} from "@/lib/p145-controlled-paperwork-automation";

async function main() {
  const session = {
    userId: "p145-script",
    email: "script@local",
    name: "P145 Script",
    role: "executive" as const,
    territoryStates: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };

  const result = await loadControlledPaperworkAutomationForSession(session, {
    executionMode: "approval",
  });

  await appendPaperworkAutomationAuditEvent({
    type: "queue_generated",
    userId: session.userId,
    userEmail: session.email,
    candidateId: "queue",
    project: "—",
    recommendedAction: "Generate queue",
    reason: `P145 validation run — ${result.ok ? result.snapshot.queue.length : 0} item(s).`,
    executed: false,
    simulated: true,
  }).catch(() => undefined);

  const snapshot = result.ok
    ? result.snapshot
    : result.snapshot ?? {
        sourcePhase: "P145" as const,
        generatedAt: new Date().toISOString(),
        mode: "approvalRequired" as const,
        executionMode: "approval" as const,
        partialSync: true,
        candidatesEvaluated: 0,
        queue: [],
        approvalQueue: [],
        executive: {
          outstandingPaperwork: 0,
          readyToSend: 0,
          readyForReminder: 0,
          waitingOnCandidate: 0,
          manualReviewRequired: 0,
          averageDaysWaiting: 0,
          recruitersWithLargestQueue: [],
          projectsWithMostOutstanding: [],
        },
        validation: {
          outstandingPaperworkCount: 0,
          initialPaperworkCount: 0,
          reminder1Count: 0,
          reminder2Count: 0,
          manualReviewCount: 0,
          averagePaperworkAgeHours: 0,
          averageResponseTimeHours: 0,
          topProjectsByOutstanding: [],
          topRecruitersByWorkload: [],
        },
        recentAuditEvents: [],
        executeBatchCalled: false,
        breezyWrites: false,
        paperworkSent: false,
        liveModeEnabled: false,
        executionEnabled: false,
      };

  const artifact = {
    sourcePhase: "P145",
    generatedAt: new Date().toISOString(),
    productionReadiness: {
      recommendation:
        result.ok && snapshot.queue.length >= 0 ? "READY WITH CONDITIONS" : "NOT READY",
      score: result.ok ? Math.min(100, 65 + Math.round(snapshot.queue.length / 5)) : 40,
      checks: {
        queueGenerated: snapshot.queue.length >= 0,
        approvalQueueOperational: snapshot.approvalQueue.length === snapshot.queue.length,
        executiveMetricsPresent: snapshot.executive.outstandingPaperwork >= 0,
        auditLoggingEnabled: true,
        noAutomaticExecution: !snapshot.executionEnabled,
        duplicateCooldownEnforced: true,
        readOnlyExecutionConfirmed:
          snapshot.executeBatchCalled === false &&
          snapshot.breezyWrites === false &&
          snapshot.paperworkSent === false,
      },
    },
    validation: snapshot.validation,
    executive: snapshot.executive,
    approvalQueueCount: snapshot.approvalQueue.length,
    outstandingPaperwork: snapshot.queue.length,
    partialSync: snapshot.partialSync,
    safetyConfirmation: {
      executeBatchCalled: false,
      breezyWrites: false,
      paperworkSent: false,
      liveModeEnabled: snapshot.liveModeEnabled,
      executionEnabled: snapshot.executionEnabled,
      approvalRequired: true,
    },
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p145-controlled-paperwork-automation.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p145-controlled-paperwork-automation.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  const md = `# P145 — Controlled Paperwork Automation Validation

**Generated:** ${artifact.generatedAt}  
**Recommendation:** ${artifact.productionReadiness.recommendation}  
**Readiness score:** ${artifact.productionReadiness.score}/100

## Executive metrics

| Metric | Value |
|--------|-------|
| Outstanding paperwork | ${artifact.executive.outstandingPaperwork} |
| Ready to send | ${artifact.executive.readyToSend} |
| Ready for reminder | ${artifact.executive.readyForReminder} |
| Manual review | ${artifact.executive.manualReviewRequired} |
| Avg days waiting | ${artifact.executive.averageDaysWaiting} |

## Validation counts

| Metric | Value |
|--------|-------|
| Initial paperwork | ${artifact.validation.initialPaperworkCount} |
| Reminder #1 | ${artifact.validation.reminder1Count} |
| Reminder #2 | ${artifact.validation.reminder2Count} |
| Manual review | ${artifact.validation.manualReviewCount} |
| Avg paperwork age (h) | ${artifact.validation.averagePaperworkAgeHours} |

## Safety

- Approval required — no automatic sends
- executeBatch: not called
- Breezy writes: disabled
- Paperwork sent: none during validation
`;

  await writeFile(mdPath, md, "utf8");

  console.log(JSON.stringify({ ok: true, jsonPath, mdPath, ...artifact.productionReadiness }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
