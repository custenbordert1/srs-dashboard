/**
 * P153 — End-to-End Candidate Trace
 *
 * Usage: npx tsx scripts/p153-end-to-end-candidate-trace.ts [candidateName] [--force-live]
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { buildCandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/build-advancement-decision";
import {
  findNearestActiveOperationalNeed,
  resolveOriginalJobStatus,
} from "@/lib/candidate-first-paperwork-eligibility/match-active-operational-need";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import {
  detectImmediatePaperworkHardBlockers,
} from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import {
  detectLegacyPaperworkBlockers,
  P152_BYPASSED_RULES,
} from "@/lib/p152-immediate-paperwork-policy/detect-legacy-paperwork-blockers";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import { evaluateRecruiterAssignmentCandidate } from "@/lib/p151-autonomous-recruiter-assignment/evaluate-recruiter-assignment-candidate";
import { evaluateCandidate } from "@/lib/recruiting/candidate-advancement-engine";
import {
  evaluateInitialPaperworkEligibility,
  P147_INITIAL_CONFIDENCE_MIN,
} from "@/lib/recruiting/initial-paperwork-execution-engine";
import {
  evaluatePaperworkCandidate,
} from "@/lib/recruiting/paperwork-automation-engine";
import { parseCandidateApplication } from "@/lib/recruiting-intelligence/resume-parser";

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const TARGET_NAME = args[0]?.trim() || "Taylor Custenborder";
const FORCE_LIVE = process.argv.includes("--force-live");

type DecisionRule = {
  order: number;
  stage: string;
  ruleEvaluated: string;
  result: string;
  reason: string;
  blocking: boolean;
  sourceFile: string;
  function: string;
  line?: string;
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

let ruleOrder = 0;
function nextRule(
  stage: string,
  ruleEvaluated: string,
  result: string,
  reason: string,
  blocking: boolean,
  sourceFile: string,
  functionName: string,
  line?: string,
): DecisionRule {
  ruleOrder += 1;
  return {
    order: ruleOrder,
    stage,
    ruleEvaluated,
    result,
    reason,
    blocking,
    sourceFile,
    function: functionName,
    line,
  };
}

function printRule(r: DecisionRule): void {
  const loc = r.line ? `${r.sourceFile}:${r.line}` : r.sourceFile;
  console.log(
    `[${r.order}] ${r.stage} | ${r.ruleEvaluated} | result=${r.result} | blocking=${r.blocking}\n` +
      `    reason: ${r.reason}\n` +
      `    source: ${loc} :: ${r.function}()`,
  );
}

function traceP83(row: ScoredCandidateWorkflowRow, jobsByPositionId: Map<string, BreezyJob>): DecisionRule[] {
  const rules: DecisionRule[] = [];
  const stage = "P83 Candidate Advancement";
  const src = "src/lib/candidate-advancement-engine/build-advancement-decision.ts";
  const fn = "buildCandidateAdvancementDecision";

  const SCREEN_STATUSES = new Set(["Applied", "Needs Review", "Qualified"]);
  const SCREEN_ACTION_TYPES = new Set(["screen-candidate", "needs-review"]);
  const TERMINAL = new Set(["Not Qualified", "Active Rep", "Loaded in MEL", "Ready for MEL"]);
  const SKIP = new Set(["Paperwork Needed", "Paperwork Sent", "Signed"]);

  const isScreen =
    SCREEN_STATUSES.has(row.workflowStatus) || SCREEN_ACTION_TYPES.has(row.actionType ?? "none");
  rules.push(
    nextRule(stage, "isScreenStage(row)", isScreen ? "pass" : "fail", isScreen ? "Candidate at screen stage." : "Not at screen stage.", !isScreen, src, fn),
  );
  if (!isScreen) return rules;

  const terminal = TERMINAL.has(row.workflowStatus);
  rules.push(nextRule(stage, "TERMINAL_STATUSES.has(workflowStatus)", terminal ? "fail" : "pass", terminal ? `Terminal: ${row.workflowStatus}` : "Not terminal.", terminal, src, fn));
  if (terminal) return rules;

  const skip = SKIP.has(row.workflowStatus);
  rules.push(nextRule(stage, "SKIP_STATUSES.has(workflowStatus)", skip ? "fail" : "pass", skip ? "In paperwork funnel." : "Not in paperwork funnel.", skip, src, fn));
  if (skip) return rules;

  const activePacket = Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" || row.paperworkStatus === "viewed" || row.workflowStatus === "Paperwork Sent"),
  );
  rules.push(nextRule(stage, "hasActivePacket(row)", activePacket ? "fail" : "pass", activePacket ? "Active packet exists." : "No active packet.", activePacket, src, fn));
  if (activePacket) return rules;

  const signed = row.paperworkStatus === "signed";
  rules.push(nextRule(stage, "row.paperworkStatus === 'signed'", signed ? "fail" : "pass", signed ? "Signed." : "Not signed.", signed, src, fn));
  if (signed) return rules;

  const unassigned = isUnassignedRecruiter(row.assignedRecruiter);
  rules.push(
    nextRule(
      stage,
      "isUnassignedRecruiter(assignedRecruiter)",
      unassigned ? "fail" : "pass",
      unassigned ? "Awaiting recruiter." : `Recruiter: ${row.assignedRecruiter}`,
      unassigned,
      src,
      fn,
    ),
  );
  if (unassigned) return rules;

  const missingEmail = !row.email?.trim();
  rules.push(nextRule(stage, "row.email present", missingEmail ? "fail" : "pass", missingEmail ? "Missing email." : row.email!.trim(), missingEmail, src, fn));
  if (missingEmail) return rules;

  const publishedJobMatch = Boolean(row.positionId?.trim() && jobsByPositionId.has(row.positionId));
  rules.push(
    nextRule(
      stage,
      "hasPublishedJobMatch(row, jobsByPositionId)",
      publishedJobMatch ? "pass" : "warn",
      publishedJobMatch ? "Original position in published jobs map." : "Original ad closed/unpublished.",
      false,
      src,
      fn,
    ),
  );

  const review = evaluateApplicantReview(row);
  rules.push(
    nextRule(stage, "evaluateApplicantReview(row).verdict", review.verdict, review.summary, review.verdict === "disqualified", "src/lib/hiring-automation-engine/evaluate-applicant-review.ts", "evaluateApplicantReview"),
  );
  if (review.verdict === "disqualified") return rules;

  const questionnaireGap =
    row.questionnaireIntelligence.techReady === false ||
    row.candidateGrade.gradeContributors.some((c) => c.label.toLowerCase().includes("transportation not confirmed"));
  rules.push(
    nextRule(
      stage,
      "hasQuestionnaireGap(row)",
      questionnaireGap ? "fail" : "pass",
      questionnaireGap ? "Questionnaire gap." : "Questionnaire gaps cleared.",
      questionnaireGap,
      src,
      fn,
    ),
  );
  if (questionnaireGap) return rules;

  if (review.verdict === "incomplete") {
    rules.push(nextRule(stage, "review.verdict === 'incomplete'", "fail", review.summary, true, src, fn));
    return rules;
  }
  rules.push(nextRule(stage, "review.verdict === 'incomplete'", "pass", "Profile not incomplete.", false, src, fn));

  if (review.confidence === "low") {
    rules.push(nextRule(stage, "review.confidence === 'low'", "fail", "Low confidence grade.", true, src, fn));
    return rules;
  }
  rules.push(nextRule(stage, "review.confidence === 'low'", "pass", `Confidence: ${review.confidence}.`, false, src, fn));

  if (review.verdict === "needs-review") {
    rules.push(nextRule(stage, "review.verdict === 'needs-review'", "fail", review.summary, true, src, fn));
    return rules;
  }
  rules.push(nextRule(stage, "review.verdict === 'needs-review'", "pass", "Not needs-review.", false, src, fn));

  if (review.verdict === "qualified") {
    const gradeOk = isGradeAllowedForPaperwork(row.aiGrade, DEFAULT_PAPERWORK_BY_GRADE);
    rules.push(
      nextRule(
        stage,
        "isGradeAllowedForPaperwork(aiGrade, paperworkByGrade)",
        gradeOk ? "pass" : "fail",
        gradeOk ? `Grade ${row.aiGrade} approved.` : `Grade ${row.aiGrade} not approved.`,
        !gradeOk,
        src,
        fn,
      ),
    );
    if (!gradeOk) return rules;

    const requireApproval = true;
    rules.push(
      nextRule(
        stage,
        "requireApproval (default true)",
        requireApproval ? "fail" : "pass",
        requireApproval ? "P83 requires human approval before shouldAdvance=true." : "Approval not required.",
        requireApproval,
        src,
        fn,
      ),
    );
    return rules;
  }

  rules.push(nextRule(stage, "qualified path", "fail", "No advancement signal.", true, src, fn));
  return rules;
}

async function main() {
  loadEnvLocal();
  ruleOrder = 0;
  const referenceMs = Date.now();
  const generatedAt = new Date(referenceMs).toISOString();

  const candidatesResult = await resolveCandidatesForRead({
    scanMode: "fast",
    force: FORCE_LIVE,
    candidateLookup: FORCE_LIVE
      ? { name: TARGET_NAME, email: "custenborder.taylor@gmail.com" }
      : undefined,
  });
  if (!candidatesResult.ok) {
    console.error(`Failed to load candidates: ${candidatesResult.error}`);
    process.exit(1);
  }
  const candidates = candidatesResult.candidates;
  const nameMatches = candidates.filter((c) =>
    (c.name ?? `${c.firstName ?? ""} ${c.lastName ?? ""}`).toLowerCase().includes(TARGET_NAME.toLowerCase()),
  );

  if (nameMatches.length === 0) {
    console.error(`No candidate matching "${TARGET_NAME}" found.`);
    process.exit(1);
  }

  const candidate = nameMatches.sort((a, b) => {
    const da = a.appliedDate || a.addedDate || a.creationDate || a.updatedDate || "";
    const db = b.appliedDate || b.addedDate || b.creationDate || b.updatedDate || "";
    return db.localeCompare(da);
  })[0];

  const jobsResult = await fetchBreezyJobs();
  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(jobs.map((j) => [j.jobId, j]));
  const publishedJobs = jobs.filter((j) => j.status === "published");
  const bundle = await getCandidateWorkflowBundle();
  const workflow = bundle.workflows[candidate.candidateId];
  const onboardingRecords = await listAllCandidateOnboardingRecords();
  const onboarding = onboardingRecords.find((r) => r.candidateId === candidate.candidateId) ?? null;
  const paperworkAudit = await loadPaperworkAutomationAuditLog();

  const row = buildScoredWorkflowRow(candidate, workflow, {
    job: jobsByPositionId.get(candidate.positionId ?? ""),
  });

  const { hasResume, resumeText } = parseCandidateApplication(candidate);
  const questionnaireDetected =
    row.questionnaireIntelligence.available === true || row.questionnaireIntelligence.techReady != null;
  const originalJobStatus = resolveOriginalJobStatus(row.positionId, jobsByPositionId);
  const originalJob = row.positionId ? jobsByPositionId.get(row.positionId) : undefined;

  const advancementOptions = { jobsByPositionId, paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE };
  const p83Decision = buildCandidateAdvancementDecision(row, advancementOptions);
  const advancement = evaluateCandidate({ row, jobsByPositionId, advancementOptions, referenceMs });
  const review = evaluateApplicantReview(row);

  const assignmentDecisions = buildRecruiterAssignmentDecisions({
    candidates: [candidate],
    workflows: bundle.workflows,
    rosters: bundle.rosters,
    jobsByPositionId,
  });
  const assignmentDecision = assignmentDecisions.find((d) => d.candidateId === candidate.candidateId)!;
  const recruiterEval = evaluateRecruiterAssignmentCandidate({
    row,
    candidate,
    assignment: assignmentDecision,
    jobsByPositionId,
    publishedJobs,
    onboarding,
    referenceMs,
  });

  const stateCode = normalizeStateCode(candidate.state || row.state || "");
  const dmTerritory = stateCode ? (getDmForState(stateCode) ?? null) : null;
  const operationalFit = findNearestActiveOperationalNeed({
    candidateCity: candidate.city || "",
    candidateState: candidate.state || "",
    publishedJobs,
  });

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

  const candidateAudit = paperworkAudit.filter((e) => e.candidateId === candidate.candidateId);
  const dropboxAudit = candidateAudit.filter(
    (e) =>
      e.type === "paperwork_sent" ||
      e.type === "initial_paperwork_sent" ||
      e.sendResult === "sent",
  );

  const allRules: DecisionRule[] = [];

  console.log("=".repeat(80));
  console.log("P153 — END-TO-END CANDIDATE TRACE");
  console.log(`Generated: ${generatedAt}`);
  console.log(`Target: ${TARGET_NAME}`);
  console.log(`Selected candidate (newest match): ${candidate.name ?? row.firstName} (ID: ${candidate.candidateId})`);
  if (nameMatches.length > 1) {
    console.log(`Note: ${nameMatches.length} name matches found; using newest by creationDate.`);
    for (const m of nameMatches) {
      console.log(`  - ${m.candidateId} | ${m.name ?? `${m.firstName} ${m.lastName}`} | appliedDate=${m.appliedDate || m.addedDate || "—"} | ${m.city}, ${m.state}`);
    }
  }
  console.log("=".repeat(80));

  // 1. Breezy ingestion
  console.log("\n## 1. BREEZY INGESTION\n");
  const breezyFields = [
    ["Candidate ID", candidate.candidateId],
    ["Candidate Name", candidate.name ?? `${candidate.firstName} ${candidate.lastName}`],
    ["Position ID", candidate.positionId ?? "—"],
    ["Position Name", row.positionName ?? candidate.positionName ?? "—"],
    ["Original Job Status", originalJobStatus],
    ["Original Job Breezy Status", originalJob?.status ?? "not_in_published_map"],
    ["Application Date (creationDate)", candidate.creationDate ?? "—"],
    ["Stage (Breezy)", candidate.stage ?? "—"],
    ["Email", candidate.email ?? "—"],
    ["City/State", `${candidate.city ?? "—"}, ${candidate.state ?? "—"}`],
    ["Resume detected (parseCandidateApplication)", String(hasResume)],
    ["Resume text length", String(resumeText.length)],
    ["Row hasResume", String(row.hasResume)],
    ["Questionnaire detected", String(questionnaireDetected)],
    ["questionnaireIntelligence.available", String(row.questionnaireIntelligence.available)],
    ["questionnaireIntelligence.techReady", String(row.questionnaireIntelligence.techReady)],
  ];
  for (const [k, v] of breezyFields) console.log(`${k}: ${v}`);

  // 2. P83
  console.log("\n## 2. P83 CANDIDATE ADVANCEMENT\n");
  const p83Rules = traceP83(row, jobsByPositionId);
  allRules.push(...p83Rules);
  for (const r of p83Rules) printRule(r);
  const p83Blocker = p83Rules.find((r) => r.blocking) ?? null;
  console.log(`\nP83 final recommendation (buildCandidateAdvancementDecision): action=${p83Decision.action}`);
  console.log(`P83 reason: ${p83Decision.reason}`);
  console.log(`P83 requiresApproval: ${p83Decision.requiresApproval}`);
  console.log(`P83 shouldAdvance: ${p83Decision.shouldAdvance}`);
  console.log(`P83 exact blocker: ${p83Blocker ? `${p83Blocker.ruleEvaluated} — ${p83Blocker.reason}` : "none (or blocked only by requireApproval)"}`);

  // 3. P144
  console.log("\n## 3. P144 DECISION ENGINE\n");
  const p144Stage = "P144 Decision Engine";
  const p144Src = "src/lib/recruiting/candidate-advancement-engine.ts";

  const p144Rules: DecisionRule[] = [];
  p144Rules.push(
    nextRule(p144Stage, "detectBlockers: !hasResume", row.hasResume ? "pass" : "fail", row.hasResume ? "Resume on file." : "Missing Resume", !row.hasResume, p144Src, "detectBlockers"),
  );
  p144Rules.push(
    nextRule(
      p144Stage,
      "detectBlockers: techReady",
      row.questionnaireIntelligence.techReady === false ? "fail" : "pass",
      row.questionnaireIntelligence.techReady === false ? "Missing Questionnaire" : `techReady=${String(row.questionnaireIntelligence.techReady)}`,
      row.questionnaireIntelligence.techReady === false,
      p144Src,
      "detectBlockers",
    ),
  );
  const duplicate =
    (row.notes ?? []).some((n) => /duplicate/i.test(n)) ||
    row.candidateGrade.gradeContributors.some((c) => /duplicate/i.test(c.label));
  p144Rules.push(nextRule(p144Stage, "detectBlockers: duplicate flags", duplicate ? "fail" : "pass", duplicate ? "Duplicate Candidate" : "No duplicate flag.", duplicate, p144Src, "detectBlockers"));
  p144Rules.push(
    nextRule(
      p144Stage,
      "detectBlockers: distanceMiles > 90",
      row.distanceMiles != null && row.distanceMiles > 90 ? "fail" : "pass",
      row.distanceMiles == null ? "Distance unknown." : `${row.distanceMiles} mi`,
      row.distanceMiles != null && row.distanceMiles > 90,
      p144Src,
      "detectBlockers",
    ),
  );
  p144Rules.push(
    nextRule(
      p144Stage,
      "detectBlockers: manual review flag",
      row.workflowStatus === "Needs Review" || row.actionType === "needs-review" ? "fail" : "pass",
      row.workflowStatus === "Needs Review" || row.actionType === "needs-review" ? "Manual Review Required" : "No manual review flag.",
      row.workflowStatus === "Needs Review" || row.actionType === "needs-review",
      p144Src,
      "detectBlockers",
    ),
  );
  p144Rules.push(
    nextRule(
      p144Stage,
      "mapP83Action: dmNeedsAssignment",
      row.dmNeedsAssignment ? "fail" : "pass",
      row.dmNeedsAssignment ? `DM pending (suggested: ${row.suggestedDM ?? "none"})` : "DM satisfied.",
      row.dmNeedsAssignment,
      p144Src,
      "mapP83Action",
    ),
  );
  const unassignedRecruiter = isUnassignedRecruiter(row.assignedRecruiter);
  p144Rules.push(
    nextRule(
      p144Stage,
      "mapP83Action: isUnassignedRecruiter",
      unassignedRecruiter ? "fail" : "pass",
      unassignedRecruiter ? "Forces nextAction=Assign Recruiter" : `Recruiter ${row.assignedRecruiter}`,
      unassignedRecruiter,
      p144Src,
      "mapP83Action",
    ),
  );
  p144Rules.push(
    nextRule(
      p144Stage,
      "mapP83Action: p83.action mapping",
      advancement.nextAction,
      `P83 action=${p83Decision.action}; mapped nextAction=${advancement.nextAction}. ${p83Decision.reason}`,
      advancement.nextAction !== "Send Paperwork",
      p144Src,
      "mapP83Action",
    ),
  );
  p144Rules.push(
    nextRule(p144Stage, "automationEligibility", advancement.automationEligible ? "eligible" : "blocked", advancement.automationExplanation, !advancement.automationEligible, p144Src, "automationEligibility"),
  );
  p144Rules.push(
    nextRule(p144Stage, "estimateConfidence", String(advancement.confidence), `Score ${advancement.advancementScore}/100; confidence ${advancement.confidence}%.`, advancement.confidence < 80, p144Src, "estimateConfidence"),
  );
  allRules.push(...p144Rules);
  for (const r of p144Rules) printRule(r);
  console.log(`\nP144 next action: ${advancement.nextAction}`);
  console.log(`P144 confidence: ${advancement.confidence}%`);
  console.log(`P144 blockers: ${advancement.blockers.length ? advancement.blockers.join("; ") : "(none)"}`);
  console.log(`P144 warnings: ${advancement.warnings?.length ? advancement.warnings.join("; ") : "(none)"}`);

  // 4. Recruiter Assignment
  console.log("\n## 4. RECRUITER ASSIGNMENT\n");
  const raStage = "Recruiter Assignment";
  const raRules: DecisionRule[] = [];
  raRules.push(nextRule(raStage, "workflow.assignedRecruiter", isUnassignedRecruiter(row.assignedRecruiter) ? "unassigned" : "assigned", row.assignedRecruiter || "Unassigned", isUnassignedRecruiter(row.assignedRecruiter), "src/lib/candidate-workflow-store.ts", "getCandidateWorkflowBundle"));
  raRules.push(nextRule(raStage, "normalizeStateCode(candidate.state)", stateCode || "empty", `State code: ${stateCode || "could not resolve"}`, !stateCode, "src/lib/dm-territory-map.ts", "normalizeStateCode"));
  raRules.push(nextRule(raStage, "getDmForState(stateCode)", dmTerritory ?? "none", `DM for ${stateCode}: ${dmTerritory ?? "not mapped"}`, false, "src/lib/dm-territory-map.ts", "getDmForState"));
  raRules.push(nextRule(raStage, "buildRecruiterAssignmentDecision.territoryState", assignmentDecision.territoryState ?? "null", assignmentDecision.reason, false, "src/lib/recruiter-assignment-engine/build-assignment-decision.ts", "buildRecruiterAssignmentDecision"));
  raRules.push(nextRule(raStage, "buildRecruiterAssignmentDecision.shouldAssign", String(assignmentDecision.shouldAssign), `Recommended recruiter: ${assignmentDecision.recruiter || "none"}; confidence ${assignmentDecision.confidence}%`, !assignmentDecision.shouldAssign, "src/lib/recruiter-assignment-engine/build-assignment-decision.ts", "buildRecruiterAssignmentDecision"));
  raRules.push(nextRule(raStage, "evaluateRecruiterAssignmentCandidate.recommendation", recruiterEval.recommendation, recruiterEval.reason, recruiterEval.recommendation !== "Assign Recruiter", "src/lib/p151-autonomous-recruiter-assignment/evaluate-recruiter-assignment-candidate.ts", "evaluateRecruiterAssignmentCandidate"));
  if (operationalFit) {
    raRules.push(nextRule(raStage, "findNearestActiveOperationalNeed", String(operationalFit.matchScore), `${operationalFit.jobName} — ${operationalFit.reason}`, false, "src/lib/candidate-first-paperwork-eligibility/match-active-operational-need.ts", "findNearestActiveOperationalNeed"));
  } else {
    raRules.push(nextRule(raStage, "findNearestActiveOperationalNeed", "none", "No matching active published job within territory/distance search.", true, "src/lib/candidate-first-paperwork-eligibility/match-active-operational-need.ts", "findNearestActiveOperationalNeed"));
  }
  allRules.push(...raRules);
  for (const r of raRules) printRule(r);
  console.log(`\nRecruiter assigned in workflow: ${isUnassignedRecruiter(row.assignedRecruiter) ? "NO" : "YES"} — ${row.assignedRecruiter}`);
  console.log(`Assigned DM (workflow): ${row.assignedDM || "Unassigned"}`);
  console.log(`Suggested DM: ${row.suggestedDM ?? "—"}`);
  console.log(`Territory match: state=${stateCode} → DM=${dmTerritory} → recommended recruiter=${assignmentDecision.recruiter} (${assignmentDecision.confidence}%)`);
  console.log(`P151.2 recommendation: ${recruiterEval.recommendation} — ${recruiterEval.reason}`);

  // 5. Workflow Store
  console.log("\n## 5. WORKFLOW STORE\n");
  const expectedStatus =
    advancement.nextAction === "Send Paperwork"
      ? "Paperwork Needed"
      : advancement.nextAction === "Assign Recruiter"
        ? "Applied"
        : row.workflowStatus;
  const wfFields: [string, string][] = [
    ["workflowStatus (current)", workflow?.workflowStatus ?? row.workflowStatus],
    ["workflowStatus (expected)", expectedStatus],
    ["actionType", workflow?.actionType ?? row.actionType ?? "—"],
    ["requiredAction", workflow?.requiredAction ?? row.requiredAction ?? "—"],
    ["assignedRecruiter", workflow?.assignedRecruiter ?? row.assignedRecruiter],
    ["assignedDM", workflow?.assignedDM ?? row.assignedDM ?? "—"],
    ["paperworkStatus", workflow?.paperworkStatus ?? row.paperworkStatus],
    ["signatureRequestId", workflow?.signatureRequestId ?? row.signatureRequestId ?? "—"],
    ["recruiterAssignmentSource", workflow?.recruiterAssignmentSource ?? "—"],
    ["recruiterAssignmentConfidence", String(workflow?.recruiterAssignmentConfidence ?? "—")],
  ];
  for (const [k, v] of wfFields) console.log(`${k}: ${v}`);

  const missingTransitions: string[] = [];
  if (isUnassignedRecruiter(row.assignedRecruiter) && advancement.nextAction !== "Assign Recruiter") {
    missingTransitions.push("Recruiter unassigned but P144 next action is not Assign Recruiter.");
  }
  if (advancement.nextAction === "Send Paperwork" && row.workflowStatus !== "Paperwork Needed") {
    missingTransitions.push(`Expected workflowStatus=Paperwork Needed but current=${row.workflowStatus}.`);
  }
  if (p83Decision.action === "send-paperwork" && row.workflowStatus === "Applied" && p83Decision.requiresApproval) {
    missingTransitions.push("P83 recommends send-paperwork but requireApproval=true blocks workflow transition to Paperwork Needed.");
  }
  if (row.dmNeedsAssignment && row.suggestedDM) {
    missingTransitions.push(`DM assignment pending — suggested DM ${row.suggestedDM} not applied.`);
  }
  console.log(`\nMissing transitions:`);
  if (missingTransitions.length === 0) console.log("  (none detected)");
  else for (const t of missingTransitions) console.log(`  - ${t}`);

  // 6. P145
  console.log("\n## 6. P145 PAPERWORK QUEUE\n");
  const p145Stage = "P145 Paperwork Queue";
  const p145Rules: DecisionRule[] = [];
  const archived =
    ["Not Qualified", "Active Rep", "Loaded in MEL", "Ready for MEL"].includes(row.workflowStatus) ||
    /archived|withdrawn|disqualified|rejected/i.test(`${row.workflowStatus} ${row.stage}`);
  p145Rules.push(nextRule(p145Stage, "isArchivedCandidate", archived ? "fail" : "pass", archived ? "Archived" : "Active", archived, "src/lib/recruiting/paperwork-automation-engine.ts", "isArchivedCandidate"));
  const complete = row.paperworkStatus === "signed" || row.workflowStatus === "Signed";
  p145Rules.push(nextRule(p145Stage, "isPaperworkComplete", complete ? "fail" : "pass", complete ? "Complete" : "Not complete", complete, "src/lib/recruiting/paperwork-automation-engine.ts", "isPaperworkComplete"));
  p145Rules.push(nextRule(p145Stage, "email present", row.email?.trim() ? "pass" : "fail", row.email?.trim() || "Missing Email", !row.email?.trim(), "src/lib/recruiting/paperwork-automation-engine.ts", "detectExclusionBlockers"));
  p145Rules.push(nextRule(p145Stage, "isUnassignedRecruiter", unassignedRecruiter ? "fail" : "pass", unassignedRecruiter ? "Unassigned Recruiter" : row.assignedRecruiter, unassignedRecruiter, "src/lib/recruiting/paperwork-automation-engine.ts", "detectExclusionBlockers"));
  const eligibility = buildPaperworkSendEligibility({
    row,
    onboarding,
    jobsByPositionId,
    candidateFirstMode: !Boolean(row.positionId?.trim() && jobsByPositionId.has(row.positionId)),
    publishedJobs: [...jobsByPositionId.values()],
  });
  for (const gate of eligibility.gates) {
    p145Rules.push(
      nextRule(
        p145Stage,
        `buildPaperworkSendEligibility: ${gate.id}`,
        gate.passed ? "pass" : "fail",
        gate.detail ?? gate.label,
        !gate.passed,
        "src/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility.ts",
        "buildPaperworkSendEligibility",
      ),
    );
  }
  p145Rules.push(
    nextRule(
      p145Stage,
      "evaluatePaperworkCandidate: in queue",
      queueItem ? "yes" : "no",
      queueItem ? `recommendedAction=${queueItem.recommendedAction}; ${queueItem.reason}` : "Not in paperwork queue.",
      queueItem == null,
      "src/lib/recruiting/paperwork-automation-engine.ts",
      "evaluatePaperworkCandidate",
    ),
  );
  if (queueItem) {
    p145Rules.push(
      nextRule(
        p145Stage,
        "resolveRecommendedAction",
        queueItem.recommendedAction,
        queueItem.reason,
        queueItem.recommendedAction !== "Send Initial Paperwork",
        "src/lib/recruiting/paperwork-automation-engine.ts",
        "resolveRecommendedAction",
      ),
    );
  }
  allRules.push(...p145Rules);
  for (const r of p145Rules) printRule(r);
  const p145Ready = queueItem?.recommendedAction === "Send Initial Paperwork";
  const p145Fail = p145Rules.find((r) => r.blocking);
  console.log(`\nP145 ready: ${p145Ready ? "YES" : "NO"}`);
  console.log(`P145 exact failing condition: ${p145Ready ? "(none — ready)" : p145Fail ? `${p145Fail.ruleEvaluated} — ${p145Fail.reason}` : queueItem ? `recommendedAction=${queueItem.recommendedAction}` : "Candidate not in paperwork queue"}`);

  // 7. P147
  console.log("\n## 7. P147 INITIAL PAPERWORK\n");
  const p147Stage = "P147 Initial Paperwork";
  const p147Src = "src/lib/recruiting/initial-paperwork-execution-engine.ts";
  const p147Rules: DecisionRule[] = [];

  const cond133 = advancement.nextAction !== "Send Paperwork";
  p147Rules.push(
    nextRule(
      p147Stage,
      "advancement.nextAction === 'Send Paperwork'",
      cond133 ? "fail" : "pass",
      `P144 next action is "${advancement.nextAction}", not Send Paperwork.`,
      cond133,
      p147Src,
      "evaluateInitialPaperworkEligibility",
      "133-135",
    ),
  );
  const cond136 = advancement.confidence < P147_INITIAL_CONFIDENCE_MIN;
  p147Rules.push(
    nextRule(
      p147Stage,
      `advancement.confidence >= ${P147_INITIAL_CONFIDENCE_MIN}`,
      cond136 ? "fail" : "pass",
      `Confidence ${advancement.confidence}% vs threshold ${P147_INITIAL_CONFIDENCE_MIN}%.`,
      cond136,
      p147Src,
      "evaluateInitialPaperworkEligibility",
      "136-138",
    ),
  );
  if (advancement.blockers.length > 0) {
    p147Rules.push(nextRule(p147Stage, "P144 blockers", "fail", advancement.blockers.join(", "), true, p147Src, "evaluateInitialPaperworkEligibility", "139-144"));
  } else {
    p147Rules.push(nextRule(p147Stage, "P144 blockers", "pass", "No blockers.", false, p147Src, "evaluateInitialPaperworkEligibility", "139-144"));
  }
  const cond148 = !queueItem || queueItem.recommendedAction !== "Send Initial Paperwork";
  p147Rules.push(
    nextRule(
      p147Stage,
      "P145 queue recommends Send Initial Paperwork",
      cond148 ? "fail" : "pass",
      queueItem ? `Queue action: ${queueItem.recommendedAction}` : "Not in queue.",
      cond148,
      p147Src,
      "evaluateInitialPaperworkEligibility",
      "146-152",
    ),
  );
  const job = row.positionId ? jobsByPositionId.get(row.positionId) : undefined;
  const cond172 = !row.positionId?.trim() || !job;
  p147Rules.push(
    nextRule(
      p147Stage,
      "row.positionId && job exists",
      cond172 ? "fail" : "pass",
      cond172 ? "No open published position." : `Job ${job!.name} (${job!.status})`,
      cond172,
      p147Src,
      "evaluateInitialPaperworkEligibility",
      "172-174",
    ),
  );
  if (job) {
    const cond175 = job.status !== "published";
    p147Rules.push(
      nextRule(
        p147Stage,
        "job.status === 'published'",
        cond175 ? "fail" : "pass",
        `Position status: ${job.status}`,
        cond175,
        p147Src,
        "evaluateInitialPaperworkEligibility",
        "175-177",
      ),
    );
  }
  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    p147Rules.push(nextRule(p147Stage, "isUnassignedRecruiter(row.assignedRecruiter)", "fail", "Recruiter not assigned.", true, p147Src, "evaluateInitialPaperworkEligibility", "165-167"));
  }
  for (const reason of p147Eligibility.validation.reasons) {
    p147Rules.push(nextRule(p147Stage, "validation.reasons", "fail", reason, true, p147Src, "evaluateInitialPaperworkEligibility", "207-210"));
  }
  allRules.push(...p147Rules);
  for (const r of p147Rules) printRule(r);
  const firstP147Block = p147Rules.find((r) => r.blocking);
  console.log(`\nP147 would send paperwork: ${p147Eligibility.eligible ? "YES" : "NO"}`);
  if (!p147Eligibility.eligible && firstP147Block) {
    console.log(
      `P147 preventing condition: ${firstP147Block.sourceFile}:${firstP147Block.line} — if (${firstP147Block.ruleEvaluated}) { reasons.push("${firstP147Block.reason}"); }`,
    );
  }
  console.log(`P147 blockedReason: ${p147Eligibility.blockedReason ?? "(none)"}`);
  console.log(`P147 duplicatePrevented: ${p147Eligibility.duplicatePrevented}`);

  // 8. P152
  console.log("\n## 8. P152 IMMEDIATE PAPERWORK POLICY\n");
  const p152Stage = "P152 Immediate Paperwork";
  const p152Src = "src/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers.ts";
  const p152Rules: DecisionRule[] = [];
  p152Rules.push(
    nextRule(
      p152Stage,
      "isUnassignedRecruiter(row.assignedRecruiter)",
      p152Hard.primaryHardBlocker === "unassigned_recruiter" ? "fail" : "pass",
      p152Hard.blockers[0] ?? "Recruiter assigned.",
      p152Hard.primaryHardBlocker === "unassigned_recruiter",
      p152Src,
      "detectImmediatePaperworkHardBlockers",
      "39-45",
    ),
  );
  if (!p152Hard.blocked || p152Hard.primaryHardBlocker !== "unassigned_recruiter") {
    const email = row.email?.trim() || candidate.email?.trim();
    p152Rules.push(
      nextRule(
        p152Stage,
        "email present",
        p152Hard.primaryHardBlocker === "invalid_email" ? "fail" : "pass",
        email || "Invalid or missing email.",
        p152Hard.primaryHardBlocker === "invalid_email",
        p152Src,
        "detectImmediatePaperworkHardBlockers",
        "47-54",
      ),
    );
  }
  const p152Eligible = !p152Hard.blocked;
  for (const label of p152Legacy.labels) {
    p152Rules.push(
      nextRule(p152Stage, `legacy (bypassed): ${label}`, "bypassed", "P152 bypasses this soft gate.", false, "src/lib/p152-immediate-paperwork-policy/detect-legacy-paperwork-blockers.ts", "detectLegacyPaperworkBlockers"),
    );
  }
  allRules.push(...p152Rules);
  for (const r of p152Rules) printRule(r);
  console.log(`\nP152 eligible: ${p152Eligible ? "YES" : "NO"}`);
  if (!p152Eligible) {
    console.log(`P152 exclusion reason: ${p152Hard.primaryHardBlocker} — ${p152Hard.blockers.join(" ")}`);
  } else {
    console.log(`P152 legacy rules bypassed (${p152Legacy.labels.length}):`);
    for (const label of P152_BYPASSED_RULES) console.log(`  - ${label}`);
  }

  // 9. Dropbox Sign
  console.log("\n## 9. DROPBOX SIGN\n");
  console.log(`Onboarding record exists: ${onboarding ? "YES" : "NO"}`);
  if (onboarding) {
    console.log(`  signatureRequestId: ${onboarding.signatureRequestId ?? "—"}`);
    console.log(`  paperworkStatus: ${onboarding.paperworkStatus ?? "—"}`);
    console.log(`  templateKey: ${onboarding.templateKey ?? "—"}`);
  }
  console.log(`Workflow signatureRequestId: ${row.signatureRequestId ?? "—"}`);
  console.log(`Paperwork automation audit events for candidate: ${candidateAudit.length}`);
  for (const e of dropboxAudit) {
    console.log(`  - [${e.at}] type=${e.type} sendResult=${e.sendResult} executed=${e.executed} reason=${e.reason}`);
    console.log(`    signatureRequestId in audit: ${(e as { signatureRequestId?: string }).signatureRequestId ?? "—"}`);
  }
  console.log(`Template generated: ${onboarding?.templateKey || row.signatureRequestId ? "YES" : "NO"}`);
  console.log(`Audit created: ${dropboxAudit.length > 0 ? "YES" : "NO"}`);

  // 10. Final Verdict
  console.log("\n## 10. FINAL VERDICT\n");
  const paperworkGenerated = Boolean(
    onboarding?.signatureRequestId || row.signatureRequestId || dropboxAudit.some((e) => e.sendResult === "sent"),
  );

  let highestPriorityReason: string;
  if (paperworkGenerated) {
    highestPriorityReason = "(paperwork was generated — no blocker)";
  } else if (p152Hard.blocked) {
    highestPriorityReason = `P152 hard gate [${p152Hard.primaryHardBlocker}]: ${p152Hard.blockers[0]}`;
  } else if (isUnassignedRecruiter(row.assignedRecruiter)) {
    highestPriorityReason = "Recruiter not assigned — isUnassignedRecruiter(row.assignedRecruiter) at src/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers.ts:39";
  } else if (!p147Eligibility.eligible && firstP147Block) {
    highestPriorityReason = `P147 ${firstP147Block.sourceFile}:${firstP147Block.line} — ${firstP147Block.reason}`;
  } else if (advancement.blockers.includes("Missing Resume")) {
    highestPriorityReason = "Missing Resume — P144 detectBlockers at src/lib/recruiting/candidate-advancement-engine.ts";
  } else if (p83Decision.requiresApproval) {
    highestPriorityReason = "P83 requireApproval=true — human approval required before shouldAdvance at build-advancement-decision.ts";
  } else {
    highestPriorityReason = p147Eligibility.blockedReason ?? advancement.automationExplanation ?? "Unknown";
  }

  console.log(`Paperwork generated: ${paperworkGenerated ? "YES" : "NO"}`);
  if (!paperworkGenerated) {
    console.log(`SINGLE highest-priority reason preventing paperwork generation:\n  ${highestPriorityReason}`);
  }

  const artifact = {
    sourcePhase: "P153",
    generatedAt,
    targetName: TARGET_NAME,
    candidate: {
      candidateId: candidate.candidateId,
      name: candidate.name,
      positionId: candidate.positionId,
      creationDate: candidate.creationDate,
      city: candidate.city,
      state: candidate.state,
      email: candidate.email,
    },
    breezyIngestion: Object.fromEntries(breezyFields),
    p83: { decision: p83Decision, rules: p83Rules, blocker: p83Blocker },
    p144: { advancement, rules: p144Rules },
    recruiterAssignment: { workflow: row.assignedRecruiter, assignmentDecision, recruiterEval, dmTerritory, operationalFit },
    workflowStore: { current: workflow, expectedStatus, missingTransitions },
    p145: { ready: p145Ready, queueItem, rules: p145Rules },
    p147: { eligibility: p147Eligibility, rules: p147Rules },
    p152: { eligible: p152Eligible, hard: p152Hard, legacy: p152Legacy, rules: p152Rules },
    dropboxSign: { onboarding, auditEvents: dropboxAudit },
    finalVerdict: { paperworkGenerated, highestPriorityReason },
    allRules,
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p153-end-to-end-candidate-trace.json");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`\nArtifact: ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
