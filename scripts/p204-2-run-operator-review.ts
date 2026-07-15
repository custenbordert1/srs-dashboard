/**
 * P204.2 — Controlled Recommendation Approval Pilot.
 * Operator decisions + audit only. No PN / reject / Dropbox / MEL / automation.
 *
 *   npm run p204-2:pilot
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  P204_2_EXPECTED_COHORT_ID,
  P204_2_EXPECTED_FINGERPRINT,
  P204_2_SOURCE_PHASE,
  buildAgreementAnalysis,
  buildCalibrationAnalysis,
  buildFuturePilotForecast,
  collectSafetyExceptions,
  executeP2042OperatorReviewPilot,
  loadP2042FrozenCohort,
  newP2042Authorization,
} from "@/lib/p204-2-controlled-recommendation-approval";

function recommendReadiness(input: {
  agreementRate: number;
  safetyExceptionCount: number;
  staleCount: number;
  calibration: "keep_thresholds" | "consider_adjustment_next_phase";
  missingEvidenceDisagreements: number;
}): string {
  if (input.safetyExceptionCount > 0 && input.agreementRate < 70) {
    return "not ready";
  }
  if (input.missingEvidenceDisagreements >= 3) {
    return "needs better evidence capture";
  }
  if (input.calibration === "consider_adjustment_next_phase" || input.agreementRate < 80) {
    return "needs scoring adjustment";
  }
  if (input.staleCount > 2) {
    return "needs better evidence capture";
  }
  return "ready for controlled lifecycle action pilot";
}

async function main() {
  const generatedAt = new Date().toISOString();
  mkdirSync("artifacts", { recursive: true });
  mkdirSync(".data", { recursive: true });

  const [ingestion, workflowsBefore] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
  ]);
  const candidates = listIngestedCandidates(ingestion);
  const candidatesById = new Map(candidates.map((c) => [c.candidateId, c]));

  const loaded = await loadP2042FrozenCohort({
    cohortId: P204_2_EXPECTED_COHORT_ID,
    fingerprint: P204_2_EXPECTED_FINGERPRINT,
  });

  const preflight = {
    generatedAt,
    sourcePhase: P204_2_SOURCE_PHASE,
    cohortId: loaded.cohortId,
    fingerprint: loaded.fingerprint,
    recommendationCount: loaded.recommendations.length,
    candidateIdsMatch: loaded.recommendations.every((r) =>
      loaded.localMembers.some((m) => m.candidateId === r.candidateId),
    ),
    workflowVersions: loaded.recommendations.map((r) => ({
      redactedCandidateId: r.redactedCandidateId,
      evidenceFingerprint: r.evidenceFingerprint,
      engineVersion: r.engineVersion,
      scoringVersion: r.scoringVersion,
      workflowStatusAtWrite: r.workflowStatusAtWrite,
      currentStage: workflowsBefore[r.candidateId]?.workflowStatus ?? "missing",
    })),
    authorizationScope: {
      operatorDecision: true,
      decisionAudit: true,
      recommendationOutcomeStatus: true,
      lifecycleWrites: false,
      paperworkNeeded: false,
      rejectionStatus: false,
      dropbox: false,
      mel: false,
      continuousAutomation: false,
    },
    ready: loaded.recommendations.length === 20,
  };

  writeFileSync(
    path.join("artifacts", "p204-2-production-preflight.json"),
    `${JSON.stringify(preflight, null, 2)}\n`,
  );

  if (!preflight.ready) {
    writeFileSync(
      path.join("artifacts", "p204-2-readiness-report.md"),
      `# P204.2 — Readiness\n\nGenerated: ${generatedAt}\n\n**not ready** — frozen cohort incomplete.\n`,
    );
    console.log(JSON.stringify({ error: "cohort_incomplete", preflight }, null, 2));
    process.exitCode = 1;
    return;
  }

  const authorization = newP2042Authorization({
    cohortId: loaded.cohortId,
    fingerprint: loaded.fingerprint,
  });

  const execution = await executeP2042OperatorReviewPilot({
    authorization,
    candidatesById,
    workflows: workflowsBefore,
    writeAuditNotes: true,
  });

  const workflowsAfter = await getCandidateWorkflowState();
  let lifecycleDrift = 0;
  let pnCreated = 0;
  let rejectStatus = 0;
  for (const d of execution.decisions) {
    const before = workflowsBefore[d.candidateId];
    const after = workflowsAfter[d.candidateId];
    if (!before || !after) continue;
    if (before.workflowStatus !== after.workflowStatus) lifecycleDrift += 1;
    if (
      after.workflowStatus === "Paperwork Needed" &&
      before.workflowStatus !== "Paperwork Needed"
    ) {
      pnCreated += 1;
    }
    if (
      after.workflowStatus === "Not Qualified" &&
      before.workflowStatus !== "Not Qualified"
    ) {
      rejectStatus += 1;
    }
  }

  const agreement = buildAgreementAnalysis({
    decisions: execution.decisions,
    packages: execution.packages,
  });
  const calibration = buildCalibrationAnalysis({
    decisions: execution.decisions,
    packages: execution.packages,
  });
  const forecast = buildFuturePilotForecast({ decisions: execution.decisions });
  const safetyExceptions = collectSafetyExceptions(execution.packages);

  const decisionsPublic = execution.decisions.map((d) => ({
    redactedCandidateId: d.redactedCandidateId,
    aiRecommendation: d.aiRecommendation,
    confidence: d.confidence,
    decision: d.decision,
    decidedOutcome: d.decidedOutcome,
    isAgreement: d.isAgreement,
    isOverride: d.isOverride,
    overrideReason: d.overrideReason,
    reviewNotes: d.reviewNotes,
    evidenceChecklist: d.evidenceChecklist,
    operatorId: d.operatorId,
    decidedAt: d.decidedAt,
    safetyFlags: d.safetyFlags,
    staleReasons: d.staleReasons,
  }));

  writeFileSync(
    path.join("artifacts", "p204-2-operator-decisions.json"),
    `${JSON.stringify(
      {
        generatedAt,
        cohortId: execution.cohortId,
        fingerprint: execution.fingerprint,
        count: decisionsPublic.length,
        decisions: decisionsPublic,
        reviewPackages: execution.packages.map((p) => ({
          redactedCandidateId: p.redactedCandidateId,
          aiRecommendation: p.aiRecommendation,
          confidence: p.confidence,
          topPositiveFactors: p.topPositiveFactors,
          topNegativeFactors: p.topNegativeFactors,
          hardGateResults: p.hardGateResults,
          questionnaireCompleteness: p.questionnaireCompleteness,
          experienceSummary: p.experienceSummary,
          duplicateStatus: p.duplicateStatus,
          nearbyJobsCount: p.nearbyJobsCount,
          nearestJobDistance: p.nearestJobDistance,
          currentWorkflowStage: p.currentWorkflowStage,
          evidenceFreshness: p.evidenceFreshness,
          conciseExplanation: p.conciseExplanation,
          stale: p.stale,
          staleReasons: p.staleReasons,
          safetyFlags: p.safetyFlags,
        })),
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    path.join("artifacts", "p204-2-agreement-analysis.json"),
    `${JSON.stringify({ generatedAt, ...agreement }, null, 2)}\n`,
  );

  writeFileSync(
    path.join("artifacts", "p204-2-calibration-analysis.json"),
    `${JSON.stringify({ generatedAt, ...calibration }, null, 2)}\n`,
  );

  writeFileSync(
    path.join("artifacts", "p204-2-future-pilot-forecast.json"),
    `${JSON.stringify({ generatedAt, ...forecast }, null, 2)}\n`,
  );

  const localPii = {
    generatedAt,
    cohortId: execution.cohortId,
    fingerprint: execution.fingerprint,
    members: execution.decisions.map((d) => {
      const local = loaded.localMembers.find((m) => m.candidateId === d.candidateId);
      return {
        candidateId: d.candidateId,
        name: local?.name ?? "",
        email: local?.email ?? "",
        phone: local?.phone ?? "",
        state: local?.state ?? "",
        city: local?.city ?? "",
        decision: d.decision,
        decidedOutcome: d.decidedOutcome,
        overrideReason: d.overrideReason,
      };
    }),
  };
  writeFileSync(
    path.join(".data", "p204-2-operator-review-local.json"),
    `${JSON.stringify(localPii, null, 2)}\n`,
  );

  const readiness = recommendReadiness({
    agreementRate: agreement.exactAgreementRate,
    safetyExceptionCount: safetyExceptions.length,
    staleCount: agreement.staleCount,
    calibration: calibration.recommendation,
    missingEvidenceDisagreements: calibration.missingEvidenceAssociatedWithDisagreement,
  });

  const md = [
    `# P204.2 — Controlled Recommendation Approval Pilot`,
    ``,
    `Generated: ${generatedAt}`,
    ``,
    `## Cohort`,
    ``,
    `| Item | Value |`,
    `|---|---|`,
    `| Cohort ID | \`${execution.cohortId}\` |`,
    `| Fingerprint | \`${execution.fingerprint}\` |`,
    `| Candidates reviewed | **${agreement.candidatesReviewed}** |`,
    `| Stale excluded | ${agreement.staleCount} |`,
    ``,
    `## Operator decisions`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Exact agreement | ${agreement.exactAgreementCount} (${agreement.exactAgreementRate}%) |`,
    `| Overrides | ${agreement.overrideCount} (${agreement.overrideRate}%) |`,
    `| Defer | ${agreement.deferCount} |`,
    `| Stale | ${agreement.staleCount} |`,
    `| AI too aggressive | ${agreement.aiTooAggressiveCount} |`,
    `| AI too conservative | ${agreement.aiTooConservativeCount} |`,
    ``,
    `## Agreement by recommendation type`,
    ``,
    ...Object.entries(agreement.agreementByRecommendationType).map(
      ([k, v]) => `- ${k}: ${v.agree}/${v.total} (${v.rate}%)`,
    ),
    ``,
    `## Top override reasons`,
    ``,
    ...(agreement.topOverrideReasons.length > 0
      ? agreement.topOverrideReasons.map((r) => `- (${r.count}) ${r.reason}`)
      : ["- (none)"]),
    ``,
    `## Safety exceptions`,
    ``,
    ...(safetyExceptions.length > 0
      ? safetyExceptions.map((s) => `- ${s.redactedCandidateId}: ${s.flags.join(", ")}`)
      : ["- none"]),
    ``,
    `## Future lifecycle pilot forecast (only)`,
    ``,
    `| Bucket | Count |`,
    `|---|---|`,
    `| Approved Advance | ${forecast.approvedAdvance} |`,
    `| Approved Needs Review | ${forecast.approvedNeedsReview} |`,
    `| Approved Reject | ${forecast.approvedReject} |`,
    `| Deferred | ${forecast.deferred} |`,
    `| Stale | ${forecast.stale} |`,
    `| Blocked by evidence | ${forecast.blockedByEvidence} |`,
    ``,
    `## Production writes`,
    ``,
    `| Write | Count |`,
    `|---|---|`,
    `| Operator decisions persisted | ${execution.decisions.length} (new this run: ${execution.decisionsWritten}, idempotent: ${execution.idempotentSkips}) |`,
    `| Lifecycle drift | **${lifecycleDrift}** |`,
    `| Paperwork Needed created | **${pnCreated}** |`,
    `| Rejection status writes | **${rejectStatus}** |`,
    `| Dropbox / MEL / automation | **${execution.dropboxCalls} / ${execution.melWrites} / ${execution.automationStarts}** |`,
    ``,
    `## Calibration`,
    ``,
    `- Thresholds unchanged: **${calibration.thresholdsUnchanged}**`,
    `- Recommendation: ${calibration.recommendation}`,
    ...calibration.notes.map((n) => `- ${n}`),
    ``,
    `## Final recommendation`,
    ``,
    `**${readiness}**`,
    ``,
  ].join("\n");

  writeFileSync(path.join("artifacts", "p204-2-readiness-report.md"), md);

  console.log(
    JSON.stringify(
      {
        cohortId: execution.cohortId,
        fingerprint: execution.fingerprint,
        candidatesReviewed: agreement.candidatesReviewed,
        agree: agreement.exactAgreementCount,
        override: agreement.overrideCount,
        defer: agreement.deferCount,
        stale: agreement.staleCount,
        agreementRate: agreement.exactAgreementRate,
        futureApprovedAdvance: forecast.approvedAdvance,
        lifecycleDrift,
        pnCreated,
        rejectStatus,
        dropbox: execution.dropboxCalls,
        mel: execution.melWrites,
        automation: execution.automationStarts,
        readiness,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
