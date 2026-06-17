import type { AuditCenterRow } from "@/lib/executive-accountability/audit-center";
import type { OverdueEscalationDashboard } from "@/lib/executive-accountability/overdue-escalation";
import type { ExecutiveWeeklyPacket } from "@/lib/executive-accountability/weekly-executive-packet";

export type ExecutiveOperatingRhythm = {
  weeklyPacket: ExecutiveWeeklyPacket;
  overdueEscalation: OverdueEscalationDashboard;
  auditCenter: AuditCenterRow[];
  emailMarkdown: string;
};
