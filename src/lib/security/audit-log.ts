import { appendFile } from "node:fs/promises";
import path from "node:path";
import type { AuthSession, UserRole } from "@/lib/auth/types";
import { recruitingDataDir, safeRecruitingMkdir, useInMemoryPersistence } from "@/lib/recruiting-data-dir";

export type AuditRole = UserRole | "anonymous";

export type AuditAction =
  | "login_attempt"
  | "login_success"
  | "login_failure"
  | "logout"
  | "candidate_view"
  | "workflow_action"
  | "recommendation_action"
  | "territory_access"
  | "export_download"
  | "api_access"
  | "read_only_blocked"
  | "workflow_roster"
  | "onboarding_send_packet"
  | "onboarding_status_check";

export type AuditEntityType =
  | "user"
  | "candidate"
  | "workflow"
  | "workflow_roster"
  | "candidate_workflow"
  | "recommendation"
  | "territory"
  | "export"
  | "api"
  | "system";

export type AuditLogEntry = {
  timestamp: string;
  userId: string;
  role: AuditRole;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  territory: string;
  metadata: Record<string, unknown>;
};

const memoryAuditEntries: AuditLogEntry[] = [];

function auditLogPath(): string {
  return path.join(recruitingDataDir(), "audit-log.jsonl");
}

let writeQueue: Promise<void> = Promise.resolve();

function appendEntry(entry: AuditLogEntry): void {
  if (useInMemoryPersistence()) {
    memoryAuditEntries.push(entry);
    return;
  }
  const line = `${JSON.stringify(entry)}\n`;
  writeQueue = writeQueue
    .then(async () => {
      await safeRecruitingMkdir(recruitingDataDir());
      await appendFile(auditLogPath(), line, "utf8");
    })
    .catch((err) => {
      console.warn("[audit-log] write failed", err instanceof Error ? err.message : err);
    });
}

export function writeAuditLog(
  input: Omit<AuditLogEntry, "timestamp"> & { timestamp?: string },
): void {
  appendEntry({
    timestamp: input.timestamp ?? new Date().toISOString(),
    userId: input.userId,
    role: input.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    territory: input.territory,
    metadata: input.metadata,
  });
}

export function auditFromSession(
  session: AuthSession | null,
  partial: Omit<AuditLogEntry, "timestamp" | "userId" | "role" | "territory"> & {
    territory?: string;
  },
): void {
  writeAuditLog({
    userId: session?.userId ?? "anonymous",
    role: session?.role ?? "anonymous",
    territory: partial.territory ?? session?.territoryStates.join(",") ?? "",
    action: partial.action,
    entityType: partial.entityType,
    entityId: partial.entityId,
    metadata: partial.metadata,
  });
}

export function territoryLabel(session: AuthSession | null): string {
  if (!session) return "";
  if (session.role === "executive" || session.role === "recruiter") return "nationwide";
  return session.territoryStates.join(",");
}
