import type { CommandCenterChatContext } from "@/lib/ai-command-center/build-chat-context";
import { buildFollowUpQuestions } from "@/lib/ai-command-center/build-follow-up-questions";
import { buildSuggestedActions } from "@/lib/ai-command-center/build-suggested-actions";
import type { FollowUpIntent } from "@/lib/ai-command-center/conversation-memory";
import {
  formatSourceAttributions,
  sourceAttributionsToEngineNames,
} from "@/lib/ai-command-center/format-source-attribution";
import type {
  CommandCenterAssistantResponse,
  ConversationTurnMemory,
} from "@/lib/ai-command-center/types";

const FOLLOW_UP_INTENT_SOURCES: Record<FollowUpIntent, string[]> = {
  why: ["Autonomous Operations Center (P75)", "Executive Daily Brief (P72)"],
  details: ["Executive Daily Brief (P72)", "Autonomous Recruiting Orchestrator (P74)"],
  who_else: ["Autonomous Recruiting Orchestrator (P74)", "Autonomous Operations Center (P75)"],
  automation: ["Autonomous Approval & Governance Engine (P77)", "Autonomous Recruiting Orchestrator (P74)"],
  what_changed: ["Executive Daily Brief (P72)"],
};

function blockedBeforePaperwork(context: CommandCenterChatContext): number {
  const risk = context.brief.risks.find((row) => row.label.includes("blocked"));
  return risk?.count ?? context.orchestrator.blockedCandidates.length;
}

function buildWhySummary(turn: ConversationTurnMemory, context: CommandCenterChatContext): string {
  const blocked = blockedBeforePaperwork(context);
  const waiting48 = context.brief.metrics.waitingOver48Hours;
  const pending = context.brief.metrics.pendingSignatures;

  if (turn.queryId?.startsWith("paperwork_")) {
    const sentToday = turn.metrics.sent ?? turn.metrics.total ?? 0;
    if (sentToday === 0) {
      let explanation = `No paperwork was initiated today because ${blocked} candidate${blocked === 1 ? "" : "s"} remain blocked before the paperwork stage.`;
      if (waiting48 > 0) {
        explanation += ` ${waiting48} candidate${waiting48 === 1 ? " has" : "s have"} exceeded the 48-hour SLA.`;
      }
      return explanation;
    }
    return `Paperwork sends today (${sentToday}) reflect candidates who cleared automation gates. ${blocked} others remain blocked upstream.`;
  }

  if (turn.queryId?.startsWith("governance_") || turn.queryId === "decisions_need_approval") {
    const queue = context.governance.approvalQueue.length;
    const blockedPolicy = context.governance.executiveMetrics.blockedByPolicy;
    return `Approvals are required because P77 governance flagged ${queue} decision${queue === 1 ? "" : "s"} for human review and ${blockedPolicy} action${blockedPolicy === 1 ? "" : "s"} blocked by policy in preview.`;
  }

  if (turn.queryId?.startsWith("operations_")) {
    const critical = context.operations.criticalAlerts.length;
    return critical > 0
      ? `Operations flagged ${critical} critical signal${critical === 1 ? "" : "s"} driving this recommendation — ${context.operations.criticalAlerts[0]?.reason ?? "see evidence"}.`
      : `Platform health is ${context.operations.platformHealth.overall ?? "—"}% with ${context.operations.openRisks.length} open operational risk${context.operations.openRisks.length === 1 ? "" : "s"}.`;
  }

  if (turn.queryId?.startsWith("orchestrator_")) {
    const stuck = context.orchestrator.blockedCandidates.length;
    return `The orchestrator surfaced this because ${stuck} workflow${stuck === 1 ? "" : "s"} ${stuck === 1 ? "is" : "are"} blocked and readiness is ${context.orchestrator.readinessScore.overall}%.`;
  }

  const topRisk = context.brief.risks[0];
  if (topRisk && topRisk.count > 0) {
    return `This follows from ${topRisk.count} ${topRisk.label} and ${pending} pending signature${pending === 1 ? "" : "s"} in today's snapshot.`;
  }

  return `This recommendation reflects current platform health (${context.operations.platformHealth.overall ?? "—"}%) and governed preview rules — not a repeat of the prior headline.`;
}

function buildWhyEvidence(turn: ConversationTurnMemory, context: CommandCenterChatContext): string[] {
  const lines = [
    `Prior question: ${turn.topic}`,
    `Prior answer: ${turn.summary}`,
    `Blocked before paperwork: ${blockedBeforePaperwork(context)}`,
    `Waiting over 48 hours: ${context.brief.metrics.waitingOver48Hours}`,
    `Pending signatures: ${context.brief.metrics.pendingSignatures}`,
    `Platform health: ${context.operations.platformHealth.overall ?? "—"}%`,
  ];
  for (const row of context.orchestrator.blockedCandidates.slice(0, 4)) {
    lines.push(`Blocked candidate: ${row.candidateName} — ${row.blockers[0] ?? "workflow blocked"}`);
  }
  for (const risk of context.brief.risks.slice(0, 3)) {
    lines.push(`Risk: ${risk.count} ${risk.label}`);
  }
  return [...new Set(lines)].slice(0, 10);
}

function buildDetailsSummary(turn: ConversationTurnMemory, context: CommandCenterChatContext): string {
  const m = context.brief.metrics;
  return `Expanded view for "${turn.topic}": ${m.applicantsToday} applicants today, ${m.paperworkSentToday} paperwork sent, ${m.paperworkSignedToday} signed, ${m.pendingSignatures} pending signatures, ${m.humanReviewCount} in human review, platform health ${context.operations.platformHealth.overall ?? "—"}%.`;
}

function buildDetailsEvidence(turn: ConversationTurnMemory, context: CommandCenterChatContext): string[] {
  const m = context.brief.metrics;
  const lines = [
    ...turn.evidence,
    `Applicants today: ${m.applicantsToday}`,
    `Applicants vs yesterday: ${m.applicantsDelta >= 0 ? "+" : ""}${m.applicantsDelta}`,
    `Paperwork sent today: ${m.paperworkSentToday}`,
    `Paperwork signed today: ${m.paperworkSignedToday}`,
    `Ready for work today: ${m.readyForWorkToday}`,
    `Automation readiness: ${context.orchestrator.readinessScore.overall}%`,
    `Approval queue: ${context.governance.approvalQueue.length}`,
    `Automation-ready decisions: ${context.decisions.executiveMetrics.automationReadyDecisions}`,
  ];
  for (const market of context.brief.marketsNeedingGrowth.slice(0, 4)) {
    lines.push(`Market: ${market.marketLabel} — need ${market.recommendedNewReps} rep${market.recommendedNewReps === 1 ? "" : "s"}`);
  }
  for (const row of context.orchestrator.blockedCandidates.slice(0, 5)) {
    lines.push(`Candidate: ${row.candidateName} — ${row.blockers.slice(0, 2).join("; ") || "blocked"}`);
  }
  return [...new Set(lines.filter(Boolean))].slice(0, 12);
}

function buildWhoElseSummary(turn: ConversationTurnMemory, context: CommandCenterChatContext): string {
  const others = context.orchestrator.blockedCandidates.filter(
    (row) => !turn.candidateNames.includes(row.candidateName),
  );
  const markets = context.brief.marketsNeedingGrowth.slice(1, 4);
  if (others.length > 0) {
    const names = others.slice(0, 4).map((row) => row.candidateName).join(", ");
    return `Additional related candidates: ${names}${others.length > 4 ? ` and ${others.length - 4} more` : ""}.`;
  }
  if (markets.length > 0) {
    return `Additional markets needing attention: ${markets.map((m) => m.marketLabel).join(", ")}.`;
  }
  const recruiters = [...new Set(context.orchestrator.waitingHumanAction.map((row) => row.recruiter).filter(Boolean))].slice(0, 4);
  if (recruiters.length > 0) {
    return `Other recruiters with waiting actions: ${recruiters.join(", ")}.`;
  }
  return "No additional candidates or markets surfaced beyond the prior answer in this preview snapshot.";
}

function buildWhoElseEvidence(turn: ConversationTurnMemory, context: CommandCenterChatContext): string[] {
  const lines: string[] = [];
  const seen = new Set(turn.candidateNames);
  for (const row of context.orchestrator.blockedCandidates) {
    if (seen.has(row.candidateName)) continue;
    lines.push(`Also blocked: ${row.candidateName} — ${row.blockers[0] ?? "workflow"}`);
    if (lines.length >= 6) break;
  }
  for (const market of context.brief.marketsNeedingGrowth.slice(0, 5)) {
    lines.push(`Market coverage: ${market.marketLabel} (+${market.recommendedNewReps} recommended)`);
  }
  for (const decision of context.decisions.recommendedDecisions.slice(0, 3)) {
    lines.push(`Related decision: ${decision.decision.slice(0, 80)}`);
  }
  return lines.slice(0, 10);
}

function buildAutomationSummary(turn: ConversationTurnMemory, context: CommandCenterChatContext): string {
  const ready = context.decisions.executiveMetrics.automationReadyDecisions;
  const blocked = context.governance.executiveMetrics.blockedByPolicy;
  const execApprovals = context.governance.executiveMetrics.executiveApprovalRequired;
  const readiness = context.orchestrator.readinessScore.overall;

  if (turn.approvalRequired || execApprovals > 0) {
    return `Preview only — P77 governance requires executive approval before automation. ${ready} decision${ready === 1 ? "" : "s"} are automation-ready but ${blocked} blocked by policy. No live execution from chat.`;
  }

  if (ready > 0 && readiness >= 50) {
    return `Automation Center preview: ${ready} decision${ready === 1 ? "" : "s"} could run under P77 pilot rules at ${readiness}% readiness. Approval still required before any live action.`;
  }

  return `Not automation-ready in preview — readiness ${readiness}%, ${blocked} policy block${blocked === 1 ? "" : "s"}, and paperwork execution remains governed. Review the Approval & Governance panel.`;
}

function buildAutomationEvidence(context: CommandCenterChatContext): string[] {
  const g = context.governance.executiveMetrics;
  return [
    `Automation-ready decisions: ${context.decisions.executiveMetrics.automationReadyDecisions}`,
    `Blocked by policy: ${g.blockedByPolicy}`,
    `Executive approvals required: ${g.executiveApprovalRequired}`,
    `Recruiter approvals required: ${g.recruiterApprovalRequired}`,
    `Pilot-eligible actions: ${g.pilotEligibleActions}`,
    `Orchestrator readiness: ${context.orchestrator.readinessScore.overall}%`,
    `P78 execution mode: preview only`,
  ];
}

function buildWhatChangedSummary(turn: ConversationTurnMemory, context: CommandCenterChatContext): string {
  const m = context.brief.metrics;
  const applicantDirection = m.applicantsDelta >= 0 ? "up" : "down";
  const parts = [
    `Applicants ${applicantDirection} ${Math.abs(m.applicantsDelta)} vs yesterday (${m.applicantsToday} today vs ${m.applicantsYesterday} yesterday).`,
    `Paperwork sent today: ${m.paperworkSentToday} (prior snapshot total for this query: ${turn.metrics.sent ?? turn.metrics.total ?? "—"}).`,
    `Signed today: ${m.paperworkSignedToday}. Pending signatures: ${m.pendingSignatures}.`,
  ];
  return parts.join(" ");
}

function buildWhatChangedEvidence(turn: ConversationTurnMemory, context: CommandCenterChatContext): string[] {
  const m = context.brief.metrics;
  return [
    `Applicants delta: ${m.applicantsDelta}`,
    `Paperwork sent today: ${m.paperworkSentToday}`,
    `Paperwork signed today: ${m.paperworkSignedToday}`,
    `Failed packets today: ${m.failedPackets}`,
    `Waiting over 48h: ${m.waitingOver48Hours}`,
    `Prior query metrics: ${JSON.stringify(turn.metrics)}`,
    `Platform health: ${context.operations.platformHealth.overall ?? "—"}%`,
  ];
}

function shellResponse(input: {
  summary: string;
  evidence: string[];
  recommendedActions: string[];
  turn: ConversationTurnMemory;
  context: CommandCenterChatContext;
  intent: FollowUpIntent;
  approvalRequired: boolean;
  confidence: number | null;
}): CommandCenterAssistantResponse {
  const sourceAttributions = formatSourceAttributions({
    sourceSystems: FOLLOW_UP_INTENT_SOURCES[input.intent],
    queryId: input.turn.queryId,
    context: input.context,
  });

  return {
    summary: input.summary,
    supportingEvidence: input.evidence,
    sourceEngines: sourceAttributionsToEngineNames(sourceAttributions),
    sourceAttributions,
    recommendedActions: input.recommendedActions,
    riskLevel: input.turn.riskLevel,
    approvalRequired: input.approvalRequired,
    confidence: input.confidence,
    automationReadiness: `${input.context.orchestrator.readinessScore.overall}% readiness · preview only`,
    dashboardLinks: input.turn.queryId?.startsWith("governance_")
      ? [{ label: "Approval & Governance", href: "/executive#autonomous-approval-governance", panelId: "autonomous-approval-governance" }]
      : [{ label: "Executive Home", href: "/executive", panelId: "executive-home" }],
    followUpQuestions: buildFollowUpQuestions(input.turn.queryId),
    suggestedActions: buildSuggestedActions(input.context),
    previewOnly: true,
  };
}

function ensureNotDuplicate(summary: string, turn: ConversationTurnMemory): string {
  const normalizedSummary = summary.trim().toLowerCase();
  const normalizedPrior = turn.summary.trim().toLowerCase();
  if (normalizedSummary === normalizedPrior) {
    return `Digging deeper on "${turn.topic}": see expanded evidence and root-cause lines below (preview only).`;
  }
  if (normalizedPrior.length > 20 && normalizedSummary.includes(normalizedPrior)) {
    return summary.replace(turn.summary, "").trim() || ensureNotDuplicate("", turn);
  }
  return summary;
}

export function buildFollowUpResponse(input: {
  intent: FollowUpIntent;
  turn: ConversationTurnMemory;
  context: CommandCenterChatContext;
}): CommandCenterAssistantResponse {
  const { intent, turn, context } = input;
  const confidence =
    context.decisions.executiveMetrics.averageConfidence ??
    context.governance.executiveMetrics.averageConfidence ??
    null;

  switch (intent) {
    case "why": {
      const summary = ensureNotDuplicate(buildWhySummary(turn, context), turn);
      return shellResponse({
        intent,
        turn,
        context,
        summary,
        evidence: buildWhyEvidence(turn, context),
        recommendedActions: turn.recommendedActions.length > 0 ? turn.recommendedActions : context.operations.executiveRecommendations.slice(0, 3),
        approvalRequired: turn.approvalRequired,
        confidence: confidence != null ? Math.round(confidence) : null,
      });
    }
    case "details": {
      const summary = ensureNotDuplicate(buildDetailsSummary(turn, context), turn);
      return shellResponse({
        intent,
        turn,
        context,
        summary,
        evidence: buildDetailsEvidence(turn, context),
        recommendedActions: [
          ...turn.recommendedActions,
          ...context.decisions.recommendedDecisions.slice(0, 2).map((d) => d.decision),
        ].slice(0, 5),
        approvalRequired: turn.approvalRequired,
        confidence: confidence != null ? Math.round(confidence) : null,
      });
    }
    case "who_else": {
      const summary = ensureNotDuplicate(buildWhoElseSummary(turn, context), turn);
      return shellResponse({
        intent,
        turn,
        context,
        summary,
        evidence: buildWhoElseEvidence(turn, context),
        recommendedActions: context.orchestrator.blockedCandidates.slice(0, 3).map((row) => `Review ${row.candidateName}`),
        approvalRequired: turn.approvalRequired,
        confidence: confidence != null ? Math.round(confidence) : null,
      });
    }
    case "automation": {
      const approvalRequired =
        turn.approvalRequired || context.governance.executiveMetrics.executiveApprovalRequired > 0;
      const summary = ensureNotDuplicate(buildAutomationSummary(turn, context), turn);
      return shellResponse({
        intent,
        turn,
        context,
        summary,
        evidence: buildAutomationEvidence(context),
        recommendedActions: context.governance.approvalQueue.slice(0, 3).map((q) => q.recommendedAction),
        approvalRequired,
        confidence: confidence != null ? Math.round(confidence) : null,
      });
    }
    case "what_changed": {
      const summary = ensureNotDuplicate(buildWhatChangedSummary(turn, context), turn);
      return shellResponse({
        intent,
        turn,
        context,
        summary,
        evidence: buildWhatChangedEvidence(turn, context),
        recommendedActions: [`Monitor applicant delta: ${context.brief.metrics.applicantsDelta}`, `Review pending signatures: ${context.brief.metrics.pendingSignatures}`],
        approvalRequired: turn.approvalRequired,
        confidence: confidence != null ? Math.round(confidence) : null,
      });
    }
  }
}

export function parseMetricsFromEvidence(evidence: string[]): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const line of evidence) {
    const match = /^([^:]+):\s*(-?\d+(?:\.\d+)?)$/.exec(line.trim());
    if (match) {
      metrics[match[1]!.trim().toLowerCase()] = Number(match[2]);
    }
  }
  return metrics;
}
