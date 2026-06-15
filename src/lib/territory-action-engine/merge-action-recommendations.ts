import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildQueueCandidateRow,
  isUnassignedRecruiter,
  matchesQueueLane,
} from "@/lib/candidate-action-queue";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { WorkforceOpsQueueItem } from "@/lib/workforce-ops-center/types";
import type {
  TerritoryIntelligenceCenterSnapshot,
  TerritoryIntelligenceTerritoryRow,
  TerritoryRecommendation,
} from "@/lib/territory-intelligence";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import {
  categoryLabel,
  dueDateFromImpactScore,
  impactScoreFromSeverity,
  sortByImpact,
} from "@/lib/territory-action-engine/action-scoring";
import { isRecruiterOverloaded } from "@/lib/territory-action-engine/build-recruiter-workload";
import type {
  ActionRecommendationCard,
  ActionRecommendationCategory,
  ProjectRiskRow,
  RecruiterWorkloadRow,
  RepCapacityRow,
} from "@/lib/territory-action-engine/types";

const PRIORITY_QUEUE_LIMIT = 40;
const EXECUTIVE_ROLLUP_LIMIT = 10;
const ROLE_QUEUE_LIMIT = 20;

function cardFromTerritoryRow(row: TerritoryIntelligenceTerritoryRow): ActionRecommendationCard[] {
  const cards: ActionRecommendationCard[] = [];
  const metrics = row.metrics;

  if (metrics.coveragePercent < 45 || metrics.coverageRiskScore >= 70) {
    const impactScore = Math.max(metrics.coverageRiskScore, 100 - metrics.coveragePercent);
    cards.push({
      id: `territory:critical:${row.dmName}`,
      category: metrics.coveragePercent < 30 ? "critical-territory" : "coverage-risk",
      categoryLabel: categoryLabel(
        metrics.coveragePercent < 30 ? "critical-territory" : "coverage-risk",
      ),
      issue: `${row.dmName} coverage at ${metrics.coveragePercent}%`,
      impact: `Coverage risk score ${metrics.coverageRiskScore} · ${metrics.openCalls} open calls`,
      impactScore,
      owner: row.dmName,
      ownerRole: "dm",
      suggestedAction: "Run territory playbook — refresh ads and reactivate reps",
      dueDate: dueDateFromImpactScore(impactScore),
      status: "open",
      dmName: row.dmName,
      source: "territory-intelligence",
      automationKind: "create-dm-escalation",
      manualOnly: true,
    });
  }

  if (metrics.zeroApplicantJobs > 0) {
    const impactScore = Math.min(95, 55 + metrics.zeroApplicantJobs * 4);
    cards.push({
      id: `territory:zero-apps:${row.dmName}`,
      category: "zero-applicant-jobs",
      categoryLabel: categoryLabel("zero-applicant-jobs"),
      issue: `${metrics.zeroApplicantJobs} jobs with zero applicants`,
      impact: `Applicant velocity ${metrics.applicantVelocity.direction} in ${row.states.join(", ")}`,
      impactScore,
      owner: row.dmName,
      ownerRole: "dm",
      suggestedAction: "Refresh job ads and boost sourcing in affected markets",
      dueDate: dueDateFromImpactScore(impactScore),
      status: "open",
      dmName: row.dmName,
      source: "territory-intelligence",
      automationKind: "create-job-ad",
      manualOnly: true,
    });
  }

  if (metrics.openCalls >= 3 && metrics.coveragePercent < 60) {
    const impactScore = Math.round(metrics.openCalls * 8 + (100 - metrics.coveragePercent) * 0.4);
    cards.push({
      id: `territory:open-calls:${row.dmName}`,
      category: "open-calls-at-risk",
      categoryLabel: categoryLabel("open-calls-at-risk"),
      issue: `${metrics.openCalls} open calls at risk`,
      impact: `Only ${metrics.activeReps} active reps supporting territory`,
      impactScore,
      owner: row.dmName,
      ownerRole: "dm",
      suggestedAction: "Prioritize rep assignment for highest-value open calls",
      dueDate: dueDateFromImpactScore(impactScore),
      status: "open",
      dmName: row.dmName,
      source: "territory-intelligence",
      manualOnly: true,
    });
  }

  return cards;
}

function cardFromRecommendation(rec: TerritoryRecommendation): ActionRecommendationCard {
  const impactScore = impactScoreFromSeverity(rec.severity);
  let category: ActionRecommendationCategory = "coverage-risk";
  if (rec.message.toLowerCase().includes("applicant") || rec.message.toLowerCase().includes("ads")) {
    category = "zero-applicant-jobs";
  } else if (rec.message.toLowerCase().includes("workload")) {
    category = "recruiter-follow-up-risk";
  }

  return {
    id: `rec:${rec.id}`,
    category,
    categoryLabel: categoryLabel(category),
    issue: rec.message,
    impact: `${rec.dmName} territory signal`,
    impactScore,
    owner: rec.dmName,
    ownerRole: "dm",
    suggestedAction: rec.message,
    dueDate: dueDateFromImpactScore(impactScore),
    status: "open",
    dmName: rec.dmName,
    state: rec.state,
    city: rec.city,
    source: "territory-intelligence",
    manualOnly: true,
  };
}

function cardFromWorkforceQueue(item: WorkforceOpsQueueItem): ActionRecommendationCard {
  const impactScore = impactScoreFromSeverity(item.severity);
  let category: ActionRecommendationCategory = "staffing-shortage";
  if (item.category === "missing-paperwork") category = "paperwork-aging";
  if (item.category === "coverage-gap" || item.category === "unassigned-territory") {
    category = "coverage-risk";
  }
  if (item.category === "stalled-opportunity") category = "open-calls-at-risk";
  if (item.category === "needs-assignment") category = "staffing-shortage";

  return {
    id: `workforce:${item.id}`,
    category,
    categoryLabel: categoryLabel(category),
    issue: item.title,
    impact: item.detail,
    impactScore,
    owner: item.dmName ?? "Operations",
    ownerRole: item.dmName ? "dm" : "operations",
    suggestedAction: item.title,
    dueDate: dueDateFromImpactScore(impactScore),
    status: "open",
    dmName: item.dmName,
    state: item.state,
    candidateId: item.candidateId,
    opportunityId: item.opportunityId,
    source: "workforce-ops",
    manualOnly: true,
  };
}

function cardFromProjectRisk(row: ProjectRiskRow): ActionRecommendationCard {
  const impactScore =
    row.riskLevel === "critical" ? 90 : row.riskLevel === "high" ? 76 : 58;
  return {
    id: `project:${row.opportunityId}`,
    category: "project-risk",
    categoryLabel: categoryLabel("project-risk"),
    issue: `${row.projectName} — ${row.riskLevel} risk`,
    impact: row.riskReason,
    impactScore,
    owner: row.dmName,
    ownerRole: "dm",
    suggestedAction: "Staff project or escalate coverage recovery",
    dueDate: dueDateFromImpactScore(impactScore),
    status: "open",
    dmName: row.dmName as ActionRecommendationCard["dmName"],
    opportunityId: row.opportunityId,
    source: "project-risk",
    manualOnly: true,
  };
}

function cardFromRepCapacity(row: RepCapacityRow): ActionRecommendationCard | null {
  if (row.capacityLabel === "can-absorb") return null;
  const impactScore = row.capacityLabel === "at-risk" ? 82 : 64;
  return {
    id: `rep-capacity:${row.dmName}`,
    category: row.capacityLabel === "at-risk" ? "rep-shortage" : "staffing-shortage",
    categoryLabel: categoryLabel(
      row.capacityLabel === "at-risk" ? "rep-shortage" : "staffing-shortage",
    ),
    issue: `${row.dmName} rep capacity ${row.capacityLabel.replace("-", " ")}`,
    impact: `${row.activeReps} active · ${row.inactiveReps} inactive · ${row.openOpportunities} open opportunities`,
    impactScore,
    owner: row.dmName,
    ownerRole: "dm",
    suggestedAction: row.recommendation,
    dueDate: dueDateFromImpactScore(impactScore),
    status: "open",
    dmName: row.dmName,
    source: "rep-capacity",
    manualOnly: true,
  };
}

function buildRecruiterCandidateCards(input: {
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  actingRecruiter?: string;
}): ActionRecommendationCard[] {
  const cards: ActionRecommendationCard[] = [];

  for (const candidate of input.candidates) {
    const scored = buildScoredWorkflowRow(candidate, input.workflows[candidate.candidateId]);
    const queueRow = buildQueueCandidateRow(scored);
    const recruiter = scored.assignedRecruiter.trim() || "Unassigned";

    if (isUnassignedRecruiter(recruiter) && matchesQueueLane(queueRow, "unassigned", recruiter)) {
      cards.push({
        id: `candidate:unassigned:${candidate.candidateId}`,
        category: "recruiter-follow-up-risk",
        categoryLabel: categoryLabel("recruiter-follow-up-risk"),
        issue: `Unassigned candidate — ${scored.firstName} ${scored.lastName}`,
        impact: `${scored.positionName || "Role"} · ${scored.city}, ${scored.state}`,
        impactScore: 68,
        owner: "Recruiting",
        ownerRole: "recruiter",
        suggestedAction: "Assign recruiter and schedule first contact",
        dueDate: dueDateFromImpactScore(68),
        status: "open",
        candidateId: candidate.candidateId,
        state: scored.state,
        city: scored.city,
        source: "candidate-queue",
        automationKind: "assign-recruiter",
        manualOnly: true,
      });
      continue;
    }

    if (matchesQueueLane(queueRow, "follow-up-due", recruiter)) {
      const impactScore = 72 + (queueRow.sla.followUpOverdue ? 12 : 0);
      if (input.actingRecruiter && recruiter !== input.actingRecruiter.trim()) continue;
      cards.push({
        id: `candidate:follow-up:${candidate.candidateId}`,
        category: "recruiter-follow-up-risk",
        categoryLabel: categoryLabel("recruiter-follow-up-risk"),
        issue: `Follow-up overdue — ${scored.firstName} ${scored.lastName}`,
        impact: queueRow.queueReasons.join(" · ") || scored.nextActionNeeded,
        impactScore,
        owner: recruiter,
        ownerRole: "recruiter",
        suggestedAction: "Complete follow-up and log next step",
        dueDate: dueDateFromImpactScore(impactScore),
        status: "open",
        candidateId: candidate.candidateId,
        state: scored.state,
        source: "candidate-queue",
        automationKind: "send-follow-up",
        manualOnly: true,
      });
    }

    if (matchesQueueLane(queueRow, "paperwork", recruiter)) {
      const impactScore = 66;
      if (input.actingRecruiter && recruiter !== input.actingRecruiter.trim()) continue;
      cards.push({
        id: `candidate:paperwork:${candidate.candidateId}`,
        category: "paperwork-aging",
        categoryLabel: categoryLabel("paperwork-aging"),
        issue: `Paperwork aging — ${scored.firstName} ${scored.lastName}`,
        impact: scored.workflowStatus,
        impactScore,
        owner: recruiter,
        ownerRole: "recruiter",
        suggestedAction: "Send or chase paperwork completion",
        dueDate: dueDateFromImpactScore(impactScore),
        status: "open",
        candidateId: candidate.candidateId,
        source: "candidate-queue",
        manualOnly: true,
      });
    }

    if (matchesQueueLane(queueRow, "ready-mel", recruiter)) {
      const impactScore = 70;
      if (input.actingRecruiter && recruiter !== input.actingRecruiter.trim()) continue;
      cards.push({
        id: `candidate:mel:${candidate.candidateId}`,
        category: "staffing-shortage",
        categoryLabel: categoryLabel("staffing-shortage"),
        issue: `Ready for MEL — ${scored.firstName} ${scored.lastName}`,
        impact: "Candidate blocked on MEL assignment",
        impactScore,
        owner: recruiter,
        ownerRole: "recruiter",
        suggestedAction: "Match to open project and push MEL pipeline",
        dueDate: dueDateFromImpactScore(impactScore),
        status: "open",
        candidateId: candidate.candidateId,
        source: "candidate-queue",
        automationKind: "push-candidate-mel",
        manualOnly: true,
      });
    }
  }

  return cards.slice(0, 30);
}

function cardFromRecruiterWorkload(row: RecruiterWorkloadRow): ActionRecommendationCard | null {
  if (!isRecruiterOverloaded(row)) return null;
  const impactScore = row.workloadScore;
  return {
    id: `recruiter-load:${row.recruiterName}`,
    category: "recruiter-overload",
    categoryLabel: categoryLabel("recruiter-overload"),
    issue: `${row.recruiterName} is ${row.overloadLevel}`,
    impact: `${row.assignedCount} assigned · ${row.followUpsDue} follow-ups · ${row.paperworkPending} paperwork · ${row.readyForMel} MEL-ready`,
    impactScore,
    owner: row.recruiterName,
    ownerRole: "recruiter",
    suggestedAction: row.recommendedRedistribution,
    dueDate: dueDateFromImpactScore(impactScore),
    status: "open",
    source: "recruiter-workload",
    automationKind: "assign-recruiter",
    manualOnly: true,
  };
}

function cardFromCoverageAlert(
  coverage: CoverageRiskSnapshot,
): ActionRecommendationCard[] {
  return coverage.dmAlerts.highRiskProjects.slice(0, 6).map((row) => ({
    id: `coverage:${row.opportunityId}`,
    category: "coverage-risk",
    categoryLabel: categoryLabel("coverage-risk"),
    issue: `High-risk project — ${row.projectName}`,
    impact: row.recommendedAction,
    impactScore: Math.max(60, 100 - row.coverageScore),
    owner: row.territoryOwner,
    ownerRole: "dm",
    suggestedAction: row.recommendedAction,
    dueDate: dueDateFromImpactScore(100 - row.coverageScore),
    status: "open",
    dmName: row.territoryOwner as ActionRecommendationCard["dmName"],
    state: row.state,
    opportunityId: row.opportunityId,
    source: "territory-intelligence",
    manualOnly: true,
  }));
}

function dedupeCards(cards: ActionRecommendationCard[]): ActionRecommendationCard[] {
  const seen = new Set<string>();
  const result: ActionRecommendationCard[] = [];
  for (const card of sortByImpact(cards)) {
    const key = `${card.category}:${card.issue}:${card.owner}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }
  return result;
}

export function mergeActionRecommendations(input: {
  territoryCenter: TerritoryIntelligenceCenterSnapshot;
  workforceQueue: WorkforceOpsQueueItem[];
  coverage: CoverageRiskSnapshot;
  projectRisks: ProjectRiskRow[];
  repCapacities: RepCapacityRow[];
  recruiterWorkloads: RecruiterWorkloadRow[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  actingRecruiter?: string;
}): {
  all: ActionRecommendationCard[];
  priorityQueue: ActionRecommendationCard[];
  executiveRollup: ActionRecommendationCard[];
  dmActionQueue: ActionRecommendationCard[];
  recruiterActionQueue: ActionRecommendationCard[];
} {
  const territoryCards = input.territoryCenter.territories.flatMap(cardFromTerritoryRow);
  const recommendationCards = input.territoryCenter.territories.flatMap((row) =>
    row.recommendations.map(cardFromRecommendation),
  );
  const workforceCards = input.workforceQueue.map(cardFromWorkforceQueue);
  const projectCards = input.projectRisks.map(cardFromProjectRisk);
  const repCards = input.repCapacities
    .map(cardFromRepCapacity)
    .filter((row): row is ActionRecommendationCard => row !== null);
  const recruiterLoadCards = input.recruiterWorkloads
    .map(cardFromRecruiterWorkload)
    .filter((row): row is ActionRecommendationCard => row !== null);
  const candidateCards = buildRecruiterCandidateCards(input);
  const coverageCards = cardFromCoverageAlert(input.coverage);

  const all = dedupeCards([
    ...territoryCards,
    ...recommendationCards,
    ...workforceCards,
    ...projectCards,
    ...repCards,
    ...recruiterLoadCards,
    ...candidateCards,
    ...coverageCards,
  ]);

  const dmActionQueue = all
    .filter((card) => card.ownerRole === "dm" || card.ownerRole === "operations")
    .slice(0, ROLE_QUEUE_LIMIT);

  const recruiterActionQueue = all
    .filter((card) => card.ownerRole === "recruiter")
    .slice(0, ROLE_QUEUE_LIMIT);

  return {
    all,
    priorityQueue: all.slice(0, PRIORITY_QUEUE_LIMIT),
    executiveRollup: all.slice(0, EXECUTIVE_ROLLUP_LIMIT),
    dmActionQueue,
    recruiterActionQueue,
  };
}
