import type {
  P188CodePathNode,
  P188Recommendation,
} from "@/lib/p188-production-workflow-gap-analysis/types";

/**
 * Trace the production path that is supposed to create Hiring Recommendation evidence.
 */
export function buildHiringRecommendationCodePath(): P188CodePathNode[] {
  return [
    {
      id: "ui-progression-badge",
      kind: "ui",
      path: "src/components/recruiting/candidates-section.tsx (recommendedStage badge)",
      role: "Displays progression recommendation to recruiters",
      status: "display_only",
      detail:
        "Shows recommendedStage when present on scored row; does not create HR by itself.",
    },
    {
      id: "ui-enrichment",
      kind: "enrichment",
      path: "src/lib/build-candidate-workflow-row.ts → enrichRowWithCandidateProgression",
      role: "Ephemeral recommendedStage attachment for UI/scoring",
      status: "display_only",
      detail:
        "Calls buildCandidateProgressionDecision when local.recommendedStage is empty; does NOT call upsertCandidateWorkflow.",
    },
    {
      id: "api-auto-progression",
      kind: "api",
      path: "POST /api/candidates/workflows/auto-progression",
      role: "Batch generate + persist progression recommendations",
      status: "exists",
      detail:
        "Exists and can execute with persist:true via runCandidateProgressionEngine. No evidence it has populated current store (recommendedStage=0).",
    },
    {
      id: "ui-client-auto-progression",
      kind: "ui",
      path: "src/lib/candidate-workflow-client.ts → auto-progression fetch",
      role: "Client trigger for auto-progression API",
      status: "exists",
      detail: "Callable from recruiting UI; not continuously scheduled.",
    },
    {
      id: "workflow-progression-engine",
      kind: "workflow",
      path: "src/lib/candidate-progression-engine/build-progression-decision.ts",
      role: "Decide recommendedStage labels",
      status: "executes",
      detail:
        "Produces Contact Candidate / Schedule Interview / Send Paperwork / Ready For MEL / Escalate — not an explicit 'Hiring Recommendation' label. 'Send Paperwork' would satisfy P187 recommend* mapping IF persisted.",
    },
    {
      id: "workflow-apply-progressions",
      kind: "workflow",
      path: "src/lib/candidate-progression-engine/apply-candidate-progressions.ts",
      role: "Persist recommendedStage without changing workflowStatus",
      status: "exists",
      detail: "Writes via upsertCandidateWorkflow + audit generate_candidate_progression.",
    },
    {
      id: "workflow-p83-advancement",
      kind: "workflow",
      path: "src/lib/candidate-advancement-engine/apply-candidate-advancements.ts",
      role: "Persist advancement labels; send-paperwork can force Paperwork Needed",
      status: "bypassed",
      detail:
        "When shouldAdvance+send-paperwork, jumps Applied/Qualified → Paperwork Needed, skipping Operator Approved. Live P151 path flag-gated.",
    },
    {
      id: "api-p151-advancement",
      kind: "api",
      path: "POST /api/recruiting/candidate-pipeline-advancement",
      role: "Autonomous advancement execute",
      status: "disabled",
      detail: "Blocked unless P151_AUTONOMOUS_ADVANCEMENT_ENABLED=true.",
    },
    {
      id: "api-workflows-upsert",
      kind: "api",
      path: "POST /api/candidates/workflows",
      role: "Manual/status upsert including optional recommendedStage",
      status: "exists",
      detail: "Can write recommendedStage if client sends it; recruiting UI primarily changes workflowStatus.",
    },
    {
      id: "storage-workflow-store",
      kind: "storage",
      path: "src/lib/candidate-workflow-store.ts → upsertCandidateWorkflow",
      role: "Authoritative production workflow persistence",
      status: "executes",
      detail: "Supports recommendedStage field; current production file has 0 non-null values.",
    },
    {
      id: "audit-progression",
      kind: "audit",
      path: "candidate-workflow-audit.jsonl action=generate_candidate_progression",
      role: "Audit progression persistence",
      status: "exists",
      detail: "Emitted when applyCandidateProgressions runs; absence of recommendedStage implies batch not applied recently.",
    },
    {
      id: "reconcile-onboarding",
      kind: "workflow",
      path: "src/lib/workflow-onboarding-reconciliation/reconcile-workflow-from-onboarding.ts",
      role: "Sync paperwork/onboarding into workflowStatus",
      status: "executes",
      detail:
        "Dominant mid/late funnel writer in current data: Applied → Paperwork Sent / Signed without creating HR evidence.",
    },
    {
      id: "p186-shadow-hr",
      kind: "workflow",
      path: "src/lib/p186-1-lifecycle-state-machine/states.ts deriveLifecycleState",
      role: "Maps recommendedStage → HIRING_RECOMMENDATION (shadow)",
      status: "replaced",
      detail:
        "Shadow/read model only — not a production writer. P187 eligibility depends on this mapping over production fields.",
    },
    {
      id: "dedicated-hr-api",
      kind: "api",
      path: "(none) dedicated create-hiring-recommendation endpoint",
      role: "Explicit HR creation for operator queue",
      status: "never_called",
      detail:
        "No first-class API named for Hiring Recommendation. Closest are progression persist and manual workflows upsert.",
    },
  ];
}

export function buildGapRecommendations(): P188Recommendation[] {
  return [
    {
      missingTransition: "Applied → Recruiter Review",
      rootCause:
        "504/684 remain Applied; recruiter assignment all Unassigned; little durable recruiter action",
      impact: "Intake backlog; no funnel into recommendation",
      proposedFix:
        "Operational: assign recruiters; optional: persist Needs Review when recruiter opens/claims candidate",
      implementationEffort: "M",
      productionRisk: "low",
    },
    {
      missingTransition: "Recruiter Review → Hiring Recommendation",
      rootCause:
        "No durable recommendedStage writes; progression persist path unused/empty; no dedicated HR API; UI enrichment is display-only",
      impact: "P187 HR→OA canary cohort size = 0; P186 waiting_operator_approval queue empty",
      proposedFix:
        "Add explicit recruiter 'Recommend hire' action that upserts recommendedStage (e.g. recommend_hire) + audit; optionally run controlled auto-progression persist for Send Paperwork labels only after Qualified",
      implementationEffort: "M",
      productionRisk: "medium",
    },
    {
      missingTransition: "Hiring Recommendation → Operator Approved",
      rootCause: "No candidates in HR stage to approve; P186.3 approve_hiring_recommendation jumps to Paperwork Needed",
      impact: "Cannot validate P187 single-transition canary",
      proposedFix:
        "After HR evidence exists, use P187 adapter that writes Operator Approved evidence without Paperwork Needed; keep P186.3 approve path separate",
      implementationEffort: "M",
      productionRisk: "medium",
    },
    {
      missingTransition: "Operator Approved → Paperwork Needed",
      rootCause: "Skipped entirely when onboarding reconcile/send lands Paperwork Sent from Applied",
      impact: "Lifecycle ownership matrix mid-funnel never exercised",
      proposedFix:
        "Stop treating onboarding reconcile as authority for pre-approval candidates; require Paperwork Needed after OA before send",
      implementationEffort: "L",
      productionRisk: "high",
    },
    {
      missingTransition: "Job + owner resolution for P187 gates",
      rootCause: "Workflow store lacks job assignment; all owners Unassigned",
      impact: "Even with recommendedStage, P187.1 eligibility fails closed",
      proposedFix:
        "Persist job/position on workflow or join Breezy candidate.positionId during eligibility; require assigned recruiter/DM before HR",
      implementationEffort: "M",
      productionRisk: "low",
    },
  ];
}

export function buildFlowDiagramMarkdown(stopPoint: string): string {
  return [
    "# Production lifecycle flow (P188)",
    "",
    "```",
    "Applied",
    "  ↓",
    "Recruiter Review",
    "  ↓",
    "Hiring Recommendation",
    "  ↓",
    "Operator Approval",
    "  ↓",
    "Paperwork Needed",
    "  ↓",
    "Paperwork Sent → Viewed → Signed → Ready for MEL → Exported",
    "```",
    "",
    `**Current stop / bypass:** ${stopPoint}`,
    "",
    "Observed production behavior:",
    "",
    "- Most candidates **stop at Applied** (no recruiter claim / no HR evidence).",
    "- A large secondary path **bypasses** mid-funnel via onboarding reconciliation:",
    "  `Applied → Paperwork Sent / Signed` without Hiring Recommendation or Operator Approved.",
    "- **Hiring Recommendation count = 0** in durable store.",
    "",
  ].join("\n");
}
