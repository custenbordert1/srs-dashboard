/**
 * P204.1 — Supervised AI Qualification Pilot.
 * Writes recommendation metadata + audit only. No PN / reject / Dropbox / MEL / automation.
 *
 *   npm run p204-1:pilot
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  P204_1_ENGINE_VERSION,
  P204_1_SCORING_VERSION,
  P204_1_SOURCE_PHASE,
  buildP2041AgreementAnalysis,
  executeP2041RecommendationPilot,
  freezeP2041Cohort,
  newP2041Authorization,
  selectP2041PilotCohort,
} from "@/lib/p204-1-supervised-qualification-pilot";

async function main() {
  const generatedAt = new Date().toISOString();
  mkdirSync("artifacts", { recursive: true });
  mkdirSync(".data", { recursive: true });

  const [ingestion, workflowsBefore] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
  ]);
  const candidates = listIngestedCandidates(ingestion);

  const selection = selectP2041PilotCohort({
    candidates,
    workflows: workflowsBefore,
  });

  const preflight = {
    generatedAt,
    sourcePhase: P204_1_SOURCE_PHASE,
    engineVersion: P204_1_ENGINE_VERSION,
    scoringVersion: P204_1_SCORING_VERSION,
    ...selection.preflight,
    skippedSample: selection.skipped.slice(0, 40),
    authorizationScope: {
      recommendationMetadata: true,
      recommendationAudit: true,
      operatorReviewQueue: true,
      lifecycleWrites: false,
      paperworkNeeded: false,
      rejectionStatus: false,
      dropbox: false,
      mel: false,
      continuousAutomation: false,
    },
    readyToFreeze: selection.selected.length > 0,
  };

  writeFileSync(
    path.join("artifacts", "p204-1-production-preflight.json"),
    `${JSON.stringify(preflight, null, 2)}\n`,
  );

  if (selection.selected.length === 0) {
    writeFileSync(
      path.join("artifacts", "p204-1-readiness-report.md"),
      `# P204.1 — Readiness\n\nGenerated: ${generatedAt}\n\n**not ready** — empty eligible cohort.\n`,
    );
    console.log(JSON.stringify({ error: "empty_cohort", preflight }, null, 2));
    process.exitCode = 1;
    return;
  }

  const cohort = freezeP2041Cohort({ selected: selection.selected });
  const authorization = newP2041Authorization({ fingerprint: cohort.fingerprint });

  writeFileSync(
    path.join("artifacts", "p204-1-frozen-cohort.json"),
    `${JSON.stringify(
      {
        ...cohort,
        members: cohort.members.map((m) => ({
          ...m,
          candidateId: m.redactedCandidateId,
        })),
      },
      null,
      2,
    )}\n`,
  );

  const selectedById = new Map(selection.selected.map((s) => [s.candidate.candidateId, s]));
  const execution = await executeP2041RecommendationPilot({
    cohort,
    authorization,
    selectedById,
  });

  const workflowsAfter = await getCandidateWorkflowState();
  let lifecycleDrift = 0;
  let pnCreated = 0;
  let rejectStatus = 0;
  for (const member of cohort.members) {
    const before = workflowsBefore[member.candidateId];
    const after = workflowsAfter[member.candidateId];
    if (!before || !after) continue;
    if (before.workflowStatus !== after.workflowStatus) lifecycleDrift += 1;
    if (after.workflowStatus === "Paperwork Needed" && before.workflowStatus !== "Paperwork Needed") {
      pnCreated += 1;
    }
    if (after.workflowStatus === "Not Qualified" && before.workflowStatus !== "Not Qualified") {
      rejectStatus += 1;
    }
  }

  const counts = {
    Advance: execution.records.filter((r) => r.recommendation === "Advance").length,
    "Needs Recruiter Review": execution.records.filter(
      (r) => r.recommendation === "Needs Recruiter Review",
    ).length,
    Reject: execution.records.filter((r) => r.recommendation === "Reject").length,
  };
  const avgConfidence =
    execution.records.length === 0
      ? 0
      : Math.round(
          (execution.records.reduce((s, r) => s + r.confidence, 0) / execution.records.length) * 10,
        ) / 10;

  const agreement = buildP2041AgreementAnalysis({
    records: execution.records,
    workflows: workflowsBefore,
  });

  const operatorDecided = execution.records.filter((r) => r.operatorDecision != null);
  const overrides = operatorDecided.filter((r) =>
    String(r.operatorDecision).startsWith("override_"),
  );
  const operatorAgreementRate =
    operatorDecided.length === 0
      ? null
      : Math.round(
          ((operatorDecided.length - overrides.length) / operatorDecided.length) * 1000,
        ) / 10;

  const evidenceQuality = execution.records.reduce(
    (acc, r) => {
      acc[r.questionnaireCompleteness] = (acc[r.questionnaireCompleteness] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const estimatedHoursSaved =
    Math.round(((execution.written * 8) / 60) * 10) / 10;

  const publicQueue = execution.operatorQueue.map((e) => ({
    ...e,
    candidateId: e.redactedCandidateId,
    candidateDisplayName: null,
  }));

  writeFileSync(
    path.join("artifacts", "p204-1-recommendation-report.json"),
    `${JSON.stringify(
      {
        generatedAt,
        cohortId: cohort.cohortId,
        fingerprint: cohort.fingerprint,
        written: execution.written,
        skipped: execution.skipped,
        failed: execution.failed,
        counts,
        averageConfidence: avgConfidence,
        records: execution.records.map((r) => ({
          ...r,
          candidateId: r.redactedCandidateId,
        })),
        attempts: execution.attempts.map((a) => ({
          ...a,
          candidateId:
            a.candidateId === "*"
              ? "*"
              : cohort.members.find((m) => m.candidateId === a.candidateId)?.redactedCandidateId ??
                a.candidateId.slice(0, 8),
        })),
        sideEffects: {
          lifecycleDrift,
          paperworkNeededCreated: pnCreated,
          rejectionWrites: rejectStatus,
          dropboxCalls: 0,
          melWrites: 0,
          automationStarted: 0,
        },
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    path.join("artifacts", "p204-1-operator-review-queue.json"),
    `${JSON.stringify(
      {
        generatedAt,
        cohortId: cohort.cohortId,
        fingerprint: cohort.fingerprint,
        entries: publicQueue,
        allowedDecisions: [
          "approve_recommendation",
          "override_to_review",
          "override_to_advance",
          "override_to_reject",
          "defer",
        ],
        note: "Operator decisions are review outcomes only in P204.1 — no lifecycle execution.",
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    path.join("artifacts", "p204-1-agreement-analysis.json"),
    `${JSON.stringify({ generatedAt, ...agreement }, null, 2)}\n`,
  );

  const localOperator = {
    generatedAt,
    warning: "Contains candidate PII — gitignored via .data/",
    cohortId: cohort.cohortId,
    fingerprint: cohort.fingerprint,
    members: selection.selected.map((s) => ({
      candidateId: s.candidate.candidateId,
      name: `${s.candidate.firstName ?? ""} ${s.candidate.lastName ?? ""}`.trim(),
      email: s.candidate.email,
      phone: s.candidate.phone,
      state: s.candidate.state,
      city: s.candidate.city,
      recommendation: s.label,
      confidence: s.decision.confidence,
    })),
    operatorQueue: execution.operatorQueue.map((e) => {
      const src = selectedById.get(e.candidateId);
      return {
        ...e,
        candidateDisplayName: src
          ? `${src.candidate.firstName ?? ""} ${src.candidate.lastName ?? ""}`.trim()
          : null,
        email: src?.candidate.email ?? null,
      };
    }),
  };
  writeFileSync(
    path.join(".data", "p204-1-supervised-pilot-operator-local.json"),
    `${JSON.stringify(localOperator, null, 2)}\n`,
  );

  const recommendationLabel =
    lifecycleDrift === 0 &&
    pnCreated === 0 &&
    rejectStatus === 0 &&
    execution.written >= 10 &&
    counts.Advance >= 1
      ? selection.preflight.eligibleAdvance < 5
        ? "needs better data capture"
        : avgConfidence >= 60
          ? "ready for controlled recommendation approval pilot"
          : "needs scoring adjustment"
      : "not ready";

  const readiness = `# P204.1 — Supervised AI Qualification Pilot Readiness

Generated: ${generatedAt}

## Cohort

| Item | Value |
|---|---|
| Cohort ID | \`${cohort.cohortId}\` |
| Fingerprint | \`${cohort.fingerprint}\` |
| Candidates selected | **${cohort.members.length}** |
| Recommendations written | **${execution.written}** |
| Failed / skipped | ${execution.failed} / ${execution.skipped} |

## Recommendation mix

| Recommendation | Count |
|---|---|
| Advance | ${counts.Advance} |
| Needs Recruiter Review | ${counts["Needs Recruiter Review"]} |
| Reject | ${counts.Reject} |
| Average confidence | **${avgConfidence}** |

## Agreement

| Item | Value |
|---|---|
| Operator agreement rate | ${operatorAgreementRate == null ? "n/a (no operator decisions yet)" : `${operatorAgreementRate}%`} |
| Override rate | ${operatorDecided.length === 0 ? "n/a" : `${Math.round((overrides.length / operatorDecided.length) * 1000) / 10}%`} |
| Historical exact agreement | ${agreement.exactAgreementRate}% |
| Historical agreement (incl. conservative/aggressive) | ${agreement.historicalAgreementRate}% |
| Insufficient historical evidence | ${agreement.counts.insufficient_evidence} |

## Safety / side effects

| Item | Value |
|---|---|
| Lifecycle drift | **${lifecycleDrift}** |
| Paperwork Needed created | **${pnCreated}** |
| Rejection status writes | **${rejectStatus}** |
| Dropbox / MEL / automation | **0 / 0 / 0** |
| Evidence quality | ${JSON.stringify(evidenceQuality)} |
| Est. recruiter time saved | ${estimatedHoursSaved}h (prep only) |

## Recommendation

**${recommendationLabel}**
`;

  writeFileSync(path.join("artifacts", "p204-1-readiness-report.md"), readiness);

  console.log(
    JSON.stringify(
      {
        cohortId: cohort.cohortId,
        fingerprint: cohort.fingerprint,
        selected: cohort.members.length,
        written: execution.written,
        counts,
        averageConfidence: avgConfidence,
        lifecycleDrift,
        pnCreated,
        rejectStatus,
        recommendation: recommendationLabel,
      },
      null,
      2,
    ),
  );
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
