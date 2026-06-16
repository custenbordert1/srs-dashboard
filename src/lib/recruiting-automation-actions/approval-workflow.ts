import type { AuthSession } from "@/lib/auth/types";
import type { RecruitingAutomationRecord } from "@/lib/recruiting-automation-actions/types";
import {
  appendAuditEntry,
  getAutomationRecord,
  getAutomationSafetyMode,
  upsertAutomationRecord,
} from "@/lib/recruiting-automation-actions/store";
import {
  canApproveAutomation,
  canExecuteAutomation,
  canSubmitForApproval,
  resolveAutomationSafetyMode,
} from "@/lib/recruiting-automation-actions/safety-rules";
import { executeAutomationAdapter } from "@/lib/recruiting-automation-actions/adapters";
import { onAutomationCompleted } from "@/lib/recruiting-automation-actions/p38-integration";

async function loadRecord(id: string): Promise<RecruitingAutomationRecord | null> {
  return getAutomationRecord(id);
}

export async function submitAutomationForApproval(
  session: AuthSession,
  automationId: string,
): Promise<{ ok: boolean; record?: RecruitingAutomationRecord; error?: string }> {
  const record = await loadRecord(automationId);
  if (!record) return { ok: false, error: "Automation not found" };
  const mode = resolveAutomationSafetyMode(await getAutomationSafetyMode());
  const check = canSubmitForApproval(record, mode);
  if (!check.allowed) return { ok: false, error: check.reason };

  const now = new Date().toISOString();
  const next: RecruitingAutomationRecord = {
    ...record,
    approvalStatus: "Pending Approval",
    executionStatus: "Pending Approval",
    submittedAt: now,
    updatedAt: now,
  };
  const withAudit = appendAuditEntry(record, session, {
    action: "submitted",
    before: { approvalStatus: record.approvalStatus },
    after: { approvalStatus: next.approvalStatus },
    note: "Submitted for approval",
  });
  const final = { ...next, auditLog: withAudit.auditLog, updatedAt: withAudit.updatedAt };
  await upsertAutomationRecord(final);
  return { ok: true, record: final };
}

export async function approveAutomation(
  session: AuthSession,
  automationId: string,
): Promise<{ ok: boolean; record?: RecruitingAutomationRecord; error?: string }> {
  const record = await loadRecord(automationId);
  if (!record) return { ok: false, error: "Automation not found" };
  const mode = resolveAutomationSafetyMode(await getAutomationSafetyMode());
  const check = canApproveAutomation(record, mode);
  if (!check.allowed) return { ok: false, error: check.reason };

  const now = new Date().toISOString();
  const approver = session.name || session.email;
  const next: RecruitingAutomationRecord = {
    ...record,
    approvalStatus: "Approved",
    executionStatus: "Approved",
    approvedBy: approver,
    approvedAt: now,
    updatedAt: now,
  };
  const withAudit = appendAuditEntry(record, session, {
    action: "approved",
    before: { approvalStatus: record.approvalStatus },
    after: { approvalStatus: next.approvalStatus, approvedBy: approver, approvedAt: now },
    note: `Approved by ${approver}`,
  });
  const final = { ...next, auditLog: withAudit.auditLog, updatedAt: withAudit.updatedAt };
  await upsertAutomationRecord(final);
  return { ok: true, record: final };
}

export async function cancelAutomation(
  session: AuthSession,
  automationId: string,
  reason?: string,
): Promise<{ ok: boolean; record?: RecruitingAutomationRecord; error?: string }> {
  const record = await loadRecord(automationId);
  if (!record) return { ok: false, error: "Automation not found" };
  if (record.approvalStatus === "Completed") {
    return { ok: false, error: "Completed automations cannot be cancelled." };
  }

  const now = new Date().toISOString();
  const next: RecruitingAutomationRecord = {
    ...record,
    approvalStatus: "Cancelled",
    executionStatus: "Cancelled",
    cancelledAt: now,
    failureReason: reason?.trim() || record.failureReason,
    updatedAt: now,
  };
  const withAudit = appendAuditEntry(record, session, {
    action: "cancelled",
    before: { approvalStatus: record.approvalStatus },
    after: { approvalStatus: next.approvalStatus },
    note: reason?.trim() || "Cancelled",
  });
  const final = { ...next, auditLog: withAudit.auditLog, updatedAt: withAudit.updatedAt };
  await upsertAutomationRecord(final);
  return { ok: true, record: final };
}

export async function executeAutomation(
  session: AuthSession,
  automationId: string,
): Promise<{ ok: boolean; record?: RecruitingAutomationRecord; error?: string; adapterMessage?: string }> {
  const record = await loadRecord(automationId);
  if (!record) return { ok: false, error: "Automation not found" };
  const mode = resolveAutomationSafetyMode(await getAutomationSafetyMode());
  const check = canExecuteAutomation(record, mode);
  if (!check.allowed) return { ok: false, error: check.reason };

  const now = new Date().toISOString();
  const executor = session.name || session.email;
  const executing: RecruitingAutomationRecord = {
    ...record,
    approvalStatus: "Executing",
    executionStatus: "Executing",
    executedBy: executor,
    executedAt: now,
    updatedAt: now,
  };
  await upsertAutomationRecord(
    appendAuditEntry(record, session, {
      action: "executed",
      before: { approvalStatus: record.approvalStatus },
      after: { approvalStatus: "Executing", executedBy: executor, executedAt: now },
      note: "Execution started",
    }),
  );

  const adapterResult = await executeAutomationAdapter(executing);
  const completed: RecruitingAutomationRecord = {
    ...executing,
    approvalStatus: adapterResult.ok ? "Completed" : "Failed",
    executionStatus: adapterResult.ok ? "Completed" : "Failed",
    failureReason: adapterResult.ok ? null : adapterResult.message,
    updatedAt: new Date().toISOString(),
  };
  const withAudit = appendAuditEntry(executing, session, {
    action: adapterResult.ok ? "completed" : "failed",
    before: { approvalStatus: "Executing" },
    after: {
      approvalStatus: completed.approvalStatus,
      failureReason: completed.failureReason,
    },
    note: adapterResult.message,
  });
  const final = { ...completed, auditLog: withAudit.auditLog, updatedAt: withAudit.updatedAt };
  await upsertAutomationRecord(final);

  if (adapterResult.ok) {
    await onAutomationCompleted(session, final);
  }

  return {
    ok: adapterResult.ok,
    record: final,
    error: adapterResult.ok ? undefined : adapterResult.message,
    adapterMessage: adapterResult.message,
  };
}

export async function markAutomationFailed(
  session: AuthSession,
  automationId: string,
  reason: string,
): Promise<{ ok: boolean; record?: RecruitingAutomationRecord; error?: string }> {
  const record = await loadRecord(automationId);
  if (!record) return { ok: false, error: "Automation not found" };

  const now = new Date().toISOString();
  const next: RecruitingAutomationRecord = {
    ...record,
    approvalStatus: "Failed",
    executionStatus: "Failed",
    failureReason: reason.trim() || "Marked failed manually",
    updatedAt: now,
  };
  const withAudit = appendAuditEntry(record, session, {
    action: "failed",
    before: { approvalStatus: record.approvalStatus },
    after: { approvalStatus: "Failed", failureReason: next.failureReason },
    note: next.failureReason,
  });
  const final = { ...next, auditLog: withAudit.auditLog, updatedAt: withAudit.updatedAt };
  await upsertAutomationRecord(final);
  return { ok: true, record: final };
}

export async function markAutomationCompleted(
  session: AuthSession,
  automationId: string,
): Promise<{ ok: boolean; record?: RecruitingAutomationRecord; error?: string }> {
  const record = await loadRecord(automationId);
  if (!record) return { ok: false, error: "Automation not found" };

  const now = new Date().toISOString();
  const next: RecruitingAutomationRecord = {
    ...record,
    approvalStatus: "Completed",
    executionStatus: "Completed",
    updatedAt: now,
  };
  const withAudit = appendAuditEntry(record, session, {
    action: "completed",
    before: { approvalStatus: record.approvalStatus },
    after: { approvalStatus: "Completed" },
    note: "Marked completed manually",
  });
  const final = { ...next, auditLog: withAudit.auditLog, updatedAt: withAudit.updatedAt };
  await upsertAutomationRecord(final);
  await onAutomationCompleted(session, final);
  return { ok: true, record: final };
}

export async function previewAutomation(
  session: AuthSession,
  automationId: string,
): Promise<{ ok: boolean; record?: RecruitingAutomationRecord; preview?: string; error?: string }> {
  const record = await loadRecord(automationId);
  if (!record) return { ok: false, error: "Automation not found" };

  const adapterResult = await executeAutomationAdapter(record, { previewOnly: true });
  const withAudit = appendAuditEntry(record, session, {
    action: "preview",
    before: null,
    after: null,
    note: adapterResult.message,
  });
  const final = { ...record, auditLog: withAudit.auditLog, updatedAt: withAudit.updatedAt };
  await upsertAutomationRecord(final);
  return { ok: true, record: final, preview: adapterResult.message };
}
