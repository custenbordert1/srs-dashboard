import { randomUUID } from "node:crypto";
import type { CommandCenterChatContext } from "@/lib/ai-command-center/build-chat-context";
import { buildFollowUpQuestions } from "@/lib/ai-command-center/build-follow-up-questions";
import { buildSuggestedActions } from "@/lib/ai-command-center/build-suggested-actions";
import {
  formatSourceAttributions,
  sourceAttributionsToEngineNames,
} from "@/lib/ai-command-center/format-source-attribution";
import type {
  CommandCenterAssistantResponse,
  DashboardLink,
} from "@/lib/ai-command-center/types";
import type { ExecutiveQueryAnswer, ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { resolveExecutiveQueryId } from "@/lib/executive-natural-language-queries/resolve-executive-query";

const PROMPT_QUERY_MAP: Record<string, string> = {
  "who should i hire today": "orchestrator_next_actions",
  "what should i work on today": "brief_needs_attention",
  "what is broken": "operations_anything_broken",
  "what should i work on": "decisions_what_next",
  "what needs approval": "governance_requires_approval",
  "show my biggest risks": "operations_biggest_risk",
  "prepare tomorrow's recruiting plan": "operations_problem_tomorrow",
  "prepare tomorrows recruiting plan": "operations_problem_tomorrow",
  "tell me about candidate": "orchestrator_workflow_attention",
};

const ENGINE_LINKS: Record<string, DashboardLink> = {
  "Executive Daily Brief (P72)": { label: "Executive Daily Brief", href: "/executive#executive-daily-brief", panelId: "executive-daily-brief" },
  "Autonomous Operations Center (P75)": { label: "Operations Center", href: "/executive#autonomous-operations-center", panelId: "autonomous-operations-center" },
  "Autonomous Recruiting Orchestrator (P74)": { label: "Recruiting Orchestrator", href: "/executive#autonomous-recruiting-orchestrator", panelId: "autonomous-recruiting-orchestrator" },
  "Autonomous Decision Engine (P76)": { label: "Decision Engine", href: "/executive#autonomous-decision-engine", panelId: "autonomous-decision-engine" },
  "Autonomous Approval & Governance Engine (P77)": { label: "Approval & Governance", href: "/executive#autonomous-approval-governance", panelId: "autonomous-approval-governance" },
  "Autonomous Candidate Communication Engine (P73)": { label: "Communication Engine", href: "/executive#autonomous-candidate-communication", panelId: "autonomous-candidate-communication" },
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[?.,!]/g, "").replace(/\s+/g, " ").trim();
}

export function resolveCommandCenterQuery(message: string): ExecutiveQueryId | null {
  const direct = resolveExecutiveQueryId(message);
  if (direct) return direct;

  const normalized = normalize(message);
  for (const [pattern, queryId] of Object.entries(PROMPT_QUERY_MAP)) {
    if (normalized.includes(pattern)) return queryId as ExecutiveQueryId;
  }

  return null;
}

function riskFromContext(context: CommandCenterChatContext): CommandCenterAssistantResponse["riskLevel"] {
  const health = context.operations.systemHealth.status;
  if (health === "critical") return "critical";
  if (health === "warning") return "medium";
  if (context.governance.executiveMetrics.blockedByPolicy > 10) return "high";
  return "low";
}

function buildDashboardLinks(sourceSystem: string): DashboardLink[] {
  const link = ENGINE_LINKS[sourceSystem];
  if (link) return [link];
  return [{ label: "Executive Home", href: "/executive", panelId: "executive-home" }];
}

function buildEvidence(context: CommandCenterChatContext, answer: ExecutiveQueryAnswer): string[] {
  const lines: string[] = [];
  lines.push(`Query: ${answer.question}`);
  lines.push(`Total: ${answer.total}`);
  for (const [key, value] of Object.entries(answer.metrics)) {
    lines.push(`${key}: ${value}`);
  }

  const topBlocked = context.orchestrator.blockedCandidates.slice(0, 3);
  for (const row of topBlocked) {
    lines.push(`Candidate: ${row.candidateName} — blocked workflow`);
  }

  if (context.operations.platformHealth.overall != null) {
    lines.push(`Platform health: ${context.operations.platformHealth.overall}%`);
  }

  return lines.slice(0, 8);
}

function buildRecommendedActions(context: CommandCenterChatContext, queryId: ExecutiveQueryId | null): string[] {
  const actions: string[] = [];

  if (queryId?.startsWith("governance_") || queryId === "decisions_need_approval") {
    actions.push(...context.governance.approvalQueue.slice(0, 3).map((q) => q.recommendedAction));
  } else if (queryId?.startsWith("decisions_") || queryId?.startsWith("orchestrator_")) {
    actions.push(...context.decisions.recommendedDecisions.slice(0, 3).map((d) => d.decision));
  } else if (queryId?.startsWith("operations_")) {
    actions.push(...context.operations.executiveRecommendations.slice(0, 3));
  } else {
    actions.push(...context.brief.risks.slice(0, 3).map((r) => `${r.label}: ${r.count}`));
  }

  return [...new Set(actions.filter(Boolean))].slice(0, 5);
}

export function buildAiCommandResponse(input: {
  message: string;
  context: CommandCenterChatContext;
  answer: ExecutiveQueryAnswer | null;
  queryId: ExecutiveQueryId | null;
}): CommandCenterAssistantResponse {
  const { context, answer, queryId } = input;
  const summary = answer?.summary ?? buildFallbackSummary(input.message, context);
  const rawSources = answer?.sourceSystem ? [answer.sourceSystem] : ["AI Command Center (P78)"];
  const sourceAttributions = formatSourceAttributions({
    sourceSystems: rawSources,
    queryId,
    context,
  });
  const sourceEngines = sourceAttributionsToEngineNames(sourceAttributions);
  const riskLevel = riskFromContext(context);
  const approvalRequired =
    context.governance.executiveMetrics.recruiterApprovalRequired > 0 ||
    context.governance.executiveMetrics.executiveApprovalRequired > 0;
  const confidence =
    answer?.metrics.confidence ??
    answer?.metrics.averageConfidence ??
    context.decisions.executiveMetrics.averageConfidence ??
    context.governance.executiveMetrics.averageConfidence ??
    null;

  const response: CommandCenterAssistantResponse = {
    summary,
    supportingEvidence: answer ? buildEvidence(context, answer) : [context.brief.summaryText],
    sourceEngines,
    sourceAttributions,
    recommendedActions: buildRecommendedActions(context, queryId),
    riskLevel,
    approvalRequired,
    confidence: confidence != null ? Math.round(confidence) : null,
    automationReadiness: `${context.orchestrator.readinessScore.overall}% platform readiness · ${context.decisions.executiveMetrics.automationReadyDecisions} automation-ready decisions (preview)`,
    dashboardLinks: buildDashboardLinks(answer?.sourceSystem ?? ""),
    followUpQuestions: buildFollowUpQuestions(queryId),
    suggestedActions: buildSuggestedActions(context),
    previewOnly: true,
  };

  return response;
}

function buildFallbackSummary(message: string, context: CommandCenterChatContext): string {
  const normalized = normalize(message);
  if (normalized.includes("hire")) {
    const ready = context.orchestrator.readyForAutomation.slice(0, 3);
    if (ready.length === 0) return "No candidates are automation-ready to hire today in preview.";
    return `Top hire candidates in preview: ${ready.map((r) => r.candidateName).join(", ")}.`;
  }
  return `${context.brief.summaryText} Platform health ${context.operations.platformHealth.overall ?? "—"}%. ${context.governance.approvalQueue.length} items await approval in preview.`;
}

export function createAssistantMessage(response: CommandCenterAssistantResponse, content?: string): {
  id: string;
  role: "assistant";
  content: string;
  at: string;
  response: CommandCenterAssistantResponse;
} {
  return {
    id: randomUUID(),
    role: "assistant",
    content: content ?? response.summary,
    at: new Date().toISOString(),
    response,
  };
}

export function createUserMessage(content: string): {
  id: string;
  role: "user";
  content: string;
  at: string;
} {
  return {
    id: randomUUID(),
    role: "user",
    content,
    at: new Date().toISOString(),
  };
}
