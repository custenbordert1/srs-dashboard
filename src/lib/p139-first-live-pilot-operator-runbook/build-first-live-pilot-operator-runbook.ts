import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { buildApprovalDecisionsFromContext } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
import { loadPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { p100AuditLogPath } from "@/lib/controlled-live-send/controlled-live-send-store";
import { ONBOARDING_TEMPLATE_REGISTRY } from "@/lib/onboarding-template-registry";
import { P122_CONFIRMATION_PHRASE } from "@/lib/p122-controlled-live-paperwork-pilot/types";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { buildFirstLiveSendReadinessGate } from "@/lib/p137-first-live-send-readiness-gate/build-first-live-send-readiness-gate";
import { buildFirstLiveSendVerification } from "@/lib/p138-first-live-send-verification/build-first-live-send-verification";
import { formatRunbookMarkdown } from "@/lib/p139-first-live-pilot-operator-runbook/format-runbook-markdown";
import type {
  FirstLivePilotOperatorRunbookReport,
  HumanReviewChecklistItem,
  RollbackInstructions,
  TerminalCommands,
} from "@/lib/p139-first-live-pilot-operator-runbook/types";
import {
  P139_OPERATOR_NAME,
  P139_RUNBOOK_MODE,
  P139_SOURCE_PHASE,
  P139_TARGET_CANDIDATE_ID,
  P139_TARGET_CANDIDATE_NAME,
} from "@/lib/p139-first-live-pilot-operator-runbook/types";

function buildHumanReviewChecklist(input: {
  candidateName: string;
  email: string;
  breezyJobOrProject: string;
  templateLabel: string;
}): HumanReviewChecklistItem[] {
  return [
    {
      id: "correct_candidate",
      label: "Correct candidate",
      breezyField: "Candidate name",
      expectedValue: input.candidateName,
      instruction: "Open Erica's Breezy profile and confirm name matches exactly.",
    },
    {
      id: "correct_email",
      label: "Correct email",
      breezyField: "Email",
      expectedValue: input.email,
      instruction: "Confirm email on file matches before Dropbox Sign send.",
    },
    {
      id: "correct_job",
      label: "Correct job/project",
      breezyField: "Position / job",
      expectedValue: input.breezyJobOrProject,
      instruction: "Confirm candidate is on the published Breezy job shown above.",
    },
    {
      id: "correct_template",
      label: "Correct paperwork packet/template",
      breezyField: "Paperwork template",
      expectedValue: input.templateLabel,
      instruction: "Confirm paperwork template matches onboarding packet for this pilot.",
    },
    {
      id: "not_already_sent",
      label: "Not already sent",
      breezyField: "Paperwork status",
      expectedValue: "not_sent",
      instruction: "Confirm no prior Dropbox Sign request or paperwork-sent status in Breezy.",
    },
    {
      id: "not_duplicate",
      label: "Not duplicate",
      breezyField: "Duplicate check",
      expectedValue: "no duplicate risk",
      instruction: "Confirm no duplicate candidate record or prior send for this person.",
    },
    {
      id: "ready_for_paperwork",
      label: "Candidate ready for paperwork",
      breezyField: "Workflow stage",
      expectedValue: "Paperwork Needed / ready",
      instruction: "Confirm questionnaire/resume complete and recruiter assigned if required.",
    },
  ];
}

function buildTerminalCommands(candidateId: string): TerminalCommands {
  return {
    enablePilotEnv: [
      "export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true",
      "export AUTONOMOUS_PAPERWORK_LIVE_MODE=true",
      "export AUTONOMOUS_PAPERWORK_OPERATOR_GO=true",
      `export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST="${candidateId}"`,
      "export AUTONOMOUS_PAPERWORK_PILOT_MAX_SENDS=1",
    ],
    allowlistEricaOnly: `export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST="${candidateId}"`,
    p122LivePilotCommand: `npx tsx scripts/p122-controlled-live-paperwork-pilot.ts --execute --confirm "${P122_CONFIRMATION_PHRASE}" --candidate-id ${candidateId}`,
    p138VerificationCommand: `npx tsx scripts/p138-first-live-send-verification.ts --candidate-id=${candidateId}`,
    disableLiveEnv: [
      "export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=false",
      "export AUTONOMOUS_PAPERWORK_LIVE_MODE=false",
      "export AUTONOMOUS_PAPERWORK_OPERATOR_GO=false",
      'export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST=""',
    ],
    pauseSchedulerCommand:
      'npx tsx -e "import { pauseScheduler } from \'./src/lib/p136-autonomous-paperwork-scheduler/scheduler-controls.ts\'; pauseScheduler().then((s) => console.log(JSON.stringify({ schedulerMode: s.schedulerMode, schedulerStatus: s.schedulerStatus }, null, 2)))"',
  };
}

function buildRollbackInstructions(candidateId: string): RollbackInstructions {
  const auditPath = p100AuditLogPath();
  return {
    confirmNoSecondSend: [
      "Run P138 verification — expect overallResult PASS and pilotLockStatus Locked after first send.",
      "Check pilot registry: `.data/p122-controlled-live-paperwork-pilot-registry.json` — sendCount must be 1.",
      `Confirm only one audit entry with outcome \"sent\" for ${candidateId}.`,
      "Re-run P122 live command — must NOT send again (pilot cap / duplicate guard).",
    ],
    clearAllowlist: [
      'export AUTONOMOUS_PAPERWORK_PILOT_ALLOWLIST=""',
      "export AUTONOMOUS_PAPERWORK_OPERATOR_GO=false",
      "export AUTONOMOUS_PAPERWORK_LIVE_MODE=false",
      "export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=false",
      "P138 safety lock also records required env lockdown — follow artifact recommendations.",
    ],
    pauseScheduler: [
      "Before live send: pause P136 scheduler (command in Terminal Commands section).",
      "POST /api/autonomous-paperwork-scheduler/pause (executive auth) if dashboard is running.",
      "Do not start continuous mode or P125 continuous runner for this pilot.",
    ],
    verifyDuplicateProtection: [
      `npx tsx scripts/p138-first-live-send-verification.ts --candidate-id=${candidateId}`,
      "Expect duplicateVerification.wouldBlockResend=true after successful send.",
      `grep "${candidateId}" .data/p100-controlled-live-send-state.json — candidate in sentCandidateIds.`,
    ],
    confirmAuditRecord: [
      `tail -5 ${auditPath}`,
      `grep "${candidateId}" ${auditPath} — expect outcome \"sent\", mode \"executeOne\".`,
      "Workflow should show actionType=await-signature and paperworkStatus=sent.",
      "Dropbox Sign signatureRequestId stored on workflow record.",
    ],
  };
}

export async function buildFirstLivePilotOperatorRunbook(input?: {
  candidateId?: string;
}): Promise<FirstLivePilotOperatorRunbookReport> {
  const candidateId = input?.candidateId ?? P139_TARGET_CANDIDATE_ID;
  const pilotConfig = loadPilotConfig();

  const [p137, p138Preview, context, ingestion] = await Promise.all([
    buildFirstLiveSendReadinessGate(),
    buildFirstLiveSendVerification({ candidateId, applySafetyLock: false }),
    loadPaperworkCandidates({ mtdOnly: false }),
    readIngestionStore(),
  ]);

  const approvalDecisions = buildApprovalDecisionsFromContext(context);
  const approval = approvalDecisions.find((d) => d.candidateId === candidateId);
  const row = context.rowsByCandidateId.get(candidateId) ?? null;
  const ingested = ingestion.candidates[candidateId];

  const autoApprovedIds = approvalDecisions
    .filter((d) => d.approvalDecision === "AUTO_APPROVED")
    .map((d) => d.candidateId);

  const p137Candidate =
    p137.selectedCandidate.candidateId === candidateId
      ? p137.selectedCandidate
      : p137.backupCandidates.find((c) => c.candidateId === candidateId) ?? p137.selectedCandidate;

  const templateKey = (p137Candidate.templateKey ?? row?.paperworkTemplateKey ?? "onboarding_packet") as keyof typeof ONBOARDING_TEMPLATE_REGISTRY;
  const templateDef = ONBOARDING_TEMPLATE_REGISTRY[templateKey] ?? ONBOARDING_TEMPLATE_REGISTRY.onboarding_packet;

  const breezyJobOrProject =
    p137Candidate.projectLabel ?? row?.positionName ?? ingested?.positionName ?? "—";
  const email = p137Candidate.email || approval?.email || row?.email || ingested?.email || "";
  const phone = ingested?.phone?.trim() || null;
  const candidateName =
    candidateId === P139_TARGET_CANDIDATE_ID
      ? P139_TARGET_CANDIDATE_NAME
      : p137Candidate.candidateName || approval?.candidateName || row
        ? `${row?.firstName ?? ""} ${row?.lastName ?? ""}`.trim()
        : candidateId;

  const safetyChecklist = [
    ...p137.safetyChecks.map((check) => ({
      id: check.id,
      label: check.label,
      passed: check.passed,
      detail: check.detail,
    })),
    {
      id: "no_execute_batch",
      label: "No executeBatch",
      passed: true,
      detail: "executeOne only — executeBatch forbidden.",
    },
    {
      id: "no_breezy_writes",
      label: "No Breezy writes from automation",
      passed: true,
      detail: "Taylor verifies in Breezy UI; automation is read-only.",
    },
    {
      id: "pilot_cap_one",
      label: "Pilot cap = 1",
      passed: pilotConfig.maxSends === 1,
      detail: `maxSends=${pilotConfig.maxSends}`,
    },
    {
      id: "live_mode_off_by_default",
      label: "Live mode disabled by default",
      passed: !pilotConfig.liveModeEnabled,
      detail: pilotConfig.liveModeEnabled ? "Live mode env is ON — unset before review." : "Live mode off.",
    },
    {
      id: "continuous_mode_off",
      label: "Continuous mode disabled",
      passed: process.env.P125_RUNNER_CONTINUOUS_ENABLED !== "true",
      detail: "Do not enable P125 continuous runner for first pilot.",
    },
  ];

  const terminalCommands = buildTerminalCommands(candidateId);
  const rollbackInstructions = buildRollbackInstructions(candidateId);

  const markdownPath = "artifacts/p139-first-live-pilot-operator-runbook.md";
  const jsonPath = "artifacts/p139-first-live-pilot-operator-runbook.json";

  const report: FirstLivePilotOperatorRunbookReport = {
    sourcePhase: P139_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P139_RUNBOOK_MODE,
    operator: P139_OPERATOR_NAME,
    candidate: {
      candidateId,
      candidateName,
      email,
      phone,
      breezyJobOrProject,
      dropboxSignTemplate: templateDef.label,
      dropboxSignTemplateKey: templateKey,
      approvalScore: approval?.approvalScore ?? p137Candidate.approvalScore,
      p124ApprovalDecision: approval?.approvalDecision ?? p137Candidate.approvalDecision,
      positionId: row?.positionId ?? ingested?.positionId ?? null,
    },
    p137ReadinessStatus: {
      goNoGo: p137.goNoGo,
      goNoGoReason: p137.goNoGoReason,
      designatedTargetInAutoApprovedCohort: autoApprovedIds.includes(candidateId),
      isP137PrimarySelection: p137.selectedCandidate.candidateId === candidateId,
      safetyRankScore: p137Candidate.safetyRankScore ?? null,
      confirmations: p137Candidate.confirmations,
    },
    p138VerificationStatus: {
      overallResult: p138Preview.overallResult,
      goNoGo: p138Preview.goNoGo,
      goNoGoReason: p138Preview.goNoGoReason,
      pilotLockApplied: p138Preview.safetyLockStatus.applied,
      note:
        p138Preview.overallResult === "FAIL"
          ? "Expected before live send — re-run P138 after P122 executeOne completes."
          : "Post-send verification passed — pilot should be locked.",
    },
    safetyChecklist,
    humanReviewChecklist: buildHumanReviewChecklist({
      candidateName,
      email,
      breezyJobOrProject,
      templateLabel: templateDef.label,
    }),
    terminalCommands,
    rollbackInstructions,
    markdownPath,
    jsonPath,
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
    continuousRunnerEnabled: process.env.P125_RUNNER_CONTINUOUS_ENABLED === "true",
  };

  return report;
}

export function buildRunbookMarkdown(report: FirstLivePilotOperatorRunbookReport): string {
  return formatRunbookMarkdown(report);
}
