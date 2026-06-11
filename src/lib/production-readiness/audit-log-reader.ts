import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AuditLogEntry } from "@/lib/security/audit-log";
import type {
  AiActionAuditEntry,
} from "@/lib/ai-action-engine/types";
import { listAiActionAudit } from "@/lib/ai-action-engine/ai-action-store";
import type {
  AuditActivityEntry,
  DataChangeEntry,
  LoginHistoryEntry,
} from "@/lib/production-readiness/types";

const AUDIT_PATH = path.join(process.cwd(), ".data", "audit-log.jsonl");

export async function readSecurityAuditLog(limit = 100): Promise<AuditLogEntry[]> {
  try {
    const raw = await readFile(AUDIT_PATH, "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .reverse()
      .map((line) => JSON.parse(line) as AuditLogEntry);
  } catch {
    return [];
  }
}

function summarizeAudit(entry: AuditLogEntry): string {
  const meta = entry.metadata;
  if (typeof meta.message === "string") return meta.message;
  if (typeof meta.route === "string") return String(meta.route);
  return `${entry.action} on ${entry.entityType}`;
}

export async function buildLoginHistory(limit = 25): Promise<LoginHistoryEntry[]> {
  const rows = await readSecurityAuditLog(200);
  return rows
    .filter((row) => row.action === "login_success" || row.action === "login_failure" || row.action === "login_attempt")
    .slice(0, limit)
    .map((row) => ({
      timestamp: row.timestamp,
      userId: row.userId,
      role: row.role,
      outcome: row.action === "login_failure" ? "failure" : "success",
      summary: summarizeAudit(row),
    }));
}

export async function buildDataChangeHistory(limit = 25): Promise<DataChangeEntry[]> {
  const rows = await readSecurityAuditLog(200);
  return rows
    .filter((row) =>
      ["workflow_action", "workflow_roster", "recommendation_action", "onboarding_send_packet"].includes(
        row.action,
      ),
    )
    .slice(0, limit)
    .map((row) => ({
      timestamp: row.timestamp,
      userId: row.userId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: summarizeAudit(row),
    }));
}

export async function buildUnifiedAuditActivity(limit = 40): Promise<AuditActivityEntry[]> {
  const [security, aiActions] = await Promise.all([
    readSecurityAuditLog(limit),
    listAiActionAudit(limit),
  ]);

  const securityRows: AuditActivityEntry[] = security.map((row, index) => ({
    id: `sec:${row.timestamp}:${index}`,
    timestamp: row.timestamp,
    userId: row.userId,
    role: row.role,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    territory: row.territory,
    summary: summarizeAudit(row),
    source: row.action.startsWith("login") ? "login" : "security-audit",
  }));

  const aiRows: AuditActivityEntry[] = aiActions.map((row: AiActionAuditEntry) => ({
    id: row.id,
    timestamp: row.timestamp,
    userId: row.userId,
    role: "recruiter",
    action: row.actionKind,
    entityType: "recommendation",
    entityId: row.insightId,
    territory: "",
    summary: row.outcomeDetail,
    source: "ai-action",
  }));

  return [...securityRows, ...aiRows]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
