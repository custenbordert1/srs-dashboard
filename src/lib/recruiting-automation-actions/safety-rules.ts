import type {
  AutomationApprovalStatus,
  AutomationSafetyMode,
  RecruitingAutomationRecord,
} from "@/lib/recruiting-automation-actions/types";
import {
  DEFAULT_AUTOMATION_SAFETY_MODE,
  ENABLED_AUTOMATION_SAFETY_MODES,
} from "@/lib/recruiting-automation-actions/types";

export function isAutomationModeEnabled(mode: AutomationSafetyMode): boolean {
  return ENABLED_AUTOMATION_SAFETY_MODES.includes(mode);
}

export function resolveAutomationSafetyMode(
  configured: AutomationSafetyMode | undefined,
): AutomationSafetyMode {
  const mode = configured ?? DEFAULT_AUTOMATION_SAFETY_MODE;
  return isAutomationModeEnabled(mode) ? mode : DEFAULT_AUTOMATION_SAFETY_MODE;
}

export function canSubmitForApproval(
  record: RecruitingAutomationRecord,
  mode: AutomationSafetyMode,
): { allowed: boolean; reason?: string } {
  if (mode === "draft-only") {
    return { allowed: false, reason: "Automation is in draft-only mode — submission is disabled." };
  }
  if (record.approvalStatus !== "Draft") {
    return { allowed: false, reason: "Only draft automations can be submitted for approval." };
  }
  return { allowed: true };
}

export function canApproveAutomation(
  record: RecruitingAutomationRecord,
  mode: AutomationSafetyMode,
): { allowed: boolean; reason?: string } {
  if (mode === "draft-only") {
    return { allowed: false, reason: "Automation is in draft-only mode — approval is disabled." };
  }
  if (record.approvalStatus !== "Pending Approval") {
    return { allowed: false, reason: "Only pending automations can be approved." };
  }
  return { allowed: true };
}

export function canExecuteAutomation(
  record: RecruitingAutomationRecord,
  mode: AutomationSafetyMode,
): { allowed: boolean; reason?: string } {
  if (mode === "draft-only") {
    return { allowed: false, reason: "Automation is in draft-only mode — execution is blocked." };
  }
  if (mode === "requires-approval" && record.approvalStatus !== "Approved") {
    return {
      allowed: false,
      reason: "Approval required — automation must be approved before execution.",
    };
  }
  if (record.approvalStatus === "Cancelled" || record.approvalStatus === "Failed") {
    return { allowed: false, reason: "Cancelled or failed automations cannot be executed." };
  }
  if (record.approvalStatus === "Completed") {
    return { allowed: false, reason: "Automation is already completed." };
  }
  if (mode === "requires-approval" && record.approvalStatus !== "Approved") {
    return { allowed: false, reason: "Unapproved execution is blocked by safety rules." };
  }
  return { allowed: true };
}

export function isExecutableStatus(status: AutomationApprovalStatus): boolean {
  return status === "Approved" || status === "Executing";
}
