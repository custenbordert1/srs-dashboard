import { verifyAutopilotSystemHealth } from "@/lib/p154-controlled-production-autopilot-activation/verify-system-health";
import { loadPaperworkAutomationAuditLog } from "@/lib/p145-controlled-paperwork-automation/paperwork-automation-audit-store";
import type { P160CheckItem, P160IntegrationsSection } from "@/lib/p160-production-readiness/types";
import { aggregateLevel } from "@/lib/p160-production-readiness/scoring";

function mapHealthStatus(
  status: "healthy" | "degraded" | "unhealthy",
): "ready" | "warning" | "blocked" {
  if (status === "healthy") return "ready";
  if (status === "degraded") return "warning";
  return "blocked";
}

export async function buildP160Integrations(): Promise<P160IntegrationsSection> {
  const health = await verifyAutopilotSystemHealth();
  const audit = await loadPaperworkAutomationAuditLog().catch(() => []);

  const items: P160CheckItem[] = health.checks.map((check) => ({
    id: check.id,
    label: check.label,
    status: mapHealthStatus(check.status),
    detail: check.detail,
  }));

  items.push({
    id: "mel",
    label: "MEL",
    status: "warning",
    detail:
      "No live MEL API integration — candidates reach MEL via workflow status (Ready for MEL / Loaded in MEL). Manual load process required.",
  });

  items.push({
    id: "audit_store",
    label: "Audit store",
    status: audit.length >= 0 ? "ready" : "blocked",
    detail: `P145 paperwork audit readable (${audit.length} events). Workflow + runner audit JSONL on disk.`,
  });

  const overall = aggregateLevel(items.map((i) => i.status));
  return { overall, items };
}
