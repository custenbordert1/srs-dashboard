import type { AiActionKind } from "@/lib/ai-action-engine/types";

export const AI_ACTION_LABELS: Record<AiActionKind, string> = {
  "create-job-ad": "Create job ad",
  "assign-recruiter": "Assign recruiter",
  "create-dm-escalation": "Create DM escalation",
  "send-follow-up": "Send follow-up",
  "push-candidate-mel": "Push to MEL",
  "generate-route-plan": "Generate route plan",
};

export const AI_ACTION_IMPACT: Record<AiActionKind, string> = {
  "create-job-ad": "Increase applicant flow within 3–5 days",
  "assign-recruiter": "Clear ownership and improve contact SLA",
  "create-dm-escalation": "Surface territory risk to DM queue",
  "send-follow-up": "Recover stalled candidate within 24h",
  "push-candidate-mel": "Advance signed candidate to MEL pipeline",
  "generate-route-plan": "Reduce travel cost and coverage gap",
};

export const DEFAULT_AI_WORKFLOW_RULES = [
  {
    id: "coverage-risk-high",
    name: "High coverage risk response",
    enabled: true,
    if: { coverageRiskGt: 80 },
    then: [
      { actionKind: "create-dm-escalation" as const, label: "Create DM alert" },
      { actionKind: "send-follow-up" as const, label: "Create recruiter task" },
      { actionKind: "create-job-ad" as const, label: "Recommend job posting" },
    ],
  },
  {
    id: "zero-applicant-jobs",
    name: "Zero applicant job recovery",
    enabled: true,
    if: { zeroApplicantJobsGt: 0 },
    then: [{ actionKind: "create-job-ad" as const, label: "Clone job ad variants" }],
  },
  {
    id: "follow-up-backlog",
    name: "Follow-up backlog recovery",
    enabled: true,
    if: { followUpsDueGt: 5 },
    then: [{ actionKind: "send-follow-up" as const, label: "Bulk follow-up tasks" }],
  },
] satisfies import("@/lib/ai-action-engine/types").AiWorkflowRule[];
