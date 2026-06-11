import { canCreateSessions } from "@/lib/auth/auth-env";
import { validateEnv, getFeatureReadiness } from "@/lib/env-validation";
import { peekBreezyCandidatesCache } from "@/lib/breezy-api";
import type { IntegrationStatus } from "@/lib/production-readiness/types";

export function buildIntegrationStatusSnapshot(fetchedAt: string): IntegrationStatus[] {
  const env = validateEnv();
  const features = getFeatureReadiness();
  const breezyCache = peekBreezyCandidatesCache({ scanMode: "fast" });

  const featureStatus = (feature: string) => {
    const row = features.find((item) => item.feature === feature);
    if (!row) return { status: "unknown" as const, detail: "Not configured" };
    return row.ready
      ? { status: "healthy" as const, detail: "Ready" }
      : { status: "degraded" as const, detail: `Missing: ${row.missing.join(", ")}` };
  };

  const breezy = featureStatus("breezy_candidates");
  const mel = featureStatus("mel_projects");

  return [
    {
      id: "breezy",
      label: "Breezy ATS",
      status: breezy.status,
      detail: breezyCache?.ok ? `${breezy.detail} · cache warm` : breezy.detail,
      lastCheckedAt: fetchedAt,
    },
    {
      id: "mel",
      label: "MEL Projects",
      status: mel.status,
      detail: mel.detail,
      lastCheckedAt: fetchedAt,
    },
    {
      id: "notifications",
      label: "Notification engine",
      status: "healthy",
      detail: "Rule-based notifications active",
      lastCheckedAt: fetchedAt,
    },
    {
      id: "ai-engine",
      label: "AI command center",
      status: canCreateSessions() ? "healthy" : "degraded",
      detail: canCreateSessions() ? "Insights and assistant online" : "Auth required for AI routes",
      lastCheckedAt: fetchedAt,
    },
    {
      id: "coverage-engine",
      label: "Coverage optimization",
      status: mel.status === "healthy" ? "healthy" : "degraded",
      detail: mel.status === "healthy" ? "Route builder and rep matching ready" : "Requires MEL data",
      lastCheckedAt: fetchedAt,
    },
    {
      id: "environment",
      label: "Environment",
      status: env.ok ? "healthy" : "degraded",
      detail: env.ok ? "Required variables configured" : `${env.missingRequired.length} required vars missing`,
      lastCheckedAt: fetchedAt,
    },
  ];
}
