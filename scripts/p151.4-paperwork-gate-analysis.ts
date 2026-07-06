/**
 * P151.4 — Paperwork gate analysis for P151.3 assigned candidates
 *
 * Usage: npx tsx scripts/p151.4-paperwork-gate-analysis.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { isGradeAllowedForPaperwork } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import {
  evaluateCandidateFirstPaperwork,
  detectCandidateFirstHardBlockers,
  CANDIDATE_FIRST_CONFIDENCE_MIN,
  CANDIDATE_FIRST_OPERATIONAL_FIT_MIN,
} from "@/lib/candidate-first-paperwork-eligibility/evaluate-candidate-first-paperwork";
import {
  findNearestActiveOperationalNeed,
  hasOperationalFit,
  resolveOriginalJobStatus,
} from "@/lib/candidate-first-paperwork-eligibility/match-active-operational-need";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import { loadPipelineAdvancementAuditLog } from "@/lib/p151-autonomous-candidate-advancement/p151-advancement-audit-store";
import {
  analyzePipelineCandidate,
  mapToDashboardNextAction,
} from "@/lib/p151-autonomous-candidate-advancement/analyze-candidate-pipeline";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import type { PaperworkProductionCategory } from "@/lib/p150-controlled-production-activation/types";
import { evaluateCandidate } from "@/lib/recruiting/candidate-advancement-engine";
import {
  evaluateInitialPaperworkEligibility,
  P147_INITIAL_CONFIDENCE_MIN,
} from "@/lib/recruiting/initial-paperwork-execution-engine";
import {
  evaluatePaperworkCandidate,
  P145_COMMUNICATION_COOLDOWN_HOURS,
} from "@/lib/recruiting/paperwork-automation-engine";

const ASSIGNED_CANDIDATE_IDS = [
  "acff2383c00f",
  "3061a7d7b78f",
  "ca747f355c14",
  "a0e30984a18d",
  "2f5f144c00c8",
  "3f83160751e7",
  "a0119c861d63",
];

const SOURCE_P151_2 = "artifacts/p151.2-autonomous-recruiter-assignment.json";

type DecisionRule = {
  ruleEvaluated: string;
  result: string;
  reason: string;
  blocking: boolean;
  blockingRule: string | null;
  sourceFile: string;
  function: string;
};

type LayerTrace = {
  layer: string;
  decision: string;
  passed: boolean;
  rules: DecisionRule[];
  firstBlockingRule: DecisionRule | null;
};

type PipelineGate = {
  stage: string;
  passed: boolean;
  firstBlockingRule: DecisionRule | null;
};

type CandidateGateAnalysis = {
  candidateId: string;
  candidateName: string;
  summary: Record<string, string | number | boolean | null>;
  pipelineGates: PipelineGate[];
  layers: LayerTrace[];
  whatMustChange: string[];
};

function loadEnvLocal(): void {
  try {
    const envPath = path.resolve(".env.local");
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
      process.env[key] = value;
    }
  } catch {
    // use process env
  }
}

function rule(
  ruleEvaluated: string,
  result: string,
  reason: string,
  blocking: boolean,
  sourceFile: string,
  functionName: string,
): DecisionRule {
  return {
    ruleEvaluated,
    result,
    reason,
    blocking,
    blockingRule: blocking ? ruleEvaluated : null,
    sourceFile,
    function: functionName,
  };
}

function firstBlocking(rules: DecisionRule[]): DecisionRule | null {
  return rules.find((r) => r.blocking) ?? null;
}

function traceP83(row: ScoredCandidateWorkflowRow, jobsByPositionId: Map<string, BreezyJob>): LayerTrace {
  const rules: DecisionRule[] = [];
  const src = "src/lib/candidate-advancement-engine/build-advancement-decision.ts";
  const fn = "buildCandidateAdvancementDecision";

  const SCREEN_STATUSES = new Set(["Applied", "Needs Review", "Qualified"]);
  const SCREEN_ACTION_TYPES = new Set(["screen-candidate", "needs-review"]);
  const TERMINAL = new Set(["Not Qualified", "Active Rep", "Loaded in MEL", "Ready for MEL"]);
  const SKIP = new Set(["Paperwork Needed", "Paperwork Sent", "Signed"]);

  const isScreen =
    SCREEN_STATUSES.has(row.workflowStatus) ||
    SCREEN_ACTION_TYPES.has(row.actionType ?? "none");
  rules.push(
    rule(
      "isScreenStage(row)",
      isScreen ? "pass" : "fail",
      isScreen ? "Candidate at screen stage." : "Not at screen stage — advancement not evaluated.",
      !isScreen,
      src,
      fn,
    ),
  );
  if (!isScreen) {
    return { layer: "P83", decision: "none", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }

  const terminal = TERMINAL.has(row.workflowStatus);
  rules.push(
    rule(
      "TERMINAL_STATUSES.has(workflowStatus)",
      terminal ? "fail" : "pass",
      terminal ? "Terminal workflow — advancement skipped." : "Not terminal.",
      terminal,
      src,
      fn,
    ),
  );
  if (terminal) {
    return { layer: "P83", decision: "none", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }

  const skip = SKIP.has(row.workflowStatus);
  rules.push(
    rule(
      "SKIP_STATUSES.has(workflowStatus)",
      skip ? "fail" : "pass",
      skip ? "Already in paperwork funnel — advancement skipped." : "Not in paperwork funnel.",
      skip,
      src,
      fn,
    ),
  );
  if (skip) {
    return { layer: "P83", decision: "none", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }

  const activePacket = Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" ||
        row.paperworkStatus === "viewed" ||
        row.workflowStatus === "Paperwork Sent"),
  );
  rules.push(
    rule(
      "hasActivePacket(row)",
      activePacket ? "fail" : "pass",
      activePacket ? "Active paperwork packet — advancement skipped." : "No active packet.",
      activePacket,
      src,
      fn,
    ),
  );
  if (activePacket) {
    return { layer: "P83", decision: "none", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }

  const signed = row.paperworkStatus === "signed";
  rules.push(
    rule(
      "row.paperworkStatus === 'signed'",
      signed ? "fail" : "pass",
      signed ? "Paperwork signed — advancement skipped." : "Paperwork not signed.",
      signed,
      src,
      fn,
    ),
  );
  if (signed) {
    return { layer: "P83", decision: "none", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }

  const unassigned = isUnassignedRecruiter(row.assignedRecruiter);
  rules.push(
    rule(
      "isUnassignedRecruiter(assignedRecruiter)",
      unassigned ? "fail" : "pass",
      unassigned
        ? "Awaiting recruiter assignment before advancement."
        : `Recruiter assigned: ${row.assignedRecruiter}.`,
      unassigned,
      src,
      fn,
    ),
  );
  if (unassigned) {
    return { layer: "P83", decision: "hold", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }

  const missingEmail = !row.email?.trim();
  rules.push(
    rule(
      "row.email present",
      missingEmail ? "fail" : "pass",
      missingEmail ? "Missing contact email — hold until resolved." : `Email: ${row.email?.trim()}.`,
      missingEmail,
      src,
      fn,
    ),
  );
  if (missingEmail) {
    return { layer: "P83", decision: "hold", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }

  const publishedJobMatch = Boolean(row.positionId?.trim() && jobsByPositionId.has(row.positionId));
  rules.push(
    rule(
      "hasPublishedJobMatch(row, jobsByPositionId)",
      publishedJobMatch ? "pass" : "warn",
      publishedJobMatch
        ? "Original position is in published jobs map."
        : "Original ad closed/unpublished — candidate-first path allowed.",
      false,
      src,
      fn,
    ),
  );

  const review = evaluateApplicantReview(row);
  rules.push(
    rule(
      "evaluateApplicantReview(row).verdict",
      review.verdict,
      review.summary,
      review.verdict === "disqualified",
      "src/lib/hiring-automation-engine/evaluate-applicant-review.ts",
      "evaluateApplicantReview",
    ),
  );
  if (review.verdict === "disqualified") {
    return { layer: "P83", decision: "reject", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }

  const questionnaireGap =
    row.questionnaireIntelligence.techReady === false ||
    row.candidateGrade.gradeContributors.some((c) =>
      c.label.toLowerCase().includes("transportation not confirmed"),
    );
  rules.push(
    rule(
      "hasQuestionnaireGap(row)",
      questionnaireGap ? "fail" : "pass",
      questionnaireGap
        ? `Verification needed before paperwork: ${
            row.questionnaireIntelligence.techReady === false ? "technology readiness" : "transportation"
          }.`
        : "Questionnaire gaps cleared.",
      questionnaireGap,
      src,
      fn,
    ),
  );
  if (questionnaireGap) {
    return { layer: "P83", decision: "call-first", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }

  if (review.verdict === "incomplete") {
    rules.push(
      rule(
        "review.verdict === 'incomplete'",
        "fail",
        review.summary,
        true,
        src,
        fn,
      ),
    );
    return { layer: "P83", decision: "hold", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }
  rules.push(
    rule("review.verdict === 'incomplete'", "pass", "Profile not incomplete.", false, src, fn),
  );

  if (review.confidence === "low") {
    rules.push(
      rule(
        "review.confidence === 'low'",
        "fail",
        "Low confidence grade — recruiter contact required before paperwork.",
        true,
        src,
        fn,
      ),
    );
    return { layer: "P83", decision: "call-first", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }
  rules.push(rule("review.confidence === 'low'", "pass", `Confidence: ${review.confidence}.`, false, src, fn));

  if (review.verdict === "needs-review") {
    rules.push(
      rule("review.verdict === 'needs-review'", "fail", review.summary, true, src, fn),
    );
    return { layer: "P83", decision: "call-first", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
  }
  rules.push(rule("review.verdict === 'needs-review'", "pass", "Not needs-review.", false, src, fn));

  if (review.verdict === "qualified") {
    const gradeOk = isGradeAllowedForPaperwork(row.aiGrade, DEFAULT_PAPERWORK_BY_GRADE);
    rules.push(
      rule(
        "isGradeAllowedForPaperwork(aiGrade, paperworkByGrade)",
        gradeOk ? "pass" : "fail",
        gradeOk
          ? `Grade ${row.aiGrade} approved for paperwork.`
          : `Grade ${row.aiGrade} not approved for paperwork per onboarding policy.`,
        !gradeOk,
        src,
        fn,
      ),
    );
    if (!gradeOk) {
      return { layer: "P83", decision: "hold", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
    }
    const requireApproval = true;
    rules.push(
      rule(
        "requireApproval (default true)",
        requireApproval ? "fail" : "pass",
        requireApproval
          ? "P83 advancement requires human approval before shouldAdvance=true."
          : "Approval not required.",
        requireApproval,
        src,
        fn,
      ),
    );
    return {
      layer: "P83",
      decision: "send-paperwork",
      passed: !requireApproval,
      rules,
      firstBlockingRule: firstBlocking(rules),
    };
  }

  rules.push(
    rule("qualified path", "fail", "No advancement signal — monitor candidate.", true, src, fn),
  );
  return { layer: "P83", decision: "none", passed: false, rules, firstBlockingRule: firstBlocking(rules) };
}

function traceP144(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
  referenceMs: number,
): LayerTrace {
  const rules: DecisionRule[] = [];
  const src = "src/lib/recruiting/candidate-advancement-engine.ts";
  const advancementOptions = { jobsByPositionId, paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE };
  const p83 = buildCandidateAdvancementDecision(row, advancementOptions);
  const evaluation = evaluateCandidate({
    row,
    jobsByPositionId,
    advancementOptions,
    referenceMs,
  });

  if (!row.hasResume) {
    rules.push(
      rule("detectBlockers: !hasResume", "fail", "Missing Resume", true, src, "detectBlockers"),
    );
  } else {
    rules.push(rule("detectBlockers: hasResume", "pass", "Resume on file.", false, src, "detectBlockers"));
  }

  if (row.questionnaireIntelligence.techReady === false) {
    rules.push(
      rule(
        "detectBlockers: techReady=false",
        "fail",
        "Missing Questionnaire",
        true,
        src,
        "detectBlockers",
      ),
    );
  } else {
    rules.push(
      rule(
        "detectBlockers: questionnaire",
        "pass",
        `techReady=${String(row.questionnaireIntelligence.techReady)}`,
        false,
        src,
        "detectBlockers",
      ),
    );
  }

  const duplicate =
    (row.notes ?? []).some((n) => /duplicate/i.test(n)) ||
    row.candidateGrade.gradeContributors.some((c) => /duplicate/i.test(c.label));
  rules.push(
    rule(
      "detectBlockers: duplicate flags",
      duplicate ? "fail" : "pass",
      duplicate ? "Duplicate Candidate" : "No duplicate flag.",
      duplicate,
      src,
      "detectBlockers",
    ),
  );

  if (row.distanceMiles != null && row.distanceMiles > 90) {
    rules.push(
      rule(
        "detectBlockers: distanceMiles > 90",
        "fail",
        `Distance Too Far (${row.distanceMiles} mi)`,
        true,
        src,
        "detectBlockers",
      ),
    );
  } else {
    rules.push(
      rule(
        "detectBlockers: distance",
        "pass",
        row.distanceMiles == null ? "Distance unknown." : `${row.distanceMiles} mi`,
        false,
        src,
        "detectBlockers",
      ),
    );
  }

  if (row.workflowStatus === "Needs Review" || row.actionType === "needs-review") {
    rules.push(
      rule(
        "detectBlockers: manual review flag",
        "fail",
        "Manual Review Required",
        true,
        src,
        "detectBlockers",
      ),
    );
  } else {
    rules.push(rule("detectBlockers: manual review flag", "pass", "No manual review flag.", false, src, "detectBlockers"));
  }

  const unassigned = isUnassignedRecruiter(row.assignedRecruiter);
  rules.push(
    rule(
      "mapP83Action: dmNeedsAssignment",
      row.dmNeedsAssignment ? "fail" : "pass",
      row.dmNeedsAssignment
        ? `DM assignment pending (suggested: ${row.suggestedDM ?? "none"}) — forces nextAction=Assign Recruiter.`
        : "DM assignment satisfied.",
      row.dmNeedsAssignment,
      src,
      "mapP83Action",
    ),
  );
  rules.push(
    rule(
      "mapP83Action: isUnassignedRecruiter",
      unassigned ? "fail" : "pass",
      unassigned ? "Forces nextAction=Assign Recruiter" : `Recruiter ${row.assignedRecruiter} assigned.`,
      unassigned,
      src,
      "mapP83Action",
    ),
  );

  rules.push(
    rule(
      "mapP83Action: p83.action mapping",
      evaluation.nextAction,
      `P83 action=${p83.action}; mapped nextAction=${evaluation.nextAction}. ${p83.reason}`,
      evaluation.nextAction !== "Send Paperwork",
      src,
      "mapP83Action",
    ),
  );

  rules.push(
    rule(
      "automationEligibility",
      evaluation.automationEligible ? "eligible" : "blocked",
      evaluation.automationExplanation,
      !evaluation.automationEligible,
      src,
      "automationEligibility",
    ),
  );

  rules.push(
    rule(
      "evaluateCandidate confidence",
      String(evaluation.confidence),
      `Advancement score ${evaluation.advancementScore}/100; confidence ${evaluation.confidence}%.`,
      evaluation.confidence < 80,
      src,
      "estimateConfidence",
    ),
  );

  return {
    layer: "P144",
    decision: evaluation.nextAction,
    passed: evaluation.nextAction === "Send Paperwork" && evaluation.automationEligible,
    rules,
    firstBlockingRule: firstBlocking(rules),
  };
}

function traceP145(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
  advancement: ReturnType<typeof evaluateCandidate>,
  onboarding: ReturnType<typeof listAllCandidateOnboardingRecords> extends Promise<infer T>
    ? T extends (infer U)[]
      ? U | null
      : null
    : null,
  referenceMs: number,
): LayerTrace {
  const rules: DecisionRule[] = [];
  const src = "src/lib/recruiting/paperwork-automation-engine.ts";
  const context = { row, jobsByPositionId, onboarding, advancement, referenceMs };
  const queueItem = evaluatePaperworkCandidate(context);

  const archived =
    ["Not Qualified", "Active Rep", "Loaded in MEL", "Ready for MEL"].includes(row.workflowStatus) ||
    /archived|withdrawn|disqualified|rejected/i.test(`${row.workflowStatus} ${row.stage}`);
  rules.push(
    rule("isArchivedCandidate", archived ? "fail" : "pass", archived ? "Archived Candidate" : "Active.", archived, src, "isArchivedCandidate"),
  );

  const complete = row.paperworkStatus === "signed" || row.workflowStatus === "Signed";
  rules.push(
    rule("isPaperworkComplete", complete ? "fail" : "pass", complete ? "Completed Paperwork" : "Not complete.", complete, src, "isPaperworkComplete"),
  );

  if (!row.email?.trim()) {
    rules.push(rule("email present", "fail", "Missing Email", true, src, "detectExclusionBlockers"));
  } else {
    rules.push(rule("email present", "pass", row.email.trim(), false, src, "detectExclusionBlockers"));
  }

  const unassigned = isUnassignedRecruiter(row.assignedRecruiter);
  rules.push(
    rule(
      "isUnassignedRecruiter",
      unassigned ? "fail" : "pass",
      unassigned ? "Unassigned Recruiter" : row.assignedRecruiter,
      unassigned,
      src,
      "detectExclusionBlockers",
    ),
  );

  if (row.workflowStatus === "Needs Review" || row.actionType === "needs-review") {
    rules.push(rule("manual review workflow", "fail", "Manual Review Required", true, src, "detectExclusionBlockers"));
  }

  const eligibility = buildPaperworkSendEligibility({
    row,
    onboarding,
    jobsByPositionId,
    candidateFirstMode: !Boolean(row.positionId?.trim() && jobsByPositionId.has(row.positionId)),
    publishedJobs: [...jobsByPositionId.values()],
  });
  for (const gate of eligibility.gates) {
    rules.push(
      rule(
        `buildPaperworkSendEligibility: ${gate.id}`,
        gate.passed ? "pass" : "fail",
        gate.detail ?? gate.label,
        !gate.passed,
        "src/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility.ts",
        "buildPaperworkSendEligibility",
      ),
    );
  }

  rules.push(
    rule(
      "evaluatePaperworkCandidate: in queue",
      queueItem ? "yes" : "no",
      queueItem
        ? `recommendedAction=${queueItem.recommendedAction}; ${queueItem.reason}`
        : "Not readyToSend and not outstanding — excluded from paperwork queue.",
      queueItem == null,
      src,
      "evaluatePaperworkCandidate",
    ),
  );

  if (queueItem) {
    rules.push(
      rule(
        "resolveRecommendedAction",
        queueItem.recommendedAction,
        queueItem.reason,
        queueItem.recommendedAction !== "Send Initial Paperwork",
        src,
        "resolveRecommendedAction",
      ),
    );
  }

  return {
    layer: "P145",
    decision: queueItem?.recommendedAction ?? "NOT_IN_QUEUE",
    passed: queueItem?.recommendedAction === "Send Initial Paperwork",
    rules,
    firstBlockingRule: firstBlocking(rules),
  };
}

function traceP147(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
  advancement: ReturnType<typeof evaluateCandidate>,
  onboarding: Parameters<typeof evaluateInitialPaperworkEligibility>[0]["context"]["onboarding"],
  auditEvents: Awaited<ReturnType<typeof loadPaperworkAutomationAuditLog>>,
  referenceMs: number,
): LayerTrace {
  const rules: DecisionRule[] = [];
  const src = "src/lib/recruiting/initial-paperwork-execution-engine.ts";
  const context = { row, jobsByPositionId, onboarding, advancement, referenceMs };
  const eligibility = evaluateInitialPaperworkEligibility({
    context,
    advancement,
    auditEvents,
    referenceMs,
    candidateFirstMode: false,
  });

  rules.push(
    rule(
      "advancement.nextAction === 'Send Paperwork'",
      advancement.nextAction === "Send Paperwork" ? "pass" : "fail",
      `P144 next action is "${advancement.nextAction}", not Send Paperwork.`,
      advancement.nextAction !== "Send Paperwork",
      src,
      "evaluateInitialPaperworkEligibility",
    ),
  );

  rules.push(
    rule(
      `confidence >= ${P147_INITIAL_CONFIDENCE_MIN}`,
      advancement.confidence >= P147_INITIAL_CONFIDENCE_MIN ? "pass" : "fail",
      `Confidence ${advancement.confidence}% vs threshold ${P147_INITIAL_CONFIDENCE_MIN}%.`,
      advancement.confidence < P147_INITIAL_CONFIDENCE_MIN,
      src,
      "evaluateInitialPaperworkEligibility",
    ),
  );

  if (advancement.blockers.length > 0) {
    rules.push(
      rule(
        "P144 blockers",
        "fail",
        advancement.blockers.join(", "),
        true,
        src,
        "evaluateInitialPaperworkEligibility",
      ),
    );
  } else {
    rules.push(rule("P144 blockers", "pass", "No blockers.", false, src, "evaluateInitialPaperworkEligibility"));
  }

  const queueItem = evaluatePaperworkCandidate(context);
  rules.push(
    rule(
      "P145 queue recommends Send Initial Paperwork",
      queueItem?.recommendedAction === "Send Initial Paperwork" ? "pass" : "fail",
      queueItem
        ? `Queue action: ${queueItem.recommendedAction}`
        : "Candidate not in paperwork queue.",
      !queueItem || queueItem.recommendedAction !== "Send Initial Paperwork",
      src,
      "evaluateInitialPaperworkEligibility",
    ),
  );

  const job = row.positionId ? jobsByPositionId.get(row.positionId) : undefined;
  rules.push(
    rule(
      "published position exists",
      job ? "pass" : "fail",
      job ? `Job ${job.name} (${job.status})` : "No open published position.",
      !job,
      src,
      "evaluateInitialPaperworkEligibility",
    ),
  );

  if (job) {
    rules.push(
      rule(
        "job.status === 'published'",
        job.status === "published" ? "pass" : "fail",
        `Position status: ${job.status}`,
        job.status !== "published",
        src,
        "evaluateInitialPaperworkEligibility",
      ),
    );
  }

  for (const reason of eligibility.validation.reasons) {
    rules.push(
      rule(
        "eligibility validation",
        "fail",
        reason,
        true,
        src,
        "evaluateInitialPaperworkEligibility",
      ),
    );
  }

  return {
    layer: "P147",
    decision: eligibility.eligible ? "ELIGIBLE" : "BLOCKED",
    passed: eligibility.eligible,
    rules,
    firstBlockingRule: firstBlocking(rules),
  };
}

function classifyP150(input: {
  queueItem: ReturnType<typeof evaluatePaperworkCandidate>;
  eligibility: ReturnType<typeof evaluateInitialPaperworkEligibility>;
  advancement: ReturnType<typeof evaluateCandidate>;
  row: ScoredCandidateWorkflowRow;
}): { category: PaperworkProductionCategory; rules: DecisionRule[] } {
  const rules: DecisionRule[] = [];
  const src = "src/lib/p150-controlled-production-activation/classify-paperwork-candidates.ts";
  const fn = "classifyCategory";
  const { queueItem, eligibility, advancement, row } = input;
  const blockers = queueItem?.blockers ?? [];

  const onPaperworkPath =
    advancement.nextAction === "Send Paperwork" ||
    queueItem?.recommendedAction === "Send Initial Paperwork" ||
    row.workflowStatus === "Paperwork Needed" ||
    row.workflowStatus === "Paperwork Sent";

  if (eligibility.eligible) {
    rules.push(rule("eligibility.eligible", "pass", "READY_TO_SEND", false, src, fn));
    return { category: "READY_TO_SEND", rules };
  }

  if (queueItem?.recommendedAction === "Manual Review" || blockers.includes("Manual Review Required")) {
    rules.push(
      rule("manual review", "fail", eligibility.blockedReason ?? "Manual review required.", true, src, fn),
    );
    return { category: "MANUAL_REVIEW", rules };
  }

  if (!onPaperworkPath && !queueItem) {
    const reason = `P144 next action is "${advancement.nextAction}" — not yet paperwork-ready.`;
    rules.push(rule("NOT_REQUIRING_PAPERWORK", "fail", reason, true, src, fn));
    return { category: "NOT_REQUIRING_PAPERWORK", rules };
  }

  if (
    onPaperworkPath &&
    advancement.confidence < P147_INITIAL_CONFIDENCE_MIN
  ) {
    const reason = `Advancement confidence ${advancement.confidence}% below ${P147_INITIAL_CONFIDENCE_MIN}%.`;
    rules.push(rule("LOW_CONFIDENCE", "fail", reason, true, src, fn));
    return { category: "LOW_CONFIDENCE", rules };
  }

  rules.push(
    rule(
      "BLOCKED",
      "fail",
      eligibility.blockedReason ?? "Does not meet production send criteria.",
      true,
      src,
      fn,
    ),
  );
  return { category: "BLOCKED", rules };
}

function traceP151(
  row: ScoredCandidateWorkflowRow,
  candidate: BreezyCandidate,
  jobsByPositionId: Map<string, BreezyJob>,
  publishedJobs: BreezyJob[],
  onboarding: Parameters<typeof evaluateCandidateFirstPaperwork>[0]["onboarding"],
  referenceMs: number,
): LayerTrace {
  const rules: DecisionRule[] = [];
  const src = "src/lib/candidate-first-paperwork-eligibility/evaluate-candidate-first-paperwork.ts";
  const fn = "evaluateCandidateFirstPaperwork";
  const result = evaluateCandidateFirstPaperwork({
    row,
    candidate,
    jobsByPositionId,
    publishedJobs,
    onboarding,
    referenceMs,
  });
  const hard = detectCandidateFirstHardBlockers({ row, candidate, onboarding });
  const review = evaluateApplicantReview(row);
  const operationalFit = findNearestActiveOperationalNeed({
    candidateCity: candidate.city || "",
    candidateState: candidate.state || "",
    publishedJobs,
  });
  const originalJobStatus = resolveOriginalJobStatus(row.positionId, jobsByPositionId);

  rules.push(
    rule(
      "detectCandidateFirstHardBlockers",
      hard.blocked ? "fail" : "pass",
      hard.blocked ? hard.blockers.join(" ") : "No hard blockers.",
      hard.blocked,
      src,
      "detectCandidateFirstHardBlockers",
    ),
  );

  rules.push(
    rule(
      "recruiterAssigned",
      result.recruiterAssigned ? "pass" : "fail",
      result.recruiterAssigned ? `Recruiter: ${row.assignedRecruiter}` : "Unassigned.",
      !result.recruiterAssigned,
      src,
      fn,
    ),
  );

  rules.push(
    rule(
      "originalJobStatus",
      originalJobStatus,
      `Original Breezy ad status: ${originalJobStatus}`,
      false,
      src,
      fn,
    ),
  );

  rules.push(
    rule(
      "operationalFit",
      operationalFit ? String(operationalFit.matchScore) : "none",
      operationalFit
        ? `${operationalFit.jobName} score ${operationalFit.matchScore} (min ${CANDIDATE_FIRST_OPERATIONAL_FIT_MIN})`
        : "No matching active published job found.",
      !hasOperationalFit(operationalFit) && originalJobStatus !== "published",
      src,
      fn,
    ),
  );

  rules.push(
    rule(
      "evaluateApplicantReview.verdict",
      review.verdict,
      review.summary,
      review.verdict === "disqualified" || review.verdict === "needs-review" || review.verdict === "incomplete",
      "src/lib/hiring-automation-engine/evaluate-applicant-review.ts",
      "evaluateApplicantReview",
    ),
  );

  rules.push(
    rule(
      `advancement.confidence >= ${CANDIDATE_FIRST_CONFIDENCE_MIN}`,
      result.confidence >= CANDIDATE_FIRST_CONFIDENCE_MIN ? "pass" : "fail",
      `Confidence ${result.confidence}%`,
      result.confidence < CANDIDATE_FIRST_CONFIDENCE_MIN,
      src,
      fn,
    ),
  );

  rules.push(
    rule(
      "recommendedAction resolution",
      result.recommendedAction,
      result.reason,
      result.recommendedAction !== "Send Paperwork",
      src,
      fn,
    ),
  );

  return {
    layer: "P151",
    decision: result.recommendedAction,
    passed: result.sendPaperworkEligible,
    rules,
    firstBlockingRule: firstBlocking(rules),
  };
}

function buildWhatMustChange(
  p83: LayerTrace,
  p144: LayerTrace,
  p151: LayerTrace,
  review: ReturnType<typeof evaluateApplicantReview>,
): string[] {
  const changes: string[] = [];
  const p83Block = p83.firstBlockingRule?.ruleEvaluated ?? "";
  const p144Block = p144.firstBlockingRule?.ruleEvaluated ?? "";
  const p151Block = p151.firstBlockingRule?.ruleEvaluated ?? "";

  if (p83Block.includes("Questionnaire") || p83Block.includes("hasQuestionnaireGap")) {
    changes.push("Questionnaire: confirm technology readiness and transportation before paperwork.");
  }
  if (p83Block.includes("needs-review") || review.verdict === "needs-review") {
    changes.push("Recruiter Review required: Grade C or ambiguous profile needs recruiter sign-off.");
  }
  if (p83Block.includes("incomplete") || review.verdict === "incomplete") {
    changes.push("Resume or questionnaire gaps must be resolved (missing data blocks automation).");
  }
  if (p83Block.includes("confidence") && review.confidence === "low") {
    changes.push("Confidence too low: recruiter phone call required before paperwork.");
  }
  if (p83Block.includes("requireApproval")) {
    changes.push("P83 requireApproval=true: executive must enable approval bypass (P151) before autonomous send.");
  }
  if (p83Block.includes("disqualified") || review.verdict === "disqualified") {
    changes.push("Candidate disqualified (Grade D) — not eligible for paperwork automation.");
  }
  if (p144Block.includes("mapP83Action") && p144.decision === "Call Candidate") {
    changes.push("Phone call required: P83 action=call-first before Send Paperwork.");
  }
  if (p151Block.includes("operationalFit")) {
    changes.push("Operational fit: match to active published job or confirm project requirement with DM.");
  }
  if (p151Block.includes("confidence")) {
    changes.push(`Raise advancement confidence to ≥ ${CANDIDATE_FIRST_CONFIDENCE_MIN}% (resume, questionnaire, contact history).`);
  }
  if (p151Block.includes("HardBlockers") && p151.decision === "Do Not Send") {
    changes.push("Resolve hard blockers (duplicate, archived, invalid email, prior paperwork).");
  }
  if (changes.length === 0) {
    changes.push("Resolve first blocking rule in P83/P144 chain, then re-run paperwork eligibility.");
  }
  return [...new Set(changes)];
}

function buildPipelineGates(
  row: ScoredCandidateWorkflowRow,
  p83: LayerTrace,
  p144: LayerTrace,
  p147: LayerTrace,
): PipelineGate[] {
  const assignPassed = !isUnassignedRecruiter(row.assignedRecruiter);
  const dashboardAction = mapToDashboardNextAction(p144.decision as Parameters<typeof mapToDashboardNextAction>[0]);
  const reviewPassed =
    assignPassed &&
    (p144.decision === "Send Paperwork" ||
      dashboardAction === "Send Paperwork");
  const sendPassed = p147.passed;

  return [
    {
      stage: "Assign Recruiter → Recruiter Review",
      passed: assignPassed,
      firstBlockingRule: assignPassed
        ? null
        : rule(
            "isUnassignedRecruiter",
            "fail",
            "Recruiter not assigned",
            true,
            "src/lib/recruiting/candidate-advancement-engine.ts",
            "mapP83Action",
          ),
    },
    {
      stage: "Recruiter Review → Send Paperwork",
      passed: reviewPassed,
      firstBlockingRule: reviewPassed ? null : p83.firstBlockingRule ?? p144.firstBlockingRule,
    },
    {
      stage: "Send Paperwork (P147 eligibility)",
      passed: sendPassed,
      firstBlockingRule: sendPassed ? null : p147.firstBlockingRule,
    },
  ];
}

function formatMarkdown(report: {
  sourcePhase: string;
  generatedAt: string;
  candidates: CandidateGateAnalysis[];
  blockerSummary: Array<{ blocker: string; count: number; candidateIds: string[] }>;
  automationRecommendation: string;
}): string {
  const lines: string[] = [
    "# P151.4 — Paperwork Gate Analysis",
    "",
    `Generated: ${report.generatedAt}`,
    `Source: P151.3 live assignment (${ASSIGNED_CANDIDATE_IDS.length} candidates)`,
    "",
    "## Summary",
    "",
    "### Blocker counts",
    "",
  ];

  for (const item of report.blockerSummary) {
    lines.push(`- **${item.blocker}**: ${item.count} (${item.candidateIds.join(", ")})`);
  }

  lines.push("", "### Automation recommendation", "", report.automationRecommendation, "");

  for (const c of report.candidates) {
    lines.push("---", "");
    lines.push(`## ${c.candidateName} (\`${c.candidateId}\`)`, "");
    lines.push("### Candidate summary", "");
    for (const [key, value] of Object.entries(c.summary)) {
      lines.push(`- **${key}**: ${value}`);
    }

    lines.push("", "### Pipeline gates", "");
    for (const gate of c.pipelineGates) {
      lines.push(`#### ${gate.stage}`);
      lines.push(`- **Passed**: ${gate.passed ? "yes" : "no"}`);
      if (gate.firstBlockingRule) {
        lines.push(`- **First blocking rule**: ${gate.firstBlockingRule.ruleEvaluated}`);
        lines.push(`- **Reason**: ${gate.firstBlockingRule.reason}`);
        lines.push(`- **Source**: \`${gate.firstBlockingRule.sourceFile}\` → \`${gate.firstBlockingRule.function}\``);
      }
      lines.push("");
    }

    for (const layer of c.layers) {
      lines.push(`### ${layer.layer} — decision: \`${layer.decision}\` (passed: ${layer.passed})`, "");
      lines.push("| Rule evaluated | Result | Reason | Blocking | Source | Function |");
      lines.push("|---|---|---|---|---|---|");
      for (const r of layer.rules) {
        lines.push(
          `| ${r.ruleEvaluated} | ${r.result} | ${r.reason.replace(/\|/g, "/")} | ${r.blocking ? "yes" : "no"} | \`${r.sourceFile}\` | \`${r.function}\` |`,
        );
      }
      if (layer.firstBlockingRule) {
        lines.push(
          "",
          `**First blocking rule:** ${layer.firstBlockingRule.ruleEvaluated} — ${layer.firstBlockingRule.reason}`,
          "",
        );
      } else {
        lines.push("", "**No blocking rules in this layer.**", "");
      }
    }

    lines.push("### What must change for paperwork eligibility", "");
    for (const change of c.whatMustChange) {
      lines.push(`- ${change}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

const session = {
  userId: "p151.4-paperwork-gate",
  email: "p151.4@local",
  name: "P151.4 Paperwork Gate",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

async function main() {
  loadEnvLocal();
  const generatedAt = new Date().toISOString();
  const referenceMs = Date.parse(generatedAt);

  const [candidatesResult, jobsResult, bundle, onboardingRecords, paperworkAudit] = await Promise.all([
    resolveCandidatesForRead({ scanMode: "preview" }),
    fetchBreezyJobs("published").catch(() => ({
      ok: false as const,
      error: "Jobs unavailable",
      fetchedAt: generatedAt,
    })),
    getCandidateWorkflowBundle(),
    listAllCandidateOnboardingRecords().catch(() => []),
    loadPaperworkAutomationAuditLog().catch(() => []),
  ]);

  const candidates = candidatesResult.ok
    ? applyTerritoryToCandidates(session, candidatesResult.candidates)
    : [];
  const publishedJobs = jobsResult.ok ? applyTerritoryToJobs(session, jobsResult.jobs) : [];
  const jobsByPositionId = new Map(publishedJobs.map((job) => [job.jobId, job]));
  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const candidateById = new Map(candidates.map((c) => [c.candidateId, c]));

  const analyses: CandidateGateAnalysis[] = [];
  const blockerMap = new Map<string, { count: number; candidateIds: string[] }>();

  for (const candidateId of ASSIGNED_CANDIDATE_IDS) {
    const candidate = candidateById.get(candidateId);
    if (!candidate) {
      console.error(`[P151.4] Missing candidate ${candidateId}`);
      continue;
    }

    const row = buildScoredWorkflowRow(candidate, bundle.workflows[candidateId], {
      job: jobsByPositionId.get(candidate.positionId ?? ""),
    });
    const onboarding = onboardingByCandidate.get(candidateId) ?? null;
    const stateCode = normalizeStateCode(candidate.state || row.state || "");
    const dmTerritory = stateCode ? (getDmForState(stateCode) ?? null) : null;
    const operationalFit = findNearestActiveOperationalNeed({
      candidateCity: candidate.city || "",
      candidateState: candidate.state || "",
      publishedJobs,
    });
    const advancementOptions = { jobsByPositionId, paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE };
    const advancement = evaluateCandidate({
      row,
      jobsByPositionId,
      advancementOptions,
      referenceMs,
    });
    const p83Trace = traceP83(row, jobsByPositionId);
    const p144Trace = traceP144(row, jobsByPositionId, referenceMs);
    const p145Trace = traceP145(row, jobsByPositionId, advancement, onboarding, referenceMs);
    const p147Trace = traceP147(row, jobsByPositionId, advancement, onboarding, paperworkAudit, referenceMs);
    const p150 = classifyP150({
      queueItem: evaluatePaperworkCandidate({
        row,
        jobsByPositionId,
        onboarding,
        advancement,
        referenceMs,
      }),
      eligibility: evaluateInitialPaperworkEligibility({
        context: { row, jobsByPositionId, onboarding, advancement, referenceMs },
        advancement,
        auditEvents: paperworkAudit,
        referenceMs,
      }),
      advancement,
      row,
    });
    const p150Trace: LayerTrace = {
      layer: "P150",
      decision: p150.category,
      passed: p150.category === "READY_TO_SEND",
      rules: p150.rules,
      firstBlockingRule: firstBlocking(p150.rules),
    };
    const p151Trace = traceP151(row, candidate, jobsByPositionId, publishedJobs, onboarding, referenceMs);
    const pipeline = analyzePipelineCandidate({
      row,
      candidate,
      jobsByPositionId,
      advancementOptions,
      referenceMs,
    });
    const review = evaluateApplicantReview(row);

    const pipelineGates = buildPipelineGates(row, p83Trace, p144Trace, p147Trace);
    const whatMustChange = buildWhatMustChange(p83Trace, p144Trace, p151Trace, review);

    const primaryBlocker =
      pipelineGates.find((g) => !g.passed)?.firstBlockingRule?.ruleEvaluated ??
      p147Trace.firstBlockingRule?.ruleEvaluated ??
      "unknown";
    const bucket = blockerMap.get(primaryBlocker) ?? { count: 0, candidateIds: [] };
    bucket.count += 1;
    bucket.candidateIds.push(candidateId);
    blockerMap.set(primaryBlocker, bucket);

    analyses.push({
      candidateId,
      candidateName: pipeline.candidateName,
      summary: {
        candidate: pipeline.candidateName,
        currentStage: candidate.stage || row.stage || "—",
        currentStatus: row.workflowStatus,
        recruiterAssigned: !isUnassignedRecruiter(row.assignedRecruiter),
        recruiter: row.assignedRecruiter || "Unassigned",
        territory: dmTerritory ?? stateCode ?? "—",
        operationalFit: operationalFit
          ? `${operationalFit.jobName} (${operationalFit.matchScore})`
          : "none",
        confidence: advancement.confidence,
        p144Recommendation: advancement.nextAction,
        p145Decision: p145Trace.decision,
        p147Decision: p147Trace.decision,
        p150Classification: p150.category,
        p151Recommendation: p151Trace.decision,
        currentNextAction: pipeline.dashboardNextAction,
      },
      pipelineGates,
      layers: [p83Trace, p144Trace, p145Trace, p147Trace, p150Trace, p151Trace],
      whatMustChange,
    });
  }

  const blockerSummary = [...blockerMap.entries()]
    .map(([blocker, data]) => ({ blocker, count: data.count, candidateIds: data.candidateIds }))
    .sort((a, b) => b.count - a.count);

  const topBlocker = blockerSummary[0]?.blocker ?? "none";
  let automationRecommendation = "";
  if (topBlocker.includes("incomplete") || topBlocker.includes("hasResume")) {
    automationRecommendation =
      "Automate **resume ingestion and profile completion** next: 4/7 assigned candidates have Grade C / incomplete verdict because resume is missing (`!row.hasResume`). Recruiter assignment does not satisfy P83 — resume must be on file before advancement reaches send-paperwork.";
  } else if (topBlocker.includes("requireApproval") || topBlocker.includes("dmNeedsAssignment")) {
    automationRecommendation =
      "Automate **DM assignment + P83 approval bypass** next: qualified candidates reach P83 send-paperwork but P144 mapP83Action still returns Assign Recruiter when dmNeedsAssignment=true, and requireApproval=true blocks shouldAdvance.";
  } else if (topBlocker.includes("needs-review")) {
    automationRecommendation =
      "Automate **Recruiter Review completion** next: Grade C / needs-review candidates stall at P83 call-first even after recruiter assignment.";
  } else if (topBlocker.includes("disqualified")) {
    automationRecommendation =
      "No paperwork automation recommended for disqualified candidates — route to archive workflow.";
  } else {
    automationRecommendation =
      "Automate **recruiter contact + review workflow** next: assigned candidates remain on call-first/hold paths until P83 advances to send-paperwork.";
  }

  const report = {
    sourcePhase: "P151.4",
    generatedAt,
    assignedCandidateIds: ASSIGNED_CANDIDATE_IDS,
    sourceArtifact: SOURCE_P151_2,
    candidates: analyses,
    blockerSummary,
    automationRecommendation,
    safetyFlags: {
      paperworkSent: false,
      breezyWrites: false,
      codeModified: false,
    },
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p151.4-paperwork-gate-analysis.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p151.4-paperwork-gate-analysis.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        jsonPath,
        mdPath,
        candidatesAnalyzed: analyses.length,
        blockerSummary,
        automationRecommendation,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
