export type {
  ActionPerformanceRow,
  ActualVsExpectedRow,
  AutomationRoiView,
  CeoRoiSummary,
  ExecutiveImpactSummary,
  ExecutiveTrustRoiSnapshot,
  OutcomeDelta,
  RoiCategory,
  TrustFlag,
} from "@/lib/executive-trust-roi/types";

export {
  buildExecutiveTrustRoiSnapshot,
  buildExecutiveImpactSummary,
  buildActionPerformanceRows,
  buildActualVsExpectedRows,
  buildCeoRoiSummary,
} from "@/lib/executive-trust-roi/build-snapshot";

export { computeRoiCategory, outcomeDeltaForRecord, typeSuccessRate } from "@/lib/executive-trust-roi/roi-categories";
export { assignTrustFlag, assignRecordTrustFlag } from "@/lib/executive-trust-roi/trust-flags";
export { enrichAutomationWithRoi } from "@/lib/executive-trust-roi/enrich-automation";
