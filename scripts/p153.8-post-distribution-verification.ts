/**
 * P153.8 — Post-distribution end-to-end verification (dry run, no paperwork send)
 *
 * Usage: npx tsx scripts/p153.8-post-distribution-verification.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import { appendPipelineAdvancementAuditEvent } from "@/lib/p151-autonomous-candidate-advancement/p151-advancement-audit-store";
import { evaluateRecruiterAssignmentCandidate } from "@/lib/p151-autonomous-recruiter-assignment/evaluate-recruiter-assignment-candidate";
import { applyTerritoryDmAssignments } from "@/lib/p151-workflow-bottleneck-resolution/apply-territory-dm-assignments";
import {
  detectImmediatePaperworkHardBlockers,
  detectLegacyPaperworkBlockers,
  executeImmediatePaperworkPolicy,
  isP152ImmediatePaperworkEnabled,
  P152_BYPASSED_RULES,
} from "@/lib/p152-immediate-paperwork-policy";
import { applyRecruiterAssignments } from "@/lib/recruiter-assignment-engine/apply-recruiter-assignments";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import { RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD } from "@/lib/recruiter-assignment-engine/types";
import { evaluateCandidate } from "@/lib/recruiting/candidate-advancement-engine";
import {
  evaluateInitialPaperworkEligibility,
  P147_INITIAL_CONFIDENCE_MIN,
} from "@/lib/recruiting/initial-paperwork-execution-engine";
import { evaluatePaperworkCandidate } from "@/lib/recruiting/paperwork-automation-engine";
import { P99_LIVE_SEND } from "@/lib/live-send-readiness/types";

const TARGET = {
  candidateId: "705cdc0e7f30",
  name: "Taylor Custenborder",
  email: "custenborder.taylor@gmail.com",
  positionId: "f8f9afaa12b8",
  positionName: "Retail Display Merchandiser – West Chester, OH",
};

const SESSION = {
  userId: "p153.8-verification",
  email: "p153.8@local",
  name: "P153.8 Post-Distribution Verification",
  role: "executive" as const,
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    // ignore
  }
}

function isLiveSendOnlyBlocker(blocker: string): boolean {
  const lower = blocker.toLowerCase();
  return (
    lower.includes("live send") ||
    lower.includes("p152_immediate_paperwork_enabled") ||
    lower.includes("dry run") ||
    lower.includes("p99_live_send") ||
    lower.includes("p97_live_send") ||
    lower.includes("p84_live_send")
  );
}

function formatMarkdown(report: Record<string, unknown>): string {
  const summary = report.summary as Record<string, unknown>;
  const p151 = report.p151 as Record<string, unknown>;
  const applied = report.assignmentApplied as Record<string, unknown>;
  const stages = report.stages as Record<string, unknown>;
  const blockers = (report.remainingBlockers as string[]) ?? [];
  const lines = [
    "# P153.8 — Post-Distribution End-to-End Verification",
    "",
    `Generated: ${report.generatedAt}`,
    `Candidate: ${TARGET.name} (\`${TARGET.candidateId}\`)`,
    `Position: ${TARGET.positionName}`,
    "",
    "Dry run only — no paperwork sent.",
    "",
    "## P151 recruiter assignment",
    "",
    `- Recommendation: **${p151.recommendation}**`,
    `- Recommended recruiter: ${p151.recommendedRecruiter ?? "—"}`,
    `- Recommended DM: ${p151.recommendedDm ?? "—"}`,
    `- Territory: ${p151.territoryState ?? "—"}`,
    `- Confidence: ${p151.confidence}% (threshold ${RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD}%)`,
    `- Assignment applied: **${applied.applied}**`,
    applied.applied
      ? `- Assigned recruiter: **${applied.recruiter}**`
      : `- Skip reason: ${applied.skipReason ?? "—"}`,
    applied.applied ? `- Assigned DM: **${applied.dm}**` : "",
    "",
    "## Pipeline status (post-assignment)",
    "",
    `- Recruiter assigned: **${summary.recruiterAssigned}** (${summary.assignedRecruiter})`,
    `- DM assigned: **${summary.dmAssigned}** (${summary.assignedDm})`,
    `- Workflow status: **${summary.workflowStatus}**`,
    `- Paperwork queue: **${summary.paperworkQueueStatus}**`,
    `- P152 eligible: **${summary.p152Eligible}**`,
    `- Projected send (dry run): **${summary.projectedSend}**`,
    "",
    "## Stage results",
    "",
    `### P83 — ${(stages.p83 as Record<string, unknown>).action}`,
    "",
    String((stages.p83 as Record<string, unknown>).reason),
    "",
    `### P144 — ${(stages.p144 as Record<string, unknown>).nextAction} (${(stages.p144 as Record<string, unknown>).confidence}% confidence)`,
    "",
    `Blockers: ${((stages.p144 as Record<string, unknown>).blockers as string[]).join("; ") || "(none)"}`,
    "",
    `### P145 — ${(stages.p145 as Record<string, unknown>).recommendedAction ?? "not in queue"}`,
    "",
    String((stages.p145 as Record<string, unknown>).reason ?? "—"),
    "",
    `### P147 — eligible: ${(stages.p147 as Record<string, unknown>).eligible}`,
    "",
    String((stages.p147 as Record<string, unknown>).blockedReason ?? "No blockers."),
    "",
    `### P152 — eligible: ${(stages.p152 as Record<string, unknown>).eligible}`,
    "",
    `Projected send: ${(stages.p152 as Record<string, unknown>).projectedSend}`,
    "",
    "## Remaining blockers",
    "",
  ];
  if (blockers.length === 0) lines.push("- None");
  else for (const b of blockers) lines.push(`- ${b}`);

  lines.push("", "## Verdict", "", String(report.verdict));
  return `${lines.join("\n")}\n`;
}

async function evaluateStages(input: {
  candidate: BreezyCandidate;
  workflow: CandidateWorkflowRecord | undefined;
  jobsByPositionId: Map<string, BreezyJob>;
  publishedJobs: BreezyJob[];
  onboarding: Awaited<ReturnType<typeof listAllCandidateOnboardingRecords>>[number] | null;
  paperworkAudit: Awaited<ReturnType<typeof loadPaperworkAutomationAuditLog>>;
  referenceMs: number;
}) {
  const { candidate, workflow, jobsByPositionId, publishedJobs, onboarding, paperworkAudit, referenceMs } =
    input;
  const row = buildScoredWorkflowRow(candidate, workflow, {
    job: jobsByPositionId.get(candidate.positionId ?? ""),
  });
  const advancementOptions = { jobsByPositionId, paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE };
  const p83Decision = buildCandidateAdvancementDecision(row, advancementOptions);
  const advancement = evaluateCandidate({ row, jobsByPositionId, advancementOptions, referenceMs });
  const p145Context = { row, jobsByPositionId, onboarding, advancement, referenceMs };
  const queueItem = evaluatePaperworkCandidate(p145Context);
  const p147Eligibility = evaluateInitialPaperworkEligibility({
    context: p145Context,
    advancement,
    auditEvents: paperworkAudit,
    referenceMs,
    candidateFirstMode: false,
  });
  const p152Hard = detectImmediatePaperworkHardBlockers({
    row,
    candidate,
    onboarding,
    auditEvents: paperworkAudit,
  });
  const p152Legacy = detectLegacyPaperworkBlockers({
    row,
    jobsByPositionId,
    onboarding,
    auditEvents: paperworkAudit,
    referenceMs,
  });
  const p152Eligible = !p152Hard.blocked;

  const remainingBlockers: string[] = [];
  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    remainingBlockers.push("Recruiter not assigned.");
  }
  if (!row.assignedDM || row.assignedDM === "Unassigned") {
    remainingBlockers.push("DM not assigned.");
  }
  if (p152Hard.blocked) remainingBlockers.push(`P152: ${p152Hard.blockers[0]}`);
  if (!p147Eligibility.eligible) {
    remainingBlockers.push(
      p147Eligibility.blockedReason ??
        p147Eligibility.validation.reasons[0] ??
        `P147 blocked (confidence ${advancement.confidence}% < ${P147_INITIAL_CONFIDENCE_MIN}%)`,
    );
  }
  if (!queueItem || queueItem.recommendedAction !== "Send Initial Paperwork") {
    remainingBlockers.push(
      queueItem ? `P145: ${queueItem.recommendedAction}` : "P145: not in paperwork queue",
    );
  }
  if (p83Decision.requiresApproval) remainingBlockers.push("P83: requireApproval=true");
  for (const b of advancement.blockers) {
    if (!remainingBlockers.some((r) => r.includes(b))) remainingBlockers.push(`P144: ${b}`);
  }
  if (!isP152ImmediatePaperworkEnabled()) {
    remainingBlockers.push("P152_IMMEDIATE_PAPERWORK_ENABLED=false (live send disabled)");
  }
  if (!P99_LIVE_SEND) {
    remainingBlockers.push("P99_LIVE_SEND=false (live send disabled)");
  }

  return {
    row,
    p83Decision,
    advancement,
    queueItem,
    p147Eligibility,
    p152Eligible,
    p152ProjectedSend: p152Eligible,
    p152Hard,
    p152Legacy,
    p145Ready: queueItem?.recommendedAction === "Send Initial Paperwork",
    remainingBlockers,
  };
}

async function main() {
  loadEnvLocal();
  const referenceMs = Date.now();
  const generatedAt = new Date(referenceMs).toISOString();

  const resolved = await resolveCandidatesForRead({
    scanMode: "fast",
    force: true,
    candidateLookup: { email: TARGET.email, name: TARGET.name },
  });
  if (!resolved.ok) {
    console.error(resolved.error);
    process.exit(1);
  }

  const candidate = resolved.candidates.find((c) => c.candidateId === TARGET.candidateId);
  if (!candidate) {
    console.error("Target candidate not visible in platform read path.");
    process.exit(1);
  }

  const jobsResult = await fetchBreezyJobs();
  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(jobs.map((j) => [j.jobId, j]));
  const publishedJobs = jobs.filter((j) => j.status === "published");
  const bundle = await getCandidateWorkflowBundle();
  const workflows = { ...bundle.workflows };
  const onboardingRecords = await listAllCandidateOnboardingRecords();
  const onboarding = onboardingRecords.find((r) => r.candidateId === candidate.candidateId) ?? null;
  const paperworkAudit = await loadPaperworkAutomationAuditLog();
  const candidatesById = new Map([[candidate.candidateId, candidate]]);

  const rowBefore = buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
    job: jobsByPositionId.get(candidate.positionId ?? ""),
  });
  const assignmentDecisions = buildRecruiterAssignmentDecisions({
    candidates: [candidate],
    workflows,
    rosters: bundle.rosters,
    jobsByPositionId,
  });
  const assignment = assignmentDecisions.find((d) => d.candidateId === candidate.candidateId)!;
  const recruiterEval = evaluateRecruiterAssignmentCandidate({
    row: rowBefore,
    candidate,
    assignment,
    jobsByPositionId,
    publishedJobs,
    onboarding,
    referenceMs,
  });

  const stateCode = normalizeStateCode(candidate.state || rowBefore.state || "");
  const dmTerritory = stateCode ? (getDmForState(stateCode) ?? null) : null;
  const confidenceAcceptable =
    assignment.shouldAssign && assignment.confidence >= RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD;

  let assignmentApplied = false;
  let assignedRecruiter: string | null = null;
  let assignedDm: string | null = null;
  let skipReason: string | null = null;

  if (confidenceAcceptable) {
    const records = await applyRecruiterAssignments({
      decisions: [assignment],
      candidatesById,
      workflows,
      byUserId: SESSION.userId,
    });
    if (records.length > 0) {
      assignmentApplied = true;
      assignedRecruiter = records[0]!.assignedRecruiter;
      assignedDm = records[0]!.assignedDM ?? assignment.dmName;
      await appendPipelineAdvancementAuditEvent({
        type: "recruiter_assigned",
        candidateId: TARGET.candidateId,
        candidateName: TARGET.name,
        executed: true,
        simulated: false,
        reason: assignment.reason,
        metadata: {
          sourcePhase: "P153.8",
          recruiter: assignment.recruiter,
          confidence: assignment.confidence,
          territoryState: assignment.territoryState,
          dmName: assignment.dmName,
        },
      });
    }

    const dmRecords = await applyTerritoryDmAssignments({
      candidates: [candidate],
      workflows,
      jobsByPositionId,
      candidateIds: [TARGET.candidateId],
      byUserId: SESSION.userId,
    });
    if (dmRecords.length > 0) {
      assignedDm = dmRecords[0]!.assignedDM ?? assignedDm;
    }
  } else {
    skipReason = assignment.shouldAssign
      ? `Confidence ${assignment.confidence}% below threshold ${RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD}%.`
      : assignment.reason || recruiterEval.reason;
  }

  const postBundle = await getCandidateWorkflowBundle();
  const workflowAfter = postBundle.workflows[TARGET.candidateId];
  const stages = await evaluateStages({
    candidate,
    workflow: workflowAfter,
    jobsByPositionId,
    publishedJobs,
    onboarding,
    paperworkAudit,
    referenceMs,
  });

  const p152DryRun = await executeImmediatePaperworkPolicy({ session: SESSION, dryRun: true });
  const p152Row = p152DryRun.candidates.find((c) => c.candidateId === TARGET.candidateId) ?? null;

  const operationalBlockers = stages.remainingBlockers.filter((b) => !isLiveSendOnlyBlocker(b));
  const pipelineFullyOperational =
    operationalBlockers.length === 0 &&
    !isUnassignedRecruiter(workflowAfter?.assignedRecruiter ?? "Unassigned") &&
    Boolean(workflowAfter?.assignedDM && workflowAfter.assignedDM !== "Unassigned") &&
    stages.p152Eligible;

  const verdict = pipelineFullyOperational
    ? "Pipeline is fully operational. Remaining gates are live-send configuration only (P152_IMMEDIATE_PAPERWORK_ENABLED / P99_LIVE_SEND). No paperwork was sent."
    : `Pipeline not fully clear. Operational blockers: ${operationalBlockers.join("; ") || "(none)"}`;

  const report = {
    sourcePhase: "P153.8",
    generatedAt,
    dryRun: true,
    liveSendPerformed: false,
    target: TARGET,
    p151: {
      recommendation: recruiterEval.recommendation,
      recommendedRecruiter: assignment.recruiter || null,
      recommendedDm: assignment.dmName ?? dmTerritory,
      territoryState: assignment.territoryState ?? stateCode,
      confidence: assignment.confidence,
      confidenceThreshold: RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD,
      confidenceAcceptable,
      shouldAssign: assignment.shouldAssign,
      reason: assignment.reason,
      recruiterEvalReason: recruiterEval.reason,
      autoAssignEligible: recruiterEval.autoAssignEligible,
    },
    assignmentApplied: {
      applied: assignmentApplied,
      recruiter: assignedRecruiter ?? workflowAfter?.assignedRecruiter ?? null,
      dm: assignedDm ?? workflowAfter?.assignedDM ?? null,
      skipReason,
    },
    summary: {
      recruiterAssigned: !isUnassignedRecruiter(workflowAfter?.assignedRecruiter ?? "Unassigned"),
      assignedRecruiter: workflowAfter?.assignedRecruiter ?? "Unassigned",
      dmAssigned: Boolean(workflowAfter?.assignedDM && workflowAfter.assignedDM !== "Unassigned"),
      assignedDm: workflowAfter?.assignedDM ?? "Unassigned",
      workflowStatus: workflowAfter?.workflowStatus ?? stages.row.workflowStatus,
      paperworkQueueStatus: stages.queueItem?.recommendedAction ?? "not in queue",
      p152Eligible: stages.p152Eligible,
      projectedSend: stages.p152ProjectedSend && p152Row?.eligible === true,
      pipelineFullyOperational,
    },
    stages: {
      p83: {
        action: stages.p83Decision.action,
        shouldAdvance: stages.p83Decision.shouldAdvance,
        requiresApproval: stages.p83Decision.requiresApproval,
        reason: stages.p83Decision.reason,
      },
      p144: {
        nextAction: stages.advancement.nextAction,
        confidence: stages.advancement.confidence,
        automationEligible: stages.advancement.automationEligible,
        blockers: stages.advancement.blockers,
        warnings: stages.advancement.warnings ?? [],
      },
      p145: {
        inQueue: Boolean(stages.queueItem),
        recommendedAction: stages.queueItem?.recommendedAction ?? null,
        reason: stages.queueItem?.reason ?? null,
        ready: stages.p145Ready,
      },
      p147: {
        eligible: stages.p147Eligibility.eligible,
        blockedReason: stages.p147Eligibility.blockedReason,
        validationReasons: stages.p147Eligibility.validation.reasons,
        confidenceThreshold: P147_INITIAL_CONFIDENCE_MIN,
      },
      p152: {
        eligible: stages.p152Eligible,
        projectedSend: stages.p152ProjectedSend,
        dryRunRow: p152Row,
        hardBlockers: stages.p152Hard.blockers,
        legacyBypassed: P152_BYPASSED_RULES,
        p152Enabled: isP152ImmediatePaperworkEnabled(),
        p99LiveSend: P99_LIVE_SEND,
      },
    },
    remainingBlockers: stages.remainingBlockers,
    operationalBlockers,
    liveSendBlockers: stages.remainingBlockers.filter(isLiveSendOnlyBlocker),
    verdict,
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p153.8-post-distribution-verification.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p153.8-post-distribution-verification.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatMarkdown(report), "utf8");

  console.log("P153.8 — POST-DISTRIBUTION VERIFICATION");
  console.log(`P151: ${recruiterEval.recommendation} | ${assignment.recruiter} @ ${assignment.confidence}%`);
  console.log(`Applied: ${assignmentApplied} | recruiter=${report.summary.assignedRecruiter} | DM=${report.summary.assignedDm}`);
  console.log(`Workflow: ${report.summary.workflowStatus} | P145: ${report.summary.paperworkQueueStatus}`);
  console.log(`P152 eligible: ${report.summary.p152Eligible} | projected send: ${report.summary.projectedSend}`);
  console.log(verdict);
  console.log(JSON.stringify({ ok: true, jsonPath, mdPath, summary: report.summary, verdict }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
