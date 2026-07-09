import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";
import { P145_SOURCE_PHASE } from "@/lib/p145-controlled-paperwork-automation/types";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";

const MAX_AUDIT_EVENTS = 500;

function auditPath(): string {
  return path.join(recruitingDataDir(), "p145-paperwork-automation-audit.json");
}

type AuditStoreFile = {
  events: PaperworkAutomationAuditEvent[];
  updatedAt: string;
};

export async function loadPaperworkAutomationAuditLog(): Promise<PaperworkAutomationAuditEvent[]> {
  try {
    const raw = await readFile(auditPath(), "utf8");
    const parsed = JSON.parse(raw) as AuditStoreFile;
    return parsed.events ?? [];
  } catch {
    return [];
  }
}

export async function appendPaperworkAutomationAuditEvent(
  event: Omit<PaperworkAutomationAuditEvent, "id" | "at"> & { id?: string; at?: string },
): Promise<PaperworkAutomationAuditEvent[]> {
  const existing = await loadPaperworkAutomationAuditLog();
  const full: PaperworkAutomationAuditEvent = {
    id: event.id ?? `${P145_SOURCE_PHASE}-${randomUUID()}`,
    at: event.at ?? new Date().toISOString(),
    type: event.type,
    userId: event.userId,
    userEmail: event.userEmail,
    candidateId: event.candidateId,
    project: event.project,
    recommendedAction: event.recommendedAction,
    reason: event.reason,
    executed: event.executed,
    simulated: event.simulated,
    candidateName: event.candidateName,
    email: event.email,
    recruiter: event.recruiter,
    autoSendEligible: event.autoSendEligible,
    sendResult: event.sendResult,
    blockedReason: event.blockedReason,
    cooldownCheck: event.cooldownCheck,
    paperworkStatusBeforeSend: event.paperworkStatusBeforeSend,
    templateUsed: event.templateUsed,
    executionMode: event.executionMode,
    jobId: event.jobId,
    validationResult: event.validationResult,
    duplicatePrevented: event.duplicatePrevented,
  };
  const events = [full, ...existing].slice(0, MAX_AUDIT_EVENTS);
  const now = new Date().toISOString();
  await safeRecruitingMkdir();
  await writeFile(auditPath(), `${JSON.stringify({ events, updatedAt: now }, null, 2)}\n`, "utf8");
  return events;
}

export function isP145ExecutionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P145_PAPERWORK_EXECUTION_ENABLED === "true";
}
