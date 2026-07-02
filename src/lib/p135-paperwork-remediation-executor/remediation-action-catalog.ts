import type { RemediationBlockerId } from "@/lib/p134-paperwork-remediation-engine/types";
import type {
  HumanRemediationActionId,
  SafeRemediationActionId,
} from "@/lib/p135-paperwork-remediation-executor/types";

export const SAFE_REMEDIATION_ACTIONS: SafeRemediationActionId[] = [
  "refresh_project_mapping",
  "recompute_mapping_confidence",
  "refresh_resume_detection",
  "refresh_questionnaire_enrichment",
  "refresh_candidate_enrichment",
  "assign_paperwork_ready_locally",
  "regenerate_approval_score",
  "rerun_p124_approval_engine",
  "rerun_p123_orchestrator",
  "rerun_p122_readiness_evaluation",
  "clear_resolved_local_blockers",
  "update_remediation_history",
];

export const HUMAN_REMEDIATION_ACTIONS: HumanRemediationActionId[] = [
  "assign_recruiter_breezy",
  "move_candidate_breezy_job",
  "publish_breezy_job",
  "close_breezy_job",
  "modify_candidate_profile_breezy",
  "change_mapping_confidence_without_approval",
  "send_paperwork",
];

export function blockerToHumanAction(blockerId: RemediationBlockerId): HumanRemediationActionId | null {
  switch (blockerId) {
    case "recruiter_assignment_missing":
      return "assign_recruiter_breezy";
    case "unpublished_closed_job":
    case "missing_published_replacement":
      return "move_candidate_breezy_job";
    case "mapping_confidence_below_threshold":
      return "change_mapping_confidence_without_approval";
    case "project_mapping_issue":
      return "publish_breezy_job";
    case "invalid_email":
    case "questionnaire_incomplete":
    case "resume_missing":
      return "modify_candidate_profile_breezy";
    case "already_sent":
      return "send_paperwork";
    default:
      return null;
  }
}

export function actionLabel(action: SafeRemediationActionId | HumanRemediationActionId): string {
  const labels: Record<string, string> = {
    assign_paperwork_ready_locally: "Assign paperwork-ready locally",
    refresh_resume_detection: "Refresh resume detection",
    refresh_questionnaire_enrichment: "Refresh questionnaire enrichment",
    refresh_candidate_enrichment: "Refresh candidate enrichment",
    refresh_project_mapping: "Refresh project mapping",
    recompute_mapping_confidence: "Recompute mapping confidence",
    regenerate_approval_score: "Regenerate approval score",
    rerun_p124_approval_engine: "Rerun P124 approval engine",
    rerun_p123_orchestrator: "Rerun P123 orchestrator",
    rerun_p122_readiness_evaluation: "Rerun P122 readiness evaluation",
    update_remediation_history: "Update remediation history",
    clear_resolved_local_blockers: "Clear resolved local blockers",
    assign_recruiter_breezy: "Assign recruiter in Breezy",
    move_candidate_breezy_job: "Move candidate to another Breezy job",
    publish_breezy_job: "Publish Breezy job",
    close_breezy_job: "Close Breezy job",
    modify_candidate_profile_breezy: "Modify candidate profile in Breezy",
    change_mapping_confidence_without_approval: "Change mapping confidence without reviewer approval",
    send_paperwork: "Send paperwork",
  };
  return labels[action] ?? action;
}

export function actionOwner(action: SafeRemediationActionId | HumanRemediationActionId): string {
  if (HUMAN_REMEDIATION_ACTIONS.includes(action as HumanRemediationActionId)) {
    switch (action) {
      case "assign_recruiter_breezy":
        return "recruiter";
      case "move_candidate_breezy_job":
      case "publish_breezy_job":
      case "close_breezy_job":
        return "operations";
      case "change_mapping_confidence_without_approval":
        return "mapping_reviewer";
      case "send_paperwork":
        return "operations";
      default:
        return "recruiter";
    }
  }
  return "system";
}
