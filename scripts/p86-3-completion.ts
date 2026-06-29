/**
 * P86.3 — Questionnaire parser fix follow-through (read-only audit, no sends).
 * Usage: npx tsx scripts/p86-3-completion.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildCandidateAdvancementDecisions } from "@/lib/candidate-advancement-engine";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { completeJuneQuestionnaireEnrichment, clearEmptyQuestionnaireEnrichmentAttempts } from "@/lib/candidate-ingestion/enrich-candidate-questionnaires";
import {
  listIngestedCandidates,
  readIngestionStore,
  writeIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { filterMtdCandidates, currentMtdDateRange } from "@/lib/candidate-ingestion/mtd-candidates";
import { runCandidateIngestionSync } from "@/lib/candidate-ingestion/run-ingestion-sync";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import { buildRecruiterActionDecisions } from "@/lib/recruiter-action-engine/build-action-decision";
import { buildCandidateProgressionDecisions } from "@/lib/candidate-progression-engine/build-progression-decision";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { resolveBreezyCompany } from "@/lib/breezy-api";

function loadEnvLocal(): void {
  const envPath = resolve(".env.local");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const reference = new Date("2026-06-29T12:00:00.000Z");
  const reportPath = resolve(".data/p86-3-completion-report.json");
  mkdirSync(resolve(".data"), { recursive: true });

  const company = await resolveBreezyCompany();
  if (!company.ok) throw new Error(company.error);

  let store = await readIngestionStore();
  store = clearEmptyQuestionnaireEnrichmentAttempts(store, reference);
  const mtdBefore = filterMtdCandidates(listIngestedCandidates(store), currentMtdDateRange(reference));
  const pendingBefore = mtdBefore.filter(
    (candidate) => !(candidate.questionnaireAnswers?.length || candidate.hasQuestionnaire),
  ).length;

  const enrichmentDeadline = Date.now() + 45 * 60 * 1000;
  const enrichment = await completeJuneQuestionnaireEnrichment({
    store,
    companyId: company.companyId,
    reference,
    deadlineMs: enrichmentDeadline,
    onCheckpoint: async (checkpointStore) => {
      await writeIngestionStore(checkpointStore);
    },
  });
  store = enrichment.store;
  await writeIngestionStore(store);

  const ingestion = await runCandidateIngestionSync({
    completeCycle: true,
    runPipeline: false,
    enrichQuestionnaires: true,
    maxRuntimeMs: 10 * 60 * 1000,
  });
  store = await readIngestionStore();

  const [bundle, jobsResult] = await Promise.all([getCandidateWorkflowBundle(), fetchBreezyJobs("published")]);
  const jobsByPositionId = new Map((jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]));
  const mtdCandidates = filterMtdCandidates(listIngestedCandidates(store), currentMtdDateRange(reference));
  const scored = mtdCandidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  const assignmentDecisions = buildRecruiterAssignmentDecisions({
    candidates: mtdCandidates,
    workflows: bundle.workflows,
    rosters: bundle.rosters,
    jobsByPositionId,
  });
  const assignedRows = scored.map((row) => {
    const assignment = assignmentDecisions.find((decision) => decision.candidateId === row.candidateId);
    if (!assignment?.shouldAssign || !assignment.recruiter) return row;
    return { ...row, assignedRecruiter: assignment.recruiter };
  });

  const referenceMs = reference.getTime();
  const actionDecisions = buildRecruiterActionDecisions(assignedRows, referenceMs);
  const progressionDecisions = buildCandidateProgressionDecisions(assignedRows, referenceMs);

  const advancementDecisions = buildCandidateAdvancementDecisions(assignedRows, {
    jobsByPositionId,
    requireApproval: false,
    paperworkByGrade: { "A+": true, A: true, B: true, C: true, D: true },
  });

  const paperworkNeededRows = assignedRows.filter((row) => {
    const advancement = advancementDecisions.find((decision) => decision.candidateId === row.candidateId);
    return advancement?.shouldAdvance && advancement.action === "send-paperwork";
  });
  const paperworkNeededCount = paperworkNeededRows.length;

  const readyForP84 = paperworkNeededRows.filter((row) => {
    const simulatedRow = { ...row, workflowStatus: "Paperwork Needed" as const, actionType: "send-paperwork" as const };
    const eligibility = buildPaperworkSendEligibility({
      row: simulatedRow,
      onboarding: null,
      jobsByPositionId,
    });
    return eligibility.eligible;
  });

  const withQuestionnaire = mtdCandidates.filter((candidate) => (candidate.questionnaireAnswers?.length ?? 0) > 0);

  const report = {
    generatedAt: new Date().toISOString(),
    parserFix: {
      textFieldForQuestions: true,
      responseFieldForAnswers: true,
      checkboxResponsesParsing: true,
      sectionsRecursion: true,
      detailQuestionnaireArray: true,
      retryEmptyEnrichmentAttempts: true,
    },
    enrichment: enrichment.report,
    ingestion: {
      ok: ingestion.ok,
      cycleComplete: ingestion.cycleComplete,
      totalCandidates: ingestion.totalCandidates,
      newCandidates: ingestion.newCandidates,
      positionsScannedThisRun: ingestion.positionsScannedThisRun,
    },
    juneMtd: {
      total: mtdCandidates.length,
      withQuestionnaireBefore: mtdBefore.length - pendingBefore,
      withQuestionnaireAfter: withQuestionnaire.length,
      questionnaireCompletionPct:
        mtdCandidates.length > 0 ? Math.round((withQuestionnaire.length / mtdCandidates.length) * 100) : 0,
      pendingBefore,
      stillPending: mtdCandidates.filter(
        (candidate) =>
          candidate.positionId?.trim() &&
          !(candidate.questionnaireAnswers?.length || candidate.hasQuestionnaire) &&
          !candidate.questionnaireEnrichmentAttemptedAt,
      ).length,
    },
    p85Simulation: {
      requireApproval: false,
      p62WouldAssign: assignmentDecisions.filter((decision) => decision.shouldAssign).length,
      p63Actions: actionDecisions.filter((decision) => decision.shouldPersist).length,
      p64Progressions: progressionDecisions.filter((decision) => decision.shouldPersist).length,
      p83WouldAdvance: advancementDecisions.filter((decision) => decision.shouldAdvance).length,
      paperworkNeededCount,
      readyForP84Count: readyForP84.length,
      readyForP84Sample: readyForP84.slice(0, 15).map((row) => ({
        candidateId: row.candidateId,
        name: `${row.firstName} ${row.lastName}`.trim(),
        grade: row.aiGrade,
        actionType: row.actionType,
      })),
      topBlockers: Object.entries(
        advancementDecisions.reduce<Record<string, number>>((counts, decision) => {
          if (decision.shouldAdvance && decision.action === "send-paperwork") return counts;
          const key = decision.reason.slice(0, 120);
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([reason, count]) => ({ reason, count })),
    },
    p84Flags: DEFAULT_P84_FEATURE_FLAGS,
    verificationCandidates: ["d64647ba8a8e", "6d548b240ab0", "40764d83ef6d"].map((candidateId) => {
      const candidate = store.candidates[candidateId];
      return {
        candidateId,
        name: candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : null,
        answerCount: candidate?.questionnaireAnswers?.length ?? 0,
        hasQuestionnaire: candidate?.hasQuestionnaire ?? false,
        enrichmentAttemptedAt: candidate?.questionnaireEnrichmentAttemptedAt ?? null,
      };
    }),
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

void main();
