import type { AutomationHookDefinition } from "@/lib/autonomous-onboarding-engine/types";

/** Future automation chain — definitions only; nothing executes in preview mode. */
export const AUTONOMOUS_ONBOARDING_AUTOMATION_HOOKS: AutomationHookDefinition[] = [
  {
    id: "paperwork_signed",
    label: "Paperwork Signed",
    description: "Detect Dropbox Sign completion and open onboarding automation.",
    triggerState: "paperwork_signed",
    nextHookId: "generate_welcome",
    status: "defined",
    previewOnly: true,
  },
  {
    id: "generate_welcome",
    label: "Generate Welcome",
    description: "Draft welcome email and training instructions (no send in preview).",
    triggerState: "paperwork_signed",
    nextHookId: "assign_training",
    status: "preview",
    previewOnly: true,
  },
  {
    id: "assign_training",
    label: "Assign Training",
    description: "Assign MEL Test Survey, Store Call Training, and future modules.",
    triggerState: "welcome_prepared",
    nextHookId: "wait_for_completion",
    status: "preview",
    previewOnly: true,
  },
  {
    id: "wait_for_completion",
    label: "Wait for Completion",
    description: "Monitor training module completion and acknowledgement status.",
    triggerState: "training_assigned",
    nextHookId: "ready_for_work_check",
    status: "defined",
    previewOnly: true,
  },
  {
    id: "ready_for_work_check",
    label: "Ready For Work Check",
    description: "Run readiness calculator and surface missing requirements.",
    triggerState: "training_complete",
    nextHookId: "notify_district_manager",
    status: "preview",
    previewOnly: true,
  },
  {
    id: "notify_district_manager",
    label: "Notify District Manager",
    description: "Alert assigned DM that representative is ready for project assignment.",
    triggerState: "ready_for_work",
    nextHookId: "project_assignment",
    status: "disabled",
    previewOnly: true,
  },
  {
    id: "project_assignment",
    label: "Project Assignment",
    description: "Hand off to placement / MEL project assignment workflow.",
    triggerState: "ready_for_work",
    nextHookId: "retention_workflow",
    status: "disabled",
    previewOnly: true,
  },
  {
    id: "retention_workflow",
    label: "Future Retention Workflow",
    description: "Post-assignment retention cadence (not yet implemented).",
    triggerState: "assigned",
    nextHookId: null,
    status: "disabled",
    previewOnly: true,
  },
];

export function listAutomationHookDefinitions(): AutomationHookDefinition[] {
  return [...AUTONOMOUS_ONBOARDING_AUTOMATION_HOOKS];
}

export function hooksForState(state: AutomationHookDefinition["triggerState"]): AutomationHookDefinition[] {
  return AUTONOMOUS_ONBOARDING_AUTOMATION_HOOKS.filter((row) => row.triggerState === state);
}
