export const P72_SOURCE_PHASE = "P72";
export const P72_PREVIEW_MODE = true as const;

export type ExecutiveDailyBriefAutomationStatus = {
  automationEnabled: boolean;
  executionMode: string;
  liveSendsEnabled: boolean;
  statusLabel: string;
};

export type ExecutiveDailyBriefMarketNeed = {
  marketLabel: string;
  recommendedNewReps: number;
};

export type ExecutiveDailyBriefRiskLine = {
  label: string;
  count: number;
};

export type ExecutiveDailyBriefMetrics = {
  applicantsToday: number;
  applicantsYesterday: number;
  applicantsDelta: number;
  paperworkSentToday: number;
  paperworkSignedToday: number;
  pendingSignatures: number;
  waitingOver48Hours: number;
  readyForWorkToday: number;
  humanReviewCount: number;
  marketsNeedingGrowth: number;
  recommendedNewReps: number;
  failedPackets: number;
  topRecruitingSource: string | null;
  topRecruitingSourceCount: number;
};

export type ExecutiveDailyBriefSnapshot = {
  previewMode: true;
  sourcePhase: typeof P72_SOURCE_PHASE;
  fetchedAt: string;
  greeting: string;
  metrics: ExecutiveDailyBriefMetrics;
  marketsNeedingGrowth: ExecutiveDailyBriefMarketNeed[];
  highestRiskMarket: ExecutiveDailyBriefMarketNeed | null;
  automation: ExecutiveDailyBriefAutomationStatus;
  risks: ExecutiveDailyBriefRiskLine[];
  summaryText: string;
  lastDataRefresh: string;
};

export type ExecutiveDailyBriefPreviewResult = {
  ok: true;
  previewMode: typeof P72_PREVIEW_MODE;
  fetchedAt: string;
  brief: ExecutiveDailyBriefSnapshot;
  warnings: string[];
};
