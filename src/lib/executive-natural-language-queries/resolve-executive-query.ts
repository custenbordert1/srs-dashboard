import type { ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { SUPPORTED_EXECUTIVE_QUERIES } from "@/lib/executive-natural-language-queries/query-registry";

function normalizeQueryText(text: string): string {
  return text.toLowerCase().replace(/[?.,!]/g, "").replace(/\s+/g, " ").trim();
}

const QUERY_MATCHERS: Array<{ id: ExecutiveQueryId; patterns: RegExp[] }> = [
  {
    id: "applicants_today",
    patterns: [/applicants?.*today/, /applied today/, /how many applicants today/],
  },
  {
    id: "applicants_week",
    patterns: [/applicants?.*(this )?week/, /applied (this )?week/, /weekly applicants/],
  },
  {
    id: "applicants_month",
    patterns: [/applicants?.*(this )?month/, /applied (this )?month/, /mtd applicants/],
  },
  {
    id: "paperwork_sent_today",
    patterns: [/paperwork.*sent today/, /packets? sent today/, /sent paperwork today/],
  },
  {
    id: "paperwork_sent_week",
    patterns: [/paperwork.*sent (this )?week/, /packets? sent (this )?week/],
  },
  {
    id: "paperwork_signed_today",
    patterns: [/signed paperwork today/, /paperwork signed today/, /signatures? today/, /candidates signed today/],
  },
  {
    id: "paperwork_ready_for_auto",
    patterns: [/ready for automatic paperwork/, /ready for auto send/, /automatic paperwork eligible/],
  },
  {
    id: "paperwork_auto_sent_today",
    patterns: [/automatically sent/, /auto sent today/, /auto paperwork today/],
  },
  {
    id: "paperwork_manual_sent_today",
    patterns: [/manually sent/, /manual paperwork/, /manual sends/],
  },
  {
    id: "paperwork_failed_count",
    patterns: [/paperwork.*failed/, /failed packets?/, /which paperwork failed/],
  },
  {
    id: "paperwork_waiting_longest",
    patterns: [/waiting the longest/, /longest to sign/, /who has been waiting/],
  },
  {
    id: "paperwork_top_recruiter_today",
    patterns: [/recruiter sent the most/, /top recruiter.*paperwork/, /which recruiter sent/],
  },
  {
    id: "paperwork_waiting_signature",
    patterns: [/waiting for signatures/, /awaiting signature/, /how many.*waiting.*sign/],
  },
  {
    id: "paperwork_blocked_auto",
    patterns: [/blocked from automatic/, /blocked.*paperwork/, /which candidates are blocked/],
  },
  {
    id: "paperwork_oldest_pending",
    patterns: [/oldest pending paperwork/, /oldest pending packet/, /oldest packet/],
  },
  {
    id: "paperwork_failed_today",
    patterns: [/paperwork failed today/, /what paperwork failed today/, /failed paperwork today/],
  },
  {
    id: "brief_how_are_we_doing",
    patterns: [/how are we doing/, /how are we doing today/, /status today/],
  },
  {
    id: "brief_recruiting_summary",
    patterns: [/recruiting summary/, /today's recruiting summary/, /daily recruiting summary/],
  },
  {
    id: "brief_what_changed",
    patterns: [/what changed today/, /what's different today/, /changes today/],
  },
  {
    id: "brief_needs_attention",
    patterns: [/what needs attention/, /needs attention today/, /what should i focus on/],
  },
  {
    id: "communication_sent_today",
    patterns: [/communications? sent today/, /how many communications today/, /messages sent today/],
  },
  {
    id: "communication_needs_reminders",
    patterns: [/who still needs reminders/, /needs reminders/, /pending reminders/],
  },
  {
    id: "communication_no_response",
    patterns: [/not responded/, /no response/, /candidates have not responded/],
  },
  {
    id: "communication_failures",
    patterns: [/communication failures/, /failed communications/, /show communication failures/],
  },
  {
    id: "communication_welcome_today",
    patterns: [/welcome emails today/, /who received welcome/, /welcome email today/],
  },
  {
    id: "communication_waiting_approval",
    patterns: [/waiting approval/, /communications waiting approval/, /pending approval communications/],
  },
  {
    id: "orchestrator_system_status",
    patterns: [/what is the system doing/, /system status/, /what is happening now/],
  },
  {
    id: "orchestrator_automation_blocked",
    patterns: [/where is automation blocked/, /automation blocked/, /blocked automation/],
  },
  {
    id: "orchestrator_engine_waiting",
    patterns: [/which engine is waiting/, /engine waiting/, /waiting engine/],
  },
  {
    id: "orchestrator_candidates_stuck",
    patterns: [/candidates are stuck/, /stuck candidates/, /which candidates stuck/],
  },
  {
    id: "orchestrator_today_workflow",
    patterns: [/today's workflow/, /show today workflow/, /workflow today/],
  },
  {
    id: "orchestrator_hiring_blockers",
    patterns: [/preventing hiring/, /hiring blockers/, /what is blocking hiring/],
  },
  {
    id: "orchestrator_next_actions",
    patterns: [/what will happen next/, /next actions/, /what happens next/],
  },
  {
    id: "orchestrator_recruiter_automated",
    patterns: [/recruiter work automated/, /how much automated/, /recruiter automation/],
  },
  {
    id: "orchestrator_workflow_attention",
    patterns: [/workflow needs attention/, /which workflow attention/, /needs attention workflow/],
  },
  {
    id: "operations_anything_broken",
    patterns: [/is anything broken/, /anything broken/, /is something broken/],
  },
  {
    id: "operations_critical_issues",
    patterns: [/critical issues/, /show critical issues/, /critical problems/],
  },
  {
    id: "operations_needs_attention",
    patterns: [/what needs attention now/, /needs attention now/, /attention now/],
  },
  {
    id: "operations_unhealthy_workflows",
    patterns: [/unhealthy workflows/, /which workflows unhealthy/, /workflows unhealthy/],
  },
  {
    id: "operations_recruiting_slowdown",
    patterns: [/recruiting slowing down/, /why recruiting slow/, /slowdown recruiting/],
  },
  {
    id: "operations_leadership_fix_today",
    patterns: [/leadership fix today/, /what should leadership fix/, /fix today/],
  },
  {
    id: "operations_biggest_risk",
    patterns: [/biggest operational risk/, /biggest risk/, /operational risk/],
  },
  {
    id: "operations_problem_tomorrow",
    patterns: [/problem tomorrow/, /become a problem tomorrow/, /tomorrow risk/],
  },
  {
    id: "decisions_what_next",
    patterns: [/what should the system do next/, /what should happen next/, /system do next/],
  },
  {
    id: "decisions_best",
    patterns: [/best decision/, /what is the best decision/, /top decision/],
  },
  {
    id: "decisions_why_recommended",
    patterns: [/why did the ai recommend/, /why recommend this/, /why this recommendation/],
  },
  {
    id: "decisions_need_approval",
    patterns: [/decisions need approval/, /which decisions need approval/, /need human approval/],
  },
  {
    id: "decisions_high_confidence",
    patterns: [/high confidence actions/, /high-confidence actions/, /confident recommendations/],
  },
  {
    id: "decisions_low_confidence",
    patterns: [/low confidence recommendations/, /low-confidence recommendations/, /uncertain recommendations/],
  },
  {
    id: "decisions_safest_action",
    patterns: [/safest action/, /what is the safest action/, /lowest risk action/],
  },
  {
    id: "decisions_highest_value",
    patterns: [/most value decision/, /highest value recommendation/, /biggest opportunity/],
  },
  {
    id: "governance_auto_allowed",
    patterns: [/what can the system do automatically/, /auto approved decisions/, /automatic actions allowed/],
  },
  {
    id: "governance_requires_approval",
    patterns: [/what requires approval/, /decisions need approval/, /approval required/],
  },
  {
    id: "governance_blocked",
    patterns: [/blocked by policy/, /what is blocked/, /policy blocks/],
  },
  {
    id: "governance_why_not_automated",
    patterns: [/why can't this be automated/, /why not automated/, /automation blocked why/],
  },
  {
    id: "governance_pilot_eligible",
    patterns: [/pilot eligible/, /which decisions pilot/, /pilot market decisions/],
  },
  {
    id: "governance_safe_to_approve",
    patterns: [/safe to approve/, /what is safe to approve/, /low risk approve/],
  },
  {
    id: "governance_executive_approval",
    patterns: [/executive approval/, /needs executive approval/, /leadership approval required/],
  },
  {
    id: "governance_blocking_rules",
    patterns: [/rules stopping automation/, /blocking rules/, /what rules block automation/],
  },
];

export function resolveExecutiveQueryId(question: string): ExecutiveQueryId | null {
  const normalized = normalizeQueryText(question);
  if (!normalized) return null;

  for (const matcher of QUERY_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(normalized))) {
      return matcher.id;
    }
  }

  const direct = SUPPORTED_EXECUTIVE_QUERIES.find(
    (row) => normalizeQueryText(row.question) === normalized || row.id === normalized,
  );
  return direct?.id ?? null;
}

export function resolveExecutiveQueryFromText(question: string): {
  queryId: ExecutiveQueryId | null;
  normalizedQuestion: string;
} {
  return {
    queryId: resolveExecutiveQueryId(question),
    normalizedQuestion: normalizeQueryText(question),
  };
}
