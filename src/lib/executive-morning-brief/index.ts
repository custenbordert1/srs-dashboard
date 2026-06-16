export type {
  AutomationOpportunitySummary,
  CoverageForecastHorizonSummary,
  EmailDigestDraft,
  ExecutiveMorningBriefSnapshot,
  ExecutiveNarratives,
  MetricTrendComparison,
  MorningBriefPriority,
  RecruiterPerformanceRow,
  RecommendationTypeSummary,
  ScorecardMetric,
  TerritoryRiskSummaryRow,
  TrendDirection,
} from "@/lib/executive-morning-brief/types";

export {
  buildExecutiveMorningBriefSnapshot,
  type BuildExecutiveMorningBriefInput,
} from "@/lib/executive-morning-brief/build-snapshot";

export {
  buildMorningBriefExportCsv,
  buildMorningBriefPrintHtml,
  downloadMorningBriefExcel,
  downloadMorningBriefPdfViaPrint,
  openMorningBriefPrintView,
} from "@/lib/executive-morning-brief/build-export";

export { buildExecutiveNarratives, buildEmailDigestDraft } from "@/lib/executive-morning-brief/build-narrative";

export { buildExecutiveScorecard, buildRecruitingHealthSummary } from "@/lib/executive-morning-brief/build-scorecard";

export { buildMorningBriefPriorities } from "@/lib/executive-morning-brief/build-priorities";
