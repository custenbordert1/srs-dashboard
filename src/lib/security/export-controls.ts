import type { AuthSession, UserRole } from "@/lib/auth/types";
import { auditFromSession } from "@/lib/security/audit-log";

export type ExportType = "candidates" | "audit_logs" | "reps" | "rep_template" | "mel_projects";

const EXPORT_ROLES: Record<ExportType, UserRole[]> = {
  candidates: ["executive", "recruiter", "dm"],
  audit_logs: ["executive"],
  reps: ["executive", "recruiter", "dm"],
  rep_template: ["executive", "recruiter", "dm"],
  mel_projects: ["executive", "recruiter", "dm"],
};

export function canExport(session: AuthSession, exportType: ExportType): boolean {
  return EXPORT_ROLES[exportType].includes(session.role);
}

export function auditExport(session: AuthSession, exportType: ExportType, metadata?: Record<string, unknown>): void {
  auditFromSession(session, {
    action: "export_download",
    entityType: "export",
    entityId: exportType,
    metadata: metadata ?? {},
  });
}
