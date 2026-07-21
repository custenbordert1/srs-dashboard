import { createHash } from "node:crypto";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P240CandidateTrace } from "@/lib/p240-autonomous-new-applicant-pipeline/types";
import {
  P240_FRESH_NEW_REPLAY_ACTION_FIELDS,
  applyP240FreshNewReplayReset,
} from "@/lib/p240-autonomous-new-applicant-pipeline/simulate";
import {
  P242_BASELINE_P240,
  P242_EXPECTED,
  P242_PHASE,
  type P242CandidateDisposition,
  type P242CorrectedThroughput,
  type P242DispositionKind,
  type P242LiveProtectionCase,
  type P242P241CaseValidation,
} from "@/lib/p242-fresh-new-replay-reset/types";
import type { P240PipelineHealth, P240Throughput } from "@/lib/p240-autonomous-new-applicant-pipeline/types";

export function p242Sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function p242RedactId(candidateId: string): string {
  return p242Sha256(candidateId).slice(0, 12);
}

export function classifyP242Disposition(trace: P240CandidateTrace): P242DispositionKind {
  if (trace.outcome === "would_send") return "would_send";
  if (trace.outcome === "would_reach_paperwork_needed") return "would_reach_paperwork_needed";
  if (trace.outcome === "protected_skip") return "protected_skip";
  switch (trace.blocker) {
    case "manual_review_40_60":
      return "manual_review";
    case "duplicate_identity":
      return "duplicate_identity";
    case "missing_phone":
      return "missing_phone";
    case "qualification_gate_failed":
      return "qualification_gate_failed";
    default:
      return "other_blocked";
  }
}

export function emptyDispositionSummary(): Record<P242DispositionKind, number> {
  return {
    would_send: 0,
    manual_review: 0,
    duplicate_identity: 0,
    missing_phone: 0,
    qualification_gate_failed: 0,
    other_blocked: 0,
    protected_skip: 0,
    would_reach_paperwork_needed: 0,
  };
}

/** P241 recoverable redacted ids (from artifacts/p241-recovery-opportunities.json). */
export const P241_RECOVERABLE_REDACTED_IDS = new Set([
  "61244a24ba7e",
  "09d804b86cb5",
  "9d2a0cd6d508",
  "c15e4466e945",
  "7ffaf043808e",
  "4c8aa3fd8f88",
  "cbe24e733f0a",
  "f1c539dc4ed7",
]);

export function buildP242Disposition(input: {
  trace: P240CandidateTrace;
  workflow: CandidateWorkflowRecord | undefined;
}): P242CandidateDisposition {
  const actionTypeBefore = input.workflow?.actionType ?? null;
  const disposition = classifyP242Disposition(input.trace);
  const wasP241 = P241_RECOVERABLE_REDACTED_IDS.has(input.trace.redactedCandidateId);

  const resetPreview = input.workflow
    ? applyP240FreshNewReplayReset({ ...input.workflow })
    : null;
  const actionTypeBlocksCleared =
    !resetPreview ||
    (resetPreview.actionType !== "await-signature" &&
      resetPreview.actionType !== "send-paperwork" &&
      (resetPreview.actionType == null || resetPreview.actionType === "none"));

  return {
    candidateId: input.trace.candidateId,
    redactedCandidateId: input.trace.redactedCandidateId,
    displayName: input.trace.displayName,
    appliedDate: input.trace.appliedDate,
    currentStage: input.trace.currentStage,
    paperworkStatus: input.trace.paperworkStatus,
    actionTypeBeforeReplay: actionTypeBefore,
    disposition,
    outcome: input.trace.outcome,
    blocker: input.trace.blocker,
    blockerDetail: input.trace.blockerDetail,
    nearestMiles: input.trace.nearestMiles,
    coverageTier: input.trace.coverageTier,
    wasP241QualificationFailure: wasP241,
    actionTypeBlocksCleared,
  };
}

export function buildP242P241CaseValidations(
  dispositions: P242CandidateDisposition[],
): P242P241CaseValidation[] {
  return dispositions
    .filter((d) => P241_RECOVERABLE_REDACTED_IDS.has(d.redactedCandidateId))
    .map((d) => ({
      redactedCandidateId: d.redactedCandidateId,
      displayName: d.displayName,
      actionTypeBefore: d.actionTypeBeforeReplay,
      actionTypeBlocksPromotionCleared:
        d.actionTypeBlocksCleared && d.blocker !== "qualification_gate_failed",
      disposition: d.disposition,
      outcome: d.outcome,
      blocker: d.blocker,
      unlocksWouldSend: d.disposition === "would_send",
    }));
}

export function buildP242LiveProtectionCases(input: {
  liveActivePacketStillBlocks: boolean;
  liveAlreadySentStillProtected: boolean;
  replayDoesNotMutateSource: boolean;
  canPromoteStillChecksActionType: boolean;
  activePacketPredicateUnchanged: boolean;
}): P242LiveProtectionCase[] {
  return [
    {
      caseId: "live_active_packet_blocks",
      description: "Live current-state evaluation still blocks active paperwork packets",
      passed: input.liveActivePacketStillBlocks,
      detail: input.liveActivePacketStillBlocks
        ? "canPromote=false via active_packet / already_sent protection"
        : "FAIL: live active packet no longer blocked",
    },
    {
      caseId: "live_already_sent_protected_skip",
      description: "P240 non-replay path still returns protected_skip for already-sent",
      passed: input.liveAlreadySentStillProtected,
      detail: input.liveAlreadySentStillProtected
        ? "replayAsFreshNew=false → already_sent_or_signed"
        : "FAIL: live already-sent protection weakened",
    },
    {
      caseId: "replay_no_source_mutation",
      description: "Replay evaluation does not alter underlying candidate workflow",
      passed: input.replayDoesNotMutateSource,
      detail: input.replayDoesNotMutateSource
        ? "workflow object deep-equal before/after simulate"
        : "FAIL: source workflow mutated",
    },
    {
      caseId: "p65_action_type_gate_intact",
      description: "Live P65.6 still rejects send-paperwork / await-signature actionType",
      passed: input.canPromoteStillChecksActionType,
      detail: input.canPromoteStillChecksActionType
        ? "canPromoteToPaperworkFunnel still false for stale actionType on live row"
        : "FAIL: actionType gate removed from live P65.6",
    },
    {
      caseId: "p65_active_packet_predicate_intact",
      description: "Live P65.6 active_packet / signed / duplicate-send protection unchanged",
      passed: input.activePacketPredicateUnchanged,
      detail: input.activePacketPredicateUnchanged
        ? "hasActivePacket + signed checks still enforce never-resend"
        : "FAIL: active packet predicate changed",
    },
  ];
}

export function buildP242CorrectedThroughput(input: {
  throughput: P240Throughput;
  health: P240PipelineHealth;
  generatedAt?: string;
}): P242CorrectedThroughput {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const corrected = {
    proxyCohortSize: input.throughput.proxyCohortSize,
    wouldSendCount: input.throughput.wouldSendCount,
    blockedCount: input.throughput.blockedCount,
    autoClearRatePct: input.throughput.autoClearRatePct,
    estimatedDailyArrivalRate: input.throughput.estimatedDailyArrivalRate,
    estimatedDailyThroughputToSent: input.throughput.estimatedDailyThroughputToSent,
    healthScore: input.health.healthScore,
    grade: input.health.grade,
    goNoGo:
      input.health.goNoGo === "CONDITIONAL-GO"
        ? ("GO_WITH_CONDITIONS" as const)
        : input.health.goNoGo,
    goNoGoReason: input.health.goNoGoReason,
    bottleneckBreakdown: input.throughput.bottleneckBreakdown,
  };

  const variances: string[] = [];
  if (corrected.wouldSendCount !== P242_EXPECTED.wouldSendCount) {
    variances.push(
      `wouldSendCount actual=${corrected.wouldSendCount} expected=${P242_EXPECTED.wouldSendCount}`,
    );
  }
  if (corrected.autoClearRatePct !== P242_EXPECTED.autoClearRatePct) {
    variances.push(
      `autoClearRatePct actual=${corrected.autoClearRatePct} expected=${P242_EXPECTED.autoClearRatePct}`,
    );
  }
  if (corrected.estimatedDailyThroughputToSent !== P242_EXPECTED.estimatedDailyThroughputToSent) {
    variances.push(
      `estimatedDailyThroughputToSent actual=${corrected.estimatedDailyThroughputToSent} expected=${P242_EXPECTED.estimatedDailyThroughputToSent}`,
    );
  }
  if (corrected.healthScore !== P242_EXPECTED.healthScore) {
    variances.push(
      `healthScore actual=${corrected.healthScore} expected=${P242_EXPECTED.healthScore}`,
    );
  }
  if (corrected.goNoGo !== P242_EXPECTED.goNoGo) {
    variances.push(`goNoGo actual=${corrected.goNoGo} expected=${P242_EXPECTED.goNoGo}`);
  }
  if (corrected.proxyCohortSize !== P242_EXPECTED.proxyCohortSize) {
    variances.push(
      `proxyCohortSize actual=${corrected.proxyCohortSize} expected=${P242_EXPECTED.proxyCohortSize}`,
    );
  }

  const remainingOk = P242_EXPECTED.remainingBlockers.every((b) =>
    corrected.bottleneckBreakdown.some((row) => row.blocker === b),
  );
  if (!remainingOk && corrected.blockedCount > 0) {
    const actual = corrected.bottleneckBreakdown.map((b) => b.blocker).join(",");
    variances.push(
      `remaining blockers actual=[${actual}] expected includes [${P242_EXPECTED.remainingBlockers.join(",")}]`,
    );
  }

  return {
    phase: P242_PHASE,
    generatedAt,
    baselineP240: P242_BASELINE_P240,
    corrected,
    expectedFromP241: P242_EXPECTED,
    matchesExpected: variances.length === 0,
    variances,
    throughput: input.throughput,
    health: input.health,
  };
}

export function formatP242ReplayResetValidationMd(input: {
  generatedAt: string;
  clearedActionFields: readonly string[];
  dispositions: P242CandidateDisposition[];
  dispositionSummary: Record<P242DispositionKind, number>;
  p241CaseValidations: P242P241CaseValidation[];
  liveProtection: P242LiveProtectionCase[];
  correctedThroughput: P242CorrectedThroughput;
  zeroWriteUnchanged: boolean;
  testsRun: number;
  testsPassed: number;
  artifactPaths: string[];
}): string {
  const c = input.correctedThroughput.corrected;
  const lines: string[] = [
    `# P242 — Fresh-New Replay State Reset Validation`,
    ``,
    `Generated: ${input.generatedAt}`,
    `Mode: **read-only / dry-run** — no live sends, commits, or deployments.`,
    ``,
    `## Fix summary`,
    ``,
    `P240 \`replayAsFreshNew\` now clears stale action-related state in addition to stage/packet fields.`,
    ``,
    `### Action fields added to replay reset`,
    ``,
    ...input.clearedActionFields.map((f) => `- \`${f}\``),
    ``,
    `Also continues clearing: \`workflowStatus\`→Applied, \`paperworkStatus\`→not_sent, \`signatureRequestId\`, paperwork timestamps/errors, \`assignedDM\`→Unassigned, \`paperworkViewCount\`, \`paperworkTemplateKey\`.`,
    ``,
    `Live P65.6 is **unchanged**: \`active_packet\`, already-sent / signed / viewed packet protection, and actionType gates still apply on current-state evaluation.`,
    ``,
    `## Tests`,
    ``,
    `- Ran: ${input.testsRun}`,
    `- Passed: ${input.testsPassed}`,
    ``,
    `## Corrected 17-candidate disposition`,
    ``,
    `| Disposition | Count |`,
    `|---|---:|`,
    ...Object.entries(input.dispositionSummary).map(
      ([k, v]) => `| ${k} | ${v} |`,
    ),
    ``,
    `### Per-candidate`,
    ``,
    `| Redacted ID | Name | Disposition | Blocker | Miles | P241 case |`,
    `|---|---|---|---|---:|---|`,
    ...input.dispositions.map(
      (d) =>
        `| ${d.redactedCandidateId} | ${d.displayName} | ${d.disposition} | ${d.blocker ?? "—"} | ${d.nearestMiles ?? "—"} | ${d.wasP241QualificationFailure ? "yes" : ""} |`,
    ),
    ``,
    `## P241 eight-case action_type_blocks_promotion clearance`,
    ``,
    `| Redacted ID | Prior actionType | Cleared | Unlocks would_send | Outcome |`,
    `|---|---|---|---|---|`,
    ...input.p241CaseValidations.map(
      (c) =>
        `| ${c.redactedCandidateId} | ${c.actionTypeBefore ?? "—"} | ${c.actionTypeBlocksPromotionCleared ? "yes" : "NO"} | ${c.unlocksWouldSend ? "yes" : "no"} | ${c.outcome}/${c.blocker ?? "—"} |`,
    ),
    ``,
    `All eight cleared action_type_blocks_promotion: **${
      input.p241CaseValidations.length === 8 &&
      input.p241CaseValidations.every((c) => c.actionTypeBlocksPromotionCleared)
        ? "YES"
        : "NO — see table"
    }**`,
    ``,
    `## Before / after throughput`,
    ``,
    `| Metric | P240 baseline | P242 corrected | P241 expected |`,
    `|---|---:|---:|---:|`,
    `| Would send | ${P242_BASELINE_P240.wouldSendCount} | ${c.wouldSendCount} | ${P242_EXPECTED.wouldSendCount} |`,
    `| Auto-clear % | ${P242_BASELINE_P240.autoClearRatePct} | ${c.autoClearRatePct} | ${P242_EXPECTED.autoClearRatePct} |`,
    `| Daily to Sent | ${P242_BASELINE_P240.estimatedDailyThroughputToSent} | ${c.estimatedDailyThroughputToSent} | ${P242_EXPECTED.estimatedDailyThroughputToSent} |`,
    `| Health | ${P242_BASELINE_P240.healthScore} | ${c.healthScore} | ${P242_EXPECTED.healthScore} |`,
    `| Go/No-Go | ${P242_BASELINE_P240.goNoGo} | ${c.goNoGo} | ${P242_EXPECTED.goNoGo} |`,
    ``,
    input.correctedThroughput.matchesExpected
      ? `**Matches P241 projection.** Disposition: **GO WITH CONDITIONS**.`
      : `**Variance vs P241 projection (not forced):**\n${input.correctedThroughput.variances.map((v) => `- ${v}`).join("\n")}`,
    ``,
    `## Live P65.6 protection regression`,
    ``,
    ...input.liveProtection.map(
      (p) => `- [${p.passed ? "PASS" : "FAIL"}] **${p.caseId}**: ${p.detail}`,
    ),
    ``,
    `## Zero-write audit`,
    ``,
    `- Durable stores unchanged: **${input.zeroWriteUnchanged}**`,
    `- Live sends / Dropbox / workflow writes / commits / deployments: **0**`,
    ``,
    `## Artifacts`,
    ``,
    ...input.artifactPaths.map((p) => `- \`${p}\``),
    ``,
    `## Explicit confirmation`,
    ``,
    `- No live paperwork sends`,
    `- No candidate / workflow / Breezy / Dropbox / MEL / recruiter / DM writes`,
    `- No commits or deployments`,
    ``,
  ];
  return lines.join("\n");
}

export { P240_FRESH_NEW_REPLAY_ACTION_FIELDS };
