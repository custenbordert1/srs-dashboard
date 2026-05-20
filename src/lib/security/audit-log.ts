import { mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import type { AuthSession, UserRole } from "@/lib/auth/types";

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
  | "read_only_blocked";

export type AuditEntityType =
  | "user"
  | "candidate"
  | "workflow"
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

const LOG_DIR = path.join(process.cwd(), ".data");
const LOG_FILE = path.join(LOG_DIR, "audit-log.jsonl");

let writeQueue: Promise<void> = Promise.resolve();

function appendEntry(entry: AuditLogEntry): void {
  const line = `${JSON.stringify(entry)}\n`;
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(LOG_DIR, { recursive: true });
      await appendFile(LOG_FILE, line, "utf8");
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
