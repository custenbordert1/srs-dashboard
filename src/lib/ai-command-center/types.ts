import type { ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";

export const P78_SOURCE_PHASE = "P78";
export const P78_PREVIEW_MODE = true as const;
export const P78_DEFAULT_COMMAND_CENTER_ENABLED = false;
export const P78_DEFAULT_EXECUTION_MODE = "preview" as const;

export type CommandCenterExecutionMode = "off" | "preview" | "pilot" | "production";

export type P78FeatureFlags = {
  commandCenterEnabled: boolean;
  executionMode: CommandCenterExecutionMode;
  previewMode: boolean;
  updatedAt: string;
};

export type CommandCenterControls = {
  commandCenterEnabled: boolean;
  executionMode: CommandCenterExecutionMode;
  previewMode: boolean;
  canExecute: boolean;
  previewOnly: boolean;
};

export type ChatRole = "user" | "assistant" | "system";

export type DashboardLink = {
  label: string;
  href: string;
  panelId: string;
};

export type CommandCenterChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  at: string;
  response?: CommandCenterAssistantResponse;
};

export type SourceAttribution = {
  phase: string;
  label: string;
  fullLabel: string;
};

export type ExecutiveGreetingSnapshot = {
  headline: string;
  recruitingHealthPercent: number | null;
  operationsHealthLabel: string;
  automationReadinessPercent: number | null;
  todayPriorities: string[];
  closing: string;
  formattedText: string;
};

export type CommandCenterAssistantResponse = {
  summary: string;
  supportingEvidence: string[];
  sourceEngines: string[];
  sourceAttributions: SourceAttribution[];
  recommendedActions: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  approvalRequired: boolean;
  confidence: number | null;
  automationReadiness: string;
  dashboardLinks: DashboardLink[];
  followUpQuestions: string[];
  suggestedActions: CommandCenterSuggestedAction[];
  previewOnly: true;
};

export type CommandCenterSuggestedAction = {
  id: string;
  label: string;
  description: string;
  previewOnly: true;
};

export type ConversationTurnMemory = {
  queryId: ExecutiveQueryId | null;
  userMessage: string;
  topic: string;
  summary: string;
  evidence: string[];
  metrics: Record<string, number>;
  recommendedActions: string[];
  sourceEngines: string[];
  riskLevel: CommandCenterAssistantResponse["riskLevel"];
  approvalRequired: boolean;
  candidateIds: string[];
  candidateNames: string[];
};

export type ConversationMemory = {
  activeTurn: ConversationTurnMemory | null;
  /** @deprecated Legacy fields — use activeTurn; kept for session migration. */
  lastQueryId: ExecutiveQueryId | null;
  lastTopic: string | null;
  lastSummary: string | null;
  lastCandidateIds: string[];
  lastCandidateNames: string[];
  lastSourceEngines: string[];
  lastRiskLevel: CommandCenterAssistantResponse["riskLevel"] | null;
};

export type CommandCenterSession = {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  memory: ConversationMemory;
  messages: CommandCenterChatMessage[];
  metrics: CommandCenterExecutiveMetrics;
};

export type CommandCenterExecutiveMetrics = {
  questionsAsked: number;
  recommendationsGenerated: number;
  previewActions: number;
  estimatedRecruiterHoursSaved: number;
  decisionConfidence: number | null;
  averageResponseTimeMs: number | null;
};

export type CommandCenterSuggestedPrompt = {
  id: string;
  label: string;
  message: string;
};

export type CommandCenterDashboardSnapshot = {
  sourcePhase: typeof P78_SOURCE_PHASE;
  previewMode: typeof P78_PREVIEW_MODE;
  fetchedAt: string;
  controls: CommandCenterControls;
  greeting: string;
  executiveGreeting: ExecutiveGreetingSnapshot;
  platformHealth: {
    score: number | null;
    status: string;
    summary: string;
  };
  suggestedPrompts: CommandCenterSuggestedPrompt[];
  sessionId: string;
  metrics: CommandCenterExecutiveMetrics;
  warnings: string[];
};

export type CommandCenterChatResult = {
  ok: true;
  previewMode: typeof P78_PREVIEW_MODE;
  sessionId: string;
  message: CommandCenterChatMessage;
  metrics: CommandCenterExecutiveMetrics;
  warnings: string[];
};
