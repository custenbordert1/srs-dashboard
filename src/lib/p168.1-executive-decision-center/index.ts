export { buildP1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center/build-decision-center-view";
export {
  computeExecutiveDecisionScore,
  gradeTone,
} from "@/lib/p168.1-executive-decision-center/compute-decision-score";
export {
  buildGateChecklist,
  resolveApproveDisabledReason,
  resolveActionRequiredBeforeApproval,
} from "@/lib/p168.1-executive-decision-center/build-gate-checklist";
export type {
  P1681ExecutiveDecisionCenterView,
  P1681DecisionScore,
  P1681DecisionGrade,
  P1681GateCheckItem,
  P1681SystemStatus,
} from "@/lib/p168.1-executive-decision-center/types";
export { P168_1_SOURCE_PHASE } from "@/lib/p168.1-executive-decision-center/types";
