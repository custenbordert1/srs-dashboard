import type {
  P241CandidateForensic,
  P241ForensicsResult,
  P241ThroughputSimulation,
  P241ZeroWriteAudit,
} from "@/lib/p241-p65-qualification-forensics/types";
import { P241_PHASE } from "@/lib/p241-p65-qualification-forensics/types";

export function formatP241RuleAnalysisMarkdown(input: {
  generatedAt: string;
  candidates: P241CandidateForensic[];
  throughput: P241ThroughputSimulation;
  zeroWriteAudit: P241ZeroWriteAudit;
  testsRun: number;
  testsPassed: number;
  artifactPaths: string[];
}): string {
  const lines: string[] = [];
  lines.push("# P241 — P65.6 Qualification Root Cause Analysis (Read-Only)");
  lines.push("");
  lines.push(`Generated: ${input.generatedAt}`);
  lines.push(`Mode: **read_only** (forensic analysis only)`);
  lines.push(`Phase: ${P241_PHASE}`);
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  lines.push(
    `All **${input.candidates.length}** P240 \`qualification_gate_failed\` candidates already have active paperwork packets. Live P65.6 correctly blocks re-promotion. P240 proxy replay mislabeled them because \`replayAsFreshNew\` reset stage/packet fields but **left stale \`actionType\`** (\`await-signature\` / \`send-paperwork\`), which still fails \`canPromoteToPaperworkFunnel\`.`,
  );
  lines.push("");
  const proj = input.throughput.projectedAfterRecoverableFixes;
  lines.push(
    `Projected after automatic simulation fix: would-send **${proj.wouldSendCount}/${input.throughput.baseline.proxyCohortSize}** (Δ+${proj.wouldSendDelta}), auto-clear **${proj.autoClearRatePct}%**, health **${proj.healthScore}/100**, **${proj.goNoGo}**.`,
  );
  lines.push("");
  lines.push("## All 8 candidates");
  lines.push("");

  for (const c of input.candidates) {
    lines.push(`### ${c.displayName} (\`${c.redactedCandidateId}\`)`);
    lines.push("");
    lines.push(`- Applied: ${c.appliedDate ?? "n/a"}`);
    lines.push(`- Position: ${c.positionName ?? c.positionId ?? "n/a"}`);
    lines.push(`- Recruiter / DM: ${c.assignedRecruiter} / ${c.assignedDM}`);
    lines.push(
      `- Workflow / Breezy / paperwork: **${c.workflowStage}** / ${c.breezyStage ?? "n/a"} / ${c.paperworkStatus}`,
    );
    lines.push(`- Qualification status: ${c.qualificationStatus}`);
    lines.push(`- AI grade: ${c.aiGrade}`);
    lines.push(`- actionType: \`${c.actionType ?? "none"}\``);
    lines.push(
      `- Failed P65.6 check (P240 context): **${c.failedCheckId}** (${c.failedRule}) — ${c.failedCheckDetail}`,
    );
    lines.push(
      `- Current-state first fail: \`${c.currentStateTrace.firstFailedCheckId ?? "none"}\` (canPromote=${c.currentStateTrace.canPromote})`,
    );
    lines.push(
      `- P240-replay first fail: \`${c.p240ReplayTrace.firstFailedCheckId ?? "none"}\` (canPromote=${c.p240ReplayTrace.canPromote})`,
    );
    lines.push(
      `- Fixed-replay (clear actionType): canPromote=${c.fixedReplayTrace.canPromote}`,
    );
    lines.push(`- Source: ${c.source}`);
    lines.push(`- Classification: **${c.classification}** (${c.expectedOrUnintended})`);
    lines.push(`- Recoverability: **${c.recoverability}**`);
    lines.push(`- Root cause: ${c.rootCause}`);
    lines.push(
      `- Smallest safe correction: ${c.smallestSafeCorrection ?? "None — do not bypass valid business rules"}`,
    );
    lines.push(
      `- Projected if recovered: **${c.projectedOutcomeIfRecovered}**` +
        (c.projectedNearestMiles != null
          ? ` (miles=${c.projectedNearestMiles}, tier=${c.projectedCoverageTier ?? "n/a"})`
          : ""),
    );
    lines.push("");
  }

  lines.push("## Throughput simulation");
  lines.push("");
  lines.push("| Metric | Baseline (P240) | Projected |");
  lines.push("| --- | ---: | ---: |");
  lines.push(
    `| Would send | ${input.throughput.baseline.wouldSendCount} | ${proj.wouldSendCount} |`,
  );
  lines.push(
    `| Auto-clear % | ${input.throughput.baseline.autoClearRatePct} | ${proj.autoClearRatePct} |`,
  );
  lines.push(
    `| Daily throughput → Sent | ${input.throughput.baseline.estimatedDailyThroughputToSent} | ${proj.estimatedDailyThroughputToSent} |`,
  );
  lines.push(
    `| Health score | ${input.throughput.baseline.healthScore} | ${proj.healthScore} |`,
  );
  lines.push(`| GO / NO-GO | ${input.throughput.baseline.goNoGo} | **${proj.goNoGo}** |`);
  lines.push("");
  lines.push(`Projected reason: ${proj.goNoGoReason}`);
  lines.push("");
  lines.push("Remaining bottlenecks after qualification recovery:");
  for (const b of proj.remainingBottlenecks) {
    lines.push(`- ${b}`);
  }
  lines.push("");
  lines.push("## Assumptions");
  lines.push("");
  for (const a of input.throughput.assumptions) {
    lines.push(`- ${a}`);
  }
  lines.push("");
  lines.push("## Zero-write audit");
  lines.push("");
  lines.push(`- Unchanged: **${input.zeroWriteAudit.unchanged}**`);
  lines.push(`- Candidate writes: ${input.zeroWriteAudit.candidateWrites}`);
  lines.push(`- Workflow writes: ${input.zeroWriteAudit.workflowWrites}`);
  lines.push(`- Dropbox Sign calls: ${input.zeroWriteAudit.dropboxSignCalls}`);
  lines.push(`- Recruiter ownership changes: ${input.zeroWriteAudit.recruiterOwnershipChanges}`);
  lines.push(`- DM assignment changes: ${input.zeroWriteAudit.dmAssignmentChanges}`);
  lines.push(`- Deployments / commits: ${input.zeroWriteAudit.deployments} / ${input.zeroWriteAudit.commits}`);
  lines.push(`- Durable paths: ${input.zeroWriteAudit.durablePaths.join(", ")}`);
  lines.push("");
  lines.push("## Tests");
  lines.push("");
  lines.push(`- Tests run: **${input.testsRun}**`);
  lines.push(`- Tests passed: **${input.testsPassed}**`);
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  for (const p of input.artifactPaths) {
    lines.push(`- \`${p}\``);
  }
  lines.push("");
  lines.push("## Confirmation");
  lines.push("");
  lines.push(
    "P241 executed READ-ONLY. No candidate writes, workflow changes, recruiter/DM changes, Dropbox Sign, MEL mutations, Breezy writes, deployments, commits, merges, or pushes.",
  );
  lines.push("");
  return lines.join("\n");
}

export function buildP241RecoveryOpportunitiesArtifact(
  candidates: P241CandidateForensic[],
  generatedAt: string,
) {
  return {
    phase: P241_PHASE,
    generatedAt,
    count: candidates.length,
    opportunities: candidates.map((c) => ({
      redactedCandidateId: c.redactedCandidateId,
      displayName: c.displayName,
      recoverability: c.recoverability,
      classification: c.classification,
      failedCheckId: c.failedCheckId,
      failedRule: c.failedRule,
      correction: c.smallestSafeCorrection,
      unlocksWouldSend: c.projectedOutcomeIfRecovered === "would_send",
      projectedOutcome: c.projectedOutcomeIfRecovered,
      projectedNearestMiles: c.projectedNearestMiles,
      projectedCoverageTier: c.projectedCoverageTier,
    })),
  };
}

export function buildP241RuleTraceArtifact(
  candidates: P241CandidateForensic[],
  generatedAt: string,
) {
  return {
    phase: P241_PHASE,
    generatedAt,
    count: candidates.length,
    traces: candidates.map((c) => ({
      redactedCandidateId: c.redactedCandidateId,
      displayName: c.displayName,
      workflowStage: c.workflowStage,
      breezyStage: c.breezyStage,
      paperworkStatus: c.paperworkStatus,
      actionType: c.actionType,
      aiGrade: c.aiGrade,
      qualificationStatus: c.qualificationStatus,
      failedCheckId: c.failedCheckId,
      failedRule: c.failedRule,
      currentState: c.currentStateTrace,
      p240Replay: c.p240ReplayTrace,
      fixedReplay: c.fixedReplayTrace,
      classification: c.classification,
      recoverability: c.recoverability,
      rootCause: c.rootCause,
    })),
  };
}

export function summarizeP241Forensics(result: P241ForensicsResult): string {
  const proj = result.throughputSimulation.projectedAfterRecoverableFixes;
  return [
    `P241: ${result.qualificationGateFailedCount} qualification failures traced.`,
    `Projected would-send ${proj.wouldSendCount} (Δ+${proj.wouldSendDelta}), health ${proj.healthScore}, ${proj.goNoGo}.`,
    `Zero-write unchanged=${result.zeroWriteAudit.unchanged}.`,
  ].join(" ");
}
