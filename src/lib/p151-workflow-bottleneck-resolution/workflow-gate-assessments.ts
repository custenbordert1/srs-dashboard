import type { WorkflowGateAssessment } from "@/lib/p151-workflow-bottleneck-resolution/types";

export function buildWorkflowGateAssessments(): WorkflowGateAssessment[] {
  return [
    {
      gateId: "requireApproval",
      label: "P83 requireApproval",
      businessPurpose:
        "Human approval gate before autonomous advancement writes workflow state. Prevents send-paperwork from persisting without executive sign-off in dry-run and read-only analysis paths.",
      currentImplementation:
        "buildCandidateAdvancementDecision sets requireApproval from options.requireApproval ?? true. When true, qualified candidates get action=send-paperwork but shouldAdvance=false. P151 live execution passes requireApproval:false only when P151_AUTONOMOUS_ADVANCEMENT_ENABLED=true. P144/P145/P150 dry scripts keep requireApproval:true.",
      required: true,
      canAutomate: true,
      recommendedImplementation:
        "Keep default true for analysis and dry-run. Bypass only in controlled live P151 execution (already implemented in advance-candidate-pipeline.ts). Do not bypass for incomplete, needs-review, or disqualified verdicts.",
      risk:
        "Low when scoped to P151 live + qualified send-paperwork only. High if bypassed globally without grade/review gates.",
      classification: "safety_gate",
    },
    {
      gateId: "workflowStatus",
      label: "workflowStatus Applied / screen-candidate",
      businessPurpose:
        "Workflow status tracks funnel position. Paperwork Needed means recruiter/DM has cleared the candidate for onboarding packet prep. P145 requires workflowStatus=Paperwork Needed and actionType=send-paperwork.",
      currentImplementation:
        "applyRecruiterAssignments preserves existing workflowStatus (typically Applied). applyCandidateAdvancements transitions to Paperwork Needed when P83 action=send-paperwork and shouldAdvance=true. P151.3 ran P151.2 assignment only — advancement phase was not executed.",
      required: true,
      canAutomate: true,
      recommendedImplementation:
        "After recruiter + DM mechanical assignment, run applyCandidateAdvancements for candidates with P83 send-paperwork and shouldAdvance=true (P151 advancement phase). This is a system state transition, not a hiring decision.",
      risk:
        "Low when gated by P83 qualified verdict. Must not advance incomplete, needs-review, or hold candidates.",
      classification: "artificial_bottleneck",
    },
    {
      gateId: "dmNeedsAssignment",
      label: "dmNeedsAssignment / P144 mapP83Action",
      businessPurpose:
        "Ensure each candidate has a territory-aligned district manager for escalation and coverage accountability.",
      currentImplementation:
        "build-candidate-workflow-row sets dmNeedsAssignment via dmAssignmentNeedsAttention(assignedDM, suggestedDM). applyRecruiterAssignments sets recruiter but not assignedDM. mapP83Action treats dmNeedsAssignment like unassigned recruiter and forces nextAction=Assign Recruiter even when recruiter is assigned.",
      required: true,
      canAutomate: true,
      recommendedImplementation:
        "On recruiter assignment, mechanically set assignedDM from territory map (decision.dmName / suggestDmForCandidate). Recruiter assignment alone should not satisfy DM requirement — DM must be written to workflow.",
      risk:
        "Low — territory-to-DM mapping is deterministic. Risk if territory map is wrong; audit log assignment.",
      classification: "artificial_bottleneck",
    },
    {
      gateId: "resumeRequirement",
      label: "Missing resume / incomplete verdict",
      businessPurpose:
        "Resume and questionnaire completeness are hiring-quality inputs. Grade C with missing resume requires recruiter verification before paperwork.",
      currentImplementation:
        "evaluateApplicantReview returns verdict=incomplete when !hasResume. buildCandidateAdvancementDecision returns action=hold. detectBlockers adds Missing Resume. Not bypassed in P151.",
      required: true,
      canAutomate: false,
      recommendedImplementation:
        "Keep as business requirement. Recruiter may upload resume or mark not qualified manually. Do not auto-override incomplete verdict.",
      risk:
        "High if automated away — sends paperwork to candidates without verified profile data.",
      classification: "business_requirement",
    },
  ];
}
