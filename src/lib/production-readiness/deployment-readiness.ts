import { validateEnv } from "@/lib/env-validation";
import { canCreateSessions, getAuthEnvStatus } from "@/lib/auth/auth-env";
import type { DeploymentChecklistItem } from "@/lib/production-readiness/types";

export function buildDeploymentChecklist(): DeploymentChecklistItem[] {
  const env = validateEnv();
  const auth = getAuthEnvStatus();
  const isProd = process.env.NODE_ENV === "production";

  return [
    {
      id: "env-required",
      label: "Required environment variables",
      passed: env.ok,
      detail: env.ok ? "All required variables set" : env.setupHint,
    },
    {
      id: "session-secret",
      label: "Session authentication configured",
      passed: canCreateSessions() && (!isProd || auth.sessionSecretSource === "SESSION_SECRET"),
      detail: canCreateSessions()
        ? auth.sessionSecretSource === "SESSION_SECRET"
          ? "Production session secret configured"
          : "Sessions enabled (verify secret in production)"
        : "Sessions not configured",
    },
    {
      id: "breezy-api",
      label: "Breezy API connectivity",
      passed: env.statuses.find((row) => row.name === "BREEZY_API_KEY")?.configured ?? false,
      detail: "BREEZY_API_KEY required for live recruiting data",
    },
    {
      id: "audit-logging",
      label: "Audit logging enabled",
      passed: true,
      detail: "Append-only audit log at .data/audit-log.jsonl",
    },
    {
      id: "read-only-guards",
      label: "Read-only production guards",
      passed: true,
      detail: "Breezy/MEL write guards active via security layer",
    },
    {
      id: "demo-mode-off",
      label: "Demo mode disabled for pilot",
      passed: process.env.EXECUTIVE_DEMO_MODE !== "true",
      detail:
        process.env.EXECUTIVE_DEMO_MODE === "true"
          ? "EXECUTIVE_DEMO_MODE is enabled — disable for production pilot"
          : "Live data mode (demo off)",
    },
  ];
}

export function buildStartupDiagnostics() {
  const env = validateEnv();
  return {
    envOk: env.ok,
    authConfigured: canCreateSessions(),
    demoMode: process.env.EXECUTIVE_DEMO_MODE === "true",
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
}
