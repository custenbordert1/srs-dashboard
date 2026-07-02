import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRunbookMarkdown,
  formatRunbookMarkdown,
} from "@/lib/p139-first-live-pilot-operator-runbook";
import type { FirstLivePilotOperatorRunbookReport } from "@/lib/p139-first-live-pilot-operator-runbook/types";
import {
  P139_TARGET_CANDIDATE_ID,
  P139_TARGET_CANDIDATE_NAME,
} from "@/lib/p139-first-live-pilot-operator-runbook/types";

function sampleReport(): FirstLivePilotOperatorRunbookReport {
  return {
    sourcePhase: "P139",
    generatedAt: "2026-07-02T00:00:00.000Z",
    mode: "runbookOnly",
    operator: "Taylor",
    candidate: {
      candidateId: P139_TARGET_CANDIDATE_ID,
      candidateName: P139_TARGET_CANDIDATE_NAME,
      email: "gigizen8@gmail.com",
      phone: "555-0100",
      breezyJobOrProject: "In-Store Merchandiser — Massena, NY (Massena, NY)",
      dropboxSignTemplate: "Onboarding Packet",
      dropboxSignTemplateKey: "onboarding_packet",
      approvalScore: 93,
      p124ApprovalDecision: "AUTO_APPROVED",
      positionId: "job-massena",
    },
    p137ReadinessStatus: {
      goNoGo: "GO WITH CONDITIONS",
      goNoGoReason: "Enable env gates before live send.",
      designatedTargetInAutoApprovedCohort: true,
      isP137PrimarySelection: true,
      safetyRankScore: 693,
      confirmations: {
        validEmail: true,
        noDuplicateRisk: true,
        noAlreadySent: true,
        publishedJobOrApprovedMapping: true,
        templateAvailable: true,
        cleanAuditHistory: true,
      },
    },
    p138VerificationStatus: {
      overallResult: "FAIL",
      goNoGo: "FAIL",
      goNoGoReason: "No pilot send yet.",
      pilotLockApplied: false,
      note: "Expected before live send.",
    },
    safetyChecklist: [
      { id: "no_execute_batch", label: "No executeBatch", passed: true, detail: "executeOne only." },
    ],
    humanReviewChecklist: [
      {
        id: "correct_candidate",
        label: "Correct candidate",
        breezyField: "Candidate name",
        expectedValue: P139_TARGET_CANDIDATE_NAME,
        instruction: "Verify in Breezy.",
      },
    ],
    terminalCommands: {
      enablePilotEnv: ["export AUTONOMOUS_PAPERWORK_LIVE_MODE=true"],
      allowlistEricaOnly: `export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST="${P139_TARGET_CANDIDATE_ID}"`,
      p122LivePilotCommand: `npx tsx scripts/p122-controlled-live-paperwork-pilot.ts --execute --confirm "SEND 1 PAPERWORK PACKET" --candidate-id ${P139_TARGET_CANDIDATE_ID}`,
      p138VerificationCommand: `npx tsx scripts/p138-first-live-send-verification.ts --candidate-id=${P139_TARGET_CANDIDATE_ID}`,
      disableLiveEnv: ["export AUTONOMOUS_PAPERWORK_LIVE_MODE=false"],
      pauseSchedulerCommand: "npx tsx -e pause",
    },
    rollbackInstructions: {
      confirmNoSecondSend: ["Check sendCount=1"],
      clearAllowlist: ['export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST=""'],
      pauseScheduler: ["Pause P136 scheduler"],
      verifyDuplicateProtection: ["Run P138"],
      confirmAuditRecord: ["tail audit log"],
    },
    markdownPath: "artifacts/p139-first-live-pilot-operator-runbook.md",
    jsonPath: "artifacts/p139-first-live-pilot-operator-runbook.json",
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: false,
    paperworkSent: false,
    continuousRunnerEnabled: false,
  };
}

describe("p139-first-live-pilot-operator-runbook", () => {
  it("targets Erica C Portolese", () => {
    assert.equal(P139_TARGET_CANDIDATE_ID, "e72d6aebdb0d");
    assert.equal(P139_TARGET_CANDIDATE_NAME, "Erica C Portolese");
  });

  it("formats markdown with required sections", () => {
    const md = formatRunbookMarkdown(sampleReport());
    assert.ok(md.includes("First Live Pilot Operator Runbook"));
    assert.ok(md.includes(P139_TARGET_CANDIDATE_NAME));
    assert.ok(md.includes(P139_TARGET_CANDIDATE_ID));
    assert.ok(md.includes("Human review checklist"));
    assert.ok(md.includes("Terminal commands"));
    assert.ok(md.includes("Rollback / stop instructions"));
    assert.ok(md.includes("SEND 1 PAPERWORK PACKET"));
    assert.ok(md.includes("p138-first-live-send-verification"));
  });

  it("buildRunbookMarkdown delegates to formatter", () => {
    const md = buildRunbookMarkdown(sampleReport());
    assert.ok(md.includes("Taylor"));
  });

  it("sample report enforces runbook-only safety", () => {
    const report = sampleReport();
    assert.equal(report.mode, "runbookOnly");
    assert.equal(report.executeBatchCalled, false);
    assert.equal(report.breezyWrites, false);
    assert.equal(report.paperworkSent, false);
    assert.equal(report.liveModeEnabled, false);
    assert.ok(report.humanReviewChecklist.length >= 1);
    assert.ok(report.terminalCommands.enablePilotEnv.length >= 1);
    assert.ok(report.rollbackInstructions.confirmNoSecondSend.length > 0);
  });
});
