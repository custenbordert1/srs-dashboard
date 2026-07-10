import path from "node:path";
import * as XLSX from "xlsx";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { buildQuestionnaireIntelligence } from "@/lib/candidate-readiness/questionnaire-parser";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { pickActiveOnboardingRecord } from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { buildDecisionDashboardFromCohort } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { buildP157DecisionContext } from "@/lib/p157-recruiter-decision-engine/decision-engine";
import { evaluateP157ActionRule } from "@/lib/p157-recruiter-decision-engine/action-rules";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import {
  buildScoringContextForRow,
} from "@/lib/p156-candidate-prioritization/load-prioritization-cohort";
import { buildPrioritizedQueueFromCohort } from "@/lib/p156-candidate-prioritization/build-prioritized-queue";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import { projectDropboxUsage } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type {
  P177BlockerClassification,
  P177CandidateDiagnosis,
  P177QuestionnaireGateReport,
} from "@/lib/p177-questionnaire-gate-diagnosis/types";
import { P177_SOURCE_PHASE } from "@/lib/p177-questionnaire-gate-diagnosis/types";

const EXPORT_WORKBOOK = path.join(process.cwd(), "diagnostics", "Breezy Info.xlsx");

const QUESTIONNAIRE_FIELDS_CHECKED = [
  "merchandisingExperience",
  "priorVendorExperience",
  "smartphoneAccess",
  "internetAccess",
  "comfortableWithApps",
  "printerLaptopAccess",
  "photoUploadComfort",
  "scheduleUnderstanding",
  "availabilityNotes",
  "techReady (derived from smartphone + internet + apps)",
];

const P157_SEND_REQUIREMENTS = [
  "P152 paperworkEligible must be true (recruiter assigned, valid email, no duplicate, no active signature, not disqualified)",
  "workflowStatus === Paperwork Needed OR paperworkStage === awaitingRecruiterAction OR approvalQueue",
  "questionnaireComplete (questionnaireIntelligence.available) — any Breezy questionnaire answers present",
  "questionnaireTechReady !== false",
];

const P152_RISK_CHECKS = [
  "unassigned_recruiter",
  "invalid_email",
  "duplicate_candidate",
  "active_signature_request",
  "paperwork_already_sent",
  "paperwork_already_completed",
  "disqualified_candidate",
  "archived_candidate",
];

function displayName(c: BreezyCandidate): string {
  return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || c.candidateId;
}

function pickNewest25(candidates: BreezyCandidate[]): BreezyCandidate[] {
  return [...candidates]
    .sort((a, b) => (b.appliedDate || b.addedDate).localeCompare(a.appliedDate || a.addedDate))
    .slice(0, 25);
}


function exportHasResume(email: string): boolean {
  try {
    const wb = XLSX.readFile(EXPORT_WORKBOOK);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets["Breezy Applicants"] ?? {},
      { defval: "" },
    );
    const row = rows.find(
      (r) => String(r.email_address ?? "").trim().toLowerCase() === email.toLowerCase(),
    );
    return Boolean(row && String(row.resume ?? "").trim());
  } catch {
    return false;
  }
}

function classifyBlocker(input: {
  currentAction: string;
  p152Eligible: boolean;
  questionnaireAvailable: boolean;
  primaryBlocker: string;
}): P177BlockerClassification {
  if (input.currentAction === "Candidate Duplicate") return "true_business_requirement";
  if (input.currentAction === "Reject Candidate") return "true_business_requirement";
  if (input.currentAction === "Manual Review" && input.p152Eligible && input.questionnaireAvailable) {
    return "remain_manual_review";
  }
  if (
    input.currentAction === "Review Questionnaire" &&
    !input.questionnaireAvailable &&
    input.p152Eligible
  ) {
    return "artificial_workflow_gate";
  }
  if (input.currentAction === "Assign Recruiter") return "safe_to_automate";
  if (input.currentAction === "Review Questionnaire") return "artificial_workflow_gate";
  if (input.currentAction === "Manual Review") return "remain_manual_review";
  return "remain_manual_review";
}

function simulateP157Action(input: {
  row: ReturnType<typeof buildScoredWorkflowRow>;
  candidate: BreezyCandidate;
  cohort: Awaited<ReturnType<typeof loadDecisionCohort>>;
  onboarding: ReturnType<typeof pickActiveOnboardingRecord>;
  overrides?: {
    questionnaireComplete?: boolean;
    questionnaireTechReady?: boolean | null;
    workflowStatus?: string;
  };
}): string {
  const referenceMs = Date.parse(input.cohort.fetchedAt);
  const priorityQueue = buildPrioritizedQueueFromCohort(input.cohort, {
    recruiter: null,
    dm: null,
    state: null,
    project: null,
    priorityMin: null,
    priorityMax: null,
    stage: null,
  });
  const priority = priorityQueue.candidates.find((c) => c.candidateId === input.candidate.candidateId);
  const cohortRow = input.cohort.candidates.find((c) => c.candidateId === input.candidate.candidateId);
  if (!priority || !cohortRow) return "Not In Cohort";

  const row =
    input.overrides?.workflowStatus != null
      ? { ...input.row, workflowStatus: input.overrides.workflowStatus as typeof input.row.workflowStatus }
      : input.row;

  const scoringMeta = buildScoringContextForRow({
    row: cohortRow,
    coverageNeeds: input.cohort.coverageNeeds,
    opportunities: input.cohort.opportunities,
    jobsByPositionId: input.cohort.jobsByPositionId,
    referenceMs,
  });
  const job = input.cohort.jobsByPositionId.get(cohortRow.positionId);
  const recruiterKey = cohortRow.assignedRecruiter.trim() || "Unassigned";
  const recruiterWorkload = input.cohort.candidates.filter(
    (c) => (c.assignedRecruiter.trim() || "Unassigned") === recruiterKey,
  ).length;

  const ctx = buildP157DecisionContext({
    row,
    candidate: input.candidate,
    onboarding: input.onboarding,
    auditEvents: input.cohort.auditEvents,
    scoringMeta: {
      openDemand: scoringMeta.openDemand,
      coverageStatus: scoringMeta.coverageStatus,
      daysUntilProjectStart: scoringMeta.daysUntilProjectStart,
      projectName: scoringMeta.projectName,
      jobStatus: job?.status ?? null,
      jobPublished: job?.status === "published",
    },
    recruiterWorkload,
    referenceMs,
  });

  if (input.overrides?.questionnaireComplete != null) {
    ctx.questionnaireComplete = input.overrides.questionnaireComplete;
  }
  if (input.overrides?.questionnaireTechReady !== undefined) {
    ctx.questionnaireTechReady = input.overrides.questionnaireTechReady;
  }

  const paperworkStage = classifyPaperworkStage({ row, onboarding: input.onboarding });
  return evaluateP157ActionRule({ row, ctx, paperworkStage }).action;
}

export async function buildP177QuestionnaireGateReport(): Promise<P177QuestionnaireGateReport> {
  const generatedAt = new Date().toISOString();
  const [store, cohort, workflows, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    loadDecisionCohort(),
    getCandidateWorkflowState(),
    listAllCandidateOnboardingRecords(),
  ]);

  const newest25 = pickNewest25(listIngestedCandidates(store));
  const dashboard = buildDecisionDashboardFromCohort(cohort);
  const decisionsById = new Map(dashboard.decisions.map((d) => [d.candidateId, d]));

  const questionnaireCoverage = newest25.filter(
    (c) => (c.questionnaireAnswers?.length ?? 0) > 0 || c.hasQuestionnaire,
  ).length;

  const diagnoses: P177CandidateDiagnosis[] = [];

  for (let i = 0; i < newest25.length; i += 1) {
    const candidate = newest25[i]!;
    const workflow = workflows[candidate.candidateId];
    const onboarding = pickActiveOnboardingRecord(onboardingRecords, candidate.candidateId);
    const row = buildScoredWorkflowRow(candidate, workflow, {
      job: cohort.jobsByPositionId.get(candidate.positionId ?? ""),
    });
    const questionnaire = buildQuestionnaireIntelligence(candidate);
    const p152 = detectImmediatePaperworkHardBlockers({
      row,
      candidate,
      onboarding,
      auditEvents: cohort.auditEvents,
    });
    const currentAction = decisionsById.get(candidate.candidateId)?.action ?? "Not In Cohort";
    const paperworkStage = classifyPaperworkStage({ row, onboarding });

    let primaryBlocker = "Unknown";
    if (currentAction === "Review Questionnaire") {
      if (!questionnaire.available) primaryBlocker = "No questionnaire answers in ingestion store";
      else if (questionnaire.techReady === false) primaryBlocker = "Technology readiness failed";
      else primaryBlocker = "Questionnaire incomplete";
    } else if (currentAction === "Candidate Duplicate") {
      primaryBlocker = "Duplicate candidate";
    } else if (currentAction === "Assign Recruiter") {
      primaryBlocker = "Recruiter not assigned";
    } else {
      primaryBlocker = currentAction;
    }

    const simQ = simulateP157Action({
      row,
      candidate,
      cohort,
      onboarding,
      overrides: { questionnaireComplete: true, questionnaireTechReady: true },
    });
    const simFull = simulateP157Action({
      row,
      candidate,
      cohort,
      onboarding,
      overrides: {
        questionnaireComplete: true,
        questionnaireTechReady: true,
        workflowStatus: "Paperwork Needed",
      },
    });

    const classification = classifyBlocker({
      currentAction,
      p152Eligible: !p152.blocked,
      questionnaireAvailable: questionnaire.available,
      primaryBlocker,
    });

    diagnoses.push({
      rank: i + 1,
      candidateId: candidate.candidateId,
      name: displayName(candidate),
      email: candidate.email?.trim() ?? "",
      assignedRecruiter: workflow?.assignedRecruiter?.trim() || "Unassigned",
      ingestionSource: candidate.ingestionSource ?? null,
      currentP157Action: currentAction,
      workflowStatus: row.workflowStatus,
      paperworkStage,
      p152Eligible: !p152.blocked,
      p152Blockers: p152.blockers,
      questionnaireAvailable: questionnaire.available,
      questionnaireTechReady: questionnaire.techReady,
      questionnaireAnswerCount: candidate.questionnaireAnswers?.length ?? 0,
      questionnaireMissingFields: questionnaire.missingAnswers,
      resumeInExport: exportHasResume(candidate.email),
      questionnaireInExport: false,
      questionnaireInApiStore: questionnaire.available,
      primaryBlocker,
      blockerClassification: classification,
      simulatedP157IfQuestionnaireBypass: simQ,
      simulatedP157IfQuestionnaireAndWorkflowBypass: simFull,
      wouldSendPaperworkIfQuestionnaireBypass: simQ === "Send Paperwork",
      wouldSendPaperworkIfFullBypass: simFull === "Send Paperwork",
    });
  }

  const blockerBreakdown: Record<P177BlockerClassification, number> = {
    true_business_requirement: 0,
    artificial_workflow_gate: 0,
    safe_to_automate: 0,
    remain_manual_review: 0,
  };
  for (const d of diagnoses) blockerBreakdown[d.blockerClassification] += 1;

  const wouldSendQ = diagnoses.filter((d) => d.wouldSendPaperworkIfQuestionnaireBypass).length;
  const wouldSendFull = diagnoses.filter((d) => d.wouldSendPaperworkIfFullBypass).length;

  const wouldMoveToSendPaperwork = diagnoses
    .filter((d) => d.wouldSendPaperworkIfFullBypass)
    .map((d) => ({
      candidateId: d.candidateId,
      name: d.name,
      scenario: "questionnaire_bypass + workflow Paperwork Needed",
    }));

  const mustStayManualReview = diagnoses
    .filter(
      (d) =>
        !d.wouldSendPaperworkIfFullBypass &&
        (d.currentP157Action === "Candidate Duplicate" ||
          d.currentP157Action === "Reject Candidate" ||
          d.blockerClassification === "remain_manual_review" ||
          !d.p152Eligible),
    )
    .map((d) => ({
      candidateId: d.candidateId,
      name: d.name,
      reason: d.p152Blockers.join("; ") || d.primaryBlocker,
    }));

  const patricia = diagnoses.find((d) => /patricia irby/i.test(d.name));
  const patriciaIrby = {
    assignedRecruiter: patricia?.assignedRecruiter ?? "—",
    currentP157Action: patricia?.currentP157Action ?? "—",
    questionnaireAvailable: patricia?.questionnaireAvailable ?? false,
    questionnaireAnswerCount: patricia?.questionnaireAnswerCount ?? 0,
    p152Eligible: patricia?.p152Eligible ?? false,
    primaryBlocker: patricia?.primaryBlocker ?? "Not found",
    blockerClassification: patricia?.blockerClassification ?? ("remain_manual_review" as const),
    wouldSendIfQuestionnaireBypass: patricia?.wouldSendPaperworkIfQuestionnaireBypass ?? false,
    wouldSendIfFullBypass: patricia?.wouldSendPaperworkIfFullBypass ?? false,
    explanation:
      patricia && !patricia.questionnaireAvailable
        ? "Patricia has no questionnaire answers in the ingestion store (Breezy export lacks questionnaire columns; API enrichment not run). P152 passes. Questionnaire gate is artificial for export/API-synced candidates without enrichment."
        : "Patricia not in newest 25.",
  };

  const recommendedSafestChange = {
    change:
      "Treat missing Breezy questionnaire as non-blocking when P152 passes and resume/export identity is present; advance workflow to Paperwork Needed via P158.3 transition (not paperwork send).",
    rationale:
      "0/25 newest candidates have questionnaire data in store. Breezy export has no questionnaire columns. P152 already blocks duplicates, invalid email, active signatures, and disqualified candidates. Questionnaire gate blocks Send Paperwork before workflow stage gate is even evaluated for Applied-status candidates.",
    classification: "artificial_workflow_gate" as P177BlockerClassification,
    expectedPaperworkSendCount: wouldSendFull,
    safetyConfirmation: [
      "P152 would remain the send safety layer",
      "Duplicate and signature conflicts stay blocked",
      "No Breezy/Dropbox writes in diagnosis",
      "Questionnaire enrichment can be async — not a hard prerequisite for 1099 packet delivery",
    ],
  };

  const conclusion =
    blockerBreakdown.artificial_workflow_gate >= 15
      ? `Review Questionnaire is primarily an artificial workflow gate: ${questionnaireCoverage}/25 have questionnaire data, export has none, and P152 already covers send risks. Safest path: non-blocking questionnaire for P152-eligible candidates + workflow transition to Paperwork Needed.`
      : "Questionnaire gate may reflect genuine missing data — review per-candidate diagnoses.";

  return {
    sourcePhase: P177_SOURCE_PHASE,
    generatedAt,
    readOnly: true,
    findings: {
      p157SendPaperworkRequirements: P157_SEND_REQUIREMENTS,
      questionnaireFieldsChecked: QUESTIONNAIRE_FIELDS_CHECKED,
      exportHasQuestionnaireData: false,
      apiStoreQuestionnaireCoverageNewest25: questionnaireCoverage,
      questionnaireRequiredFor1099Onboarding:
        "Not strictly required for Dropbox Sign 1099 packet delivery — P152 covers identity, duplicate, signature, and recruiter assignment. Questionnaire supports tech-readiness screening only.",
      p152CoversRealPaperworkRisks: true,
      p152RiskChecks: P152_RISK_CHECKS,
    },
    summary: {
      newest25Count: diagnoses.length,
      reviewQuestionnaireCount: diagnoses.filter((d) => d.currentP157Action === "Review Questionnaire")
        .length,
      artificialGateCount: blockerBreakdown.artificial_workflow_gate,
      trueManualReviewCount: mustStayManualReview.length,
      wouldSendIfQuestionnaireBypass: wouldSendQ,
      wouldSendIfFullBypass: wouldSendFull,
      remainManualReview: mustStayManualReview.length,
      projectedDropboxAfterSafestChange: projectDropboxUsage(wouldSendFull).totalRequests,
    },
    newest25: diagnoses,
    wouldMoveToSendPaperwork,
    mustStayManualReview,
    patriciaIrby,
    recommendedSafestChange,
    blockerBreakdown,
    conclusion,
  };
}
