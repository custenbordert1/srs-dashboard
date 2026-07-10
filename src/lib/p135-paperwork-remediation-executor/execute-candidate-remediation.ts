import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { mergeCandidateRecord } from "@/lib/candidate-ingestion/merge-candidate-record";
import { evaluateOrchestratorApproval } from "@/lib/autonomous-paperwork-orchestrator/evaluate-approvals";
import {
  evaluateCandidateEligibility,
} from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import type { LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { evaluatePilotCandidate } from "@/lib/p122-controlled-live-paperwork-pilot/evaluate-pilot-candidate";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { resolveApprovedMapping } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import { buildPaperworkRemediationReport } from "@/lib/p134-paperwork-remediation-engine/build-paperwork-remediation-report";
import type { CandidateRemediationPlan } from "@/lib/p134-paperwork-remediation-engine/types";
import {
  actionLabel,
  actionOwner,
  blockerToHumanAction,
  SAFE_REMEDIATION_ACTIONS,
} from "@/lib/p135-paperwork-remediation-executor/remediation-action-catalog";
import type {
  CandidateRemediationResult,
  HumanRemediationTask,
  RemediationCandidateState,
  RemediationExecutionRecord,
  SafeRemediationActionId,
} from "@/lib/p135-paperwork-remediation-executor/types";
import { randomUUID } from "node:crypto";

function captureState(input: {
  context: LoadedPaperworkCandidates;
  candidateId: string;
  blockerIds: string[];
}): RemediationCandidateState {
  const row = input.context.rowsByCandidateId.get(input.candidateId) ?? null;
  const approvedMapping = input.context.approvedMappingsByCandidate.get(input.candidateId) ?? null;
  const eligibility = evaluateCandidateEligibility({
    candidateId: input.candidateId,
    row,
    context: input.context,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    approvedMapping,
  });
  const pilotConfig = loadPilotConfig();
  const pilot = evaluatePilotCandidate({
    candidateId: input.candidateId,
    row,
    onboarding: input.context.onboardingByCandidateId.get(input.candidateId) ?? null,
    jobsByPositionId: input.context.jobsByPositionId,
    closedJobsByPositionId: input.context.closedJobsByPositionId,
    publishedJobs: input.context.publishedJobs,
    paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
    p100SentIds: input.context.p100SentIds,
    pilotSentIds: input.context.pilotSentIds,
    approvedMapping,
    config: { ...pilotConfig, allowlist: [input.candidateId] },
    pilotSendCount: 0,
  });
  const orchestrator = evaluateOrchestratorApproval({
    context: input.context,
    candidateId: input.candidateId,
    candidateName: row ? `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || input.candidateId : input.candidateId,
    eligibilityStatus: eligibility.status,
    templateKey: eligibility.templateKey,
    mappingConfidence: eligibility.mappingConfidence,
    approvedMappingReady: Boolean(approvedMapping?.qualifies),
    onPilotAllowlist: true,
    row,
  });

  return {
    approvalScore: orchestrator.approval.approvalScore,
    approvalDecision: orchestrator.approval.approvalDecision,
    eligibilityStatus: eligibility.status,
    p122Status: pilot.status,
    hasResume: Boolean(row?.hasResume),
    paperworkReady: row?.candidateGrade?.paperworkReady !== false,
    mappingConfidence: eligibility.mappingConfidence,
    blockerIds: [...input.blockerIds],
  };
}

async function applySafeAction(input: {
  action: SafeRemediationActionId;
  context: LoadedPaperworkCandidates;
  candidateId: string;
  ingestionCandidate?: import("@/lib/breezy-api").BreezyCandidate;
}): Promise<{ applied: boolean; auditTrail: string[] }> {
  const row = input.context.rowsByCandidateId.get(input.candidateId);
  const auditTrail: string[] = [];

  switch (input.action) {
    case "refresh_project_mapping": {
      const rowPosition = row?.positionId ?? null;
      const resolved = resolveApprovedMapping({
        record: input.context.p109ByCandidate.get(input.candidateId) ?? null,
        candidateId: input.candidateId,
        closedPositionId: rowPosition,
        publishedJobTitleById: input.context.publishedJobTitleById,
      });
      if (resolved) {
        input.context.approvedMappingsByCandidate.set(input.candidateId, resolved);
        auditTrail.push(`Resolved approved mapping for ${input.candidateId}.`);
        return { applied: true, auditTrail };
      }
      auditTrail.push("No P109 mapping record to refresh.");
      return { applied: false, auditTrail };
    }
    case "recompute_mapping_confidence": {
      const mapping = input.context.approvedMappingsByCandidate.get(input.candidateId);
      const p109 = input.context.p109ByCandidate.get(input.candidateId);
      const confidence = p109?.confidenceScore ?? mapping?.confidenceScore ?? 0;
      if (mapping) {
        input.context.approvedMappingsByCandidate.set(input.candidateId, {
          ...mapping,
          confidenceScore: confidence,
        });
      }
      auditTrail.push(`Recomputed mapping confidence from P109: ${confidence}%.`);
      return { applied: true, auditTrail };
    }
    case "refresh_resume_detection":
    case "refresh_questionnaire_enrichment":
    case "refresh_candidate_enrichment": {
      if (!input.ingestionCandidate || !row) {
        auditTrail.push("No ingestion record available for enrichment refresh.");
        return { applied: false, auditTrail };
      }
      const merged = mergeCandidateRecord(row as import("@/lib/breezy-api").BreezyCandidate, input.ingestionCandidate);
      input.context.rowsByCandidateId.set(input.candidateId, {
        ...row,
        hasResume: Boolean(row.hasResume || merged.hasResume || (merged.resumeAssets?.length ?? 0) > 0),
        resumeText: merged.resumeText || row.resumeText,
        resumeAssets: merged.resumeAssets ?? row.resumeAssets,
        questionnaireAnswers: merged.questionnaireAnswers ?? row.questionnaireAnswers,
        hasQuestionnaire: Boolean(merged.questionnaireAnswers?.length || row.hasQuestionnaire),
      });
      auditTrail.push("Merged latest ingestion enrichment into local workflow row.");
      return { applied: true, auditTrail };
    }
    case "assign_paperwork_ready_locally": {
      if (!row) return { applied: false, auditTrail: ["Candidate row missing."] };
      if (!row.hasResume) {
        auditTrail.push("Cannot assign paperwork-ready without resume.");
        return { applied: false, auditTrail };
      }
      input.context.rowsByCandidateId.set(input.candidateId, {
        ...row,
        candidateGrade: { ...(row.candidateGrade ?? {}), paperworkReady: true },
      });
      auditTrail.push("Set candidateGrade.paperworkReady=true locally.");
      return { applied: true, auditTrail };
    }
    case "regenerate_approval_score":
    case "rerun_p124_approval_engine":
    case "rerun_p123_orchestrator":
    case "rerun_p122_readiness_evaluation":
    case "clear_resolved_local_blockers":
    case "update_remediation_history":
      auditTrail.push(`Evaluated ${actionLabel(input.action)} (read-only).`);
      return { applied: true, auditTrail };
    default:
      return { applied: false, auditTrail: ["Unknown action."] };
  }
}

function buildHumanTasks(plan: CandidateRemediationPlan): HumanRemediationTask[] {
  return plan.blockers
    .filter((blocker) => blocker.manualActionRequired)
    .map((blocker, index) => {
      const action = blockerToHumanAction(blocker.id) ?? "modify_candidate_profile_breezy";
      return {
        taskId: randomUUID(),
        candidateId: plan.candidateId,
        candidateName: plan.candidateName,
        action,
        owner: actionOwner(action),
        blockerId: blocker.id,
        label: blocker.label,
        detail: blocker.detail,
        steps: blocker.remediationSteps,
        priority: plan.tier * 10 + index,
      };
    });
}

export async function executeCandidateRemediationPreview(input: {
  context: LoadedPaperworkCandidates;
  plan: CandidateRemediationPlan;
  ingestionByCandidateId: Map<string, import("@/lib/breezy-api").BreezyCandidate>;
}): Promise<CandidateRemediationResult> {
  const executionRecords: RemediationExecutionRecord[] = [];
  const initialBlockers = input.plan.blockers.map((b) => b.id);
  let beforeState = captureState({
    context: input.context,
    candidateId: input.plan.candidateId,
    blockerIds: initialBlockers,
  });

  const ingestionCandidate = input.ingestionByCandidateId.get(input.plan.candidateId);

  for (const action of SAFE_REMEDIATION_ACTIONS) {
    const started = Date.now();
    const stateBeforeAction = captureState({
      context: input.context,
      candidateId: input.plan.candidateId,
      blockerIds: beforeState.blockerIds,
    });

    const { applied, auditTrail } = await applySafeAction({
      action,
      context: input.context,
      candidateId: input.plan.candidateId,
      ingestionCandidate,
    });

    const afterState = captureState({
      context: input.context,
      candidateId: input.plan.candidateId,
      blockerIds: stateBeforeAction.blockerIds,
    });

    executionRecords.push({
      recordId: randomUUID(),
      candidateId: input.plan.candidateId,
      candidateName: input.plan.candidateName,
      action,
      owner: actionOwner(action),
      automatic: true,
      beforeState: stateBeforeAction,
      afterState,
      approvalScoreDelta: afterState.approvalScore - stateBeforeAction.approvalScore,
      decisionDelta:
        afterState.approvalDecision !== stateBeforeAction.approvalDecision
          ? `${stateBeforeAction.approvalDecision} → ${afterState.approvalDecision}`
          : null,
      executionTimeMs: Date.now() - started,
      success: applied || action.startsWith("rerun_") || action.startsWith("regenerate"),
      failureReason: applied ? null : auditTrail.join(" "),
      auditTrail,
    });

    beforeState = afterState;
  }

  const finalPlan = (
    await buildPaperworkRemediationReport({ contextOverride: input.context })
  ).candidatePlans.find((entry) => entry.candidateId === input.plan.candidateId);

  const blockersCleared = initialBlockers.filter(
    (id) => !finalPlan?.blockers.some((blocker) => blocker.id === id),
  );
  const humanTasks = buildHumanTasks(finalPlan ?? input.plan);

  return {
    candidateId: input.plan.candidateId,
    candidateName: input.plan.candidateName,
    tier: input.plan.tier,
    beforeScore: input.plan.currentScore,
    afterScore: beforeState.approvalScore,
    beforeDecision: input.plan.currentDecision,
    afterDecision: beforeState.approvalDecision,
    automaticActionsCompleted: executionRecords.filter((record) => record.success).length,
    manualTasksRemaining: humanTasks.length,
    blockersCleared,
    blockersRemaining: finalPlan?.blockers.map((b) => b.id) ?? [],
    resolved: beforeState.approvalDecision === "AUTO_APPROVED",
    executionRecords,
    humanTasks,
  };
}
