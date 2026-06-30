import type { PaperworkSendGate } from "@/lib/autonomous-paperwork-send-engine/types";
import type { BlockerClassId } from "@/lib/paperwork-eligibility-reconciliation/types";

export const BLOCKER_CLASS_LABELS: Record<BlockerClassId, string> = {
  recruiter_assignment_missing: "Recruiter assignment missing",
  candidate_not_in_correct_stage: "Candidate not in correct workflow stage",
  job_closed_unpublished: "Job closed or unpublished",
  paperwork_already_sent: "Paperwork already sent or signed",
  duplicate_candidate: "Duplicate paperwork packet",
  missing_resume: "Missing resume",
  missing_questionnaire: "Missing questionnaire",
  missing_dm_project_data: "Missing DM / project assignment",
  parser_field_mismatch: "Parser or field mismatch",
  rule_mismatch_p87_p84: "Rule mismatch between P87 and P84",
  real_disqualification: "Real candidate disqualification",
  terminal_or_inactive_state: "Terminal or inactive workflow state",
  missing_contact_data: "Missing contact email",
  workflow_state_stale: "Workflow state stale (P83 not applied)",
  none_eligible: "Eligible (no blocker)",
};

export const BLOCKER_RECOMMENDED_FIXES: Record<BlockerClassId, string> = {
  recruiter_assignment_missing:
    "Run P62 recruiter assignment for MTD Applied candidates before P83/P84.",
  candidate_not_in_correct_stage:
    "Run P83 advancement preview to set Paperwork Needed + send-paperwork action.",
  job_closed_unpublished:
    "Publish or remap Breezy position; P84 cannot send for closed jobs.",
  paperwork_already_sent:
    "Exclude from send queue; monitor signature status via P84 monitorSignatures.",
  duplicate_candidate:
    "Resolve duplicate onboarding record before re-sending paperwork.",
  missing_resume:
    "Request resume upload or run resume enrichment before paperwork.",
  missing_questionnaire:
    "Complete P86 questionnaire enrichment before paperwork eligibility.",
  missing_dm_project_data:
    "Assign DM territory via P56/DM suggest before paperwork (operational readiness).",
  parser_field_mismatch:
    "Fix questionnaire/resume parser mapping for affected Breezy field shapes.",
  rule_mismatch_p87_p84:
    "Align P87 ready-for-paperwork signal with P84 gate prerequisites or document intentional split.",
  real_disqualification:
    "Candidate should remain blocked — reject or archive in Breezy.",
  terminal_or_inactive_state:
    "Candidate already hired/placed — exclude from autonomous paperwork pipeline.",
  missing_contact_data: "Collect valid email before paperwork send.",
  workflow_state_stale:
    "Apply persisted P83 advancement decisions on next ingestion sync.",
  none_eligible: "No fix required — candidate passes P84 preview gates.",
};

export function mapGateToBlockerClass(gate: PaperworkSendGate): BlockerClassId {
  const detail = (gate.detail ?? "").toLowerCase();
  switch (gate.id) {
    case "recruiter_assigned":
      return "recruiter_assignment_missing";
    case "paperwork_needed":
    case "send_paperwork_action":
      return "candidate_not_in_correct_stage";
    case "published_job":
      return "job_closed_unpublished";
    case "valid_email":
      return "missing_contact_data";
    case "no_duplicate":
      if (detail.includes("duplicate") || detail.includes("already sent")) {
        return detail.includes("duplicate") ? "duplicate_candidate" : "paperwork_already_sent";
      }
      return "duplicate_candidate";
    case "not_signed":
      return "paperwork_already_sent";
    case "not_rejected":
      return "real_disqualification";
    case "not_inactive":
      return "terminal_or_inactive_state";
    case "template_ready":
      return "parser_field_mismatch";
    case "automation_enabled":
      return "rule_mismatch_p87_p84";
    default:
      return "rule_mismatch_p87_p84";
  }
}

export function blockerPriority(id: BlockerClassId): number {
  const order: BlockerClassId[] = [
    "real_disqualification",
    "terminal_or_inactive_state",
    "paperwork_already_sent",
    "duplicate_candidate",
    "job_closed_unpublished",
    "missing_resume",
    "missing_questionnaire",
    "missing_contact_data",
    "missing_dm_project_data",
    "recruiter_assignment_missing",
    "workflow_state_stale",
    "candidate_not_in_correct_stage",
    "rule_mismatch_p87_p84",
    "parser_field_mismatch",
    "none_eligible",
  ];
  const index = order.indexOf(id);
  return index === -1 ? 99 : index;
}

export function pickPrimaryBlocker(ids: BlockerClassId[]): BlockerClassId {
  if (ids.length === 0) return "none_eligible";
  return [...ids].sort((a, b) => blockerPriority(a) - blockerPriority(b))[0]!;
}
