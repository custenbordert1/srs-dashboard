import type {
  P160AutomationReadinessSection,
  P160InfrastructureSection,
  P160IntegrationsSection,
  P160Recommendation,
  P160RiskAssessmentSection,
  P160RiskItem,
  P160SafetyChecklistSection,
} from "@/lib/p160-production-readiness/types";

export function buildP160RiskAssessment(input: {
  infrastructure: P160InfrastructureSection;
  integrations: P160IntegrationsSection;
  automation: P160AutomationReadinessSection;
  safety: P160SafetyChecklistSection;
  continuousEnabled: boolean;
  daemonRunning: boolean;
}): P160RiskAssessmentSection {
  const risks: P160RiskItem[] = [];

  for (const secret of input.infrastructure.secretsConfigured) {
    if (secret.status === "blocked") {
      risks.push({
        id: `secret-${secret.id}`,
        severity: "critical",
        title: `Missing secret: ${secret.label}`,
        detail: secret.detail,
        mitigation: "Configure secret in server .env.local before deployment.",
      });
    }
  }

  for (const integration of input.integrations.items) {
    if (integration.status === "blocked") {
      risks.push({
        id: `integration-${integration.id}`,
        severity: "critical",
        title: `Integration blocked: ${integration.label}`,
        detail: integration.detail,
        mitigation: "Resolve dependency health before enabling live automation.",
      });
    } else if (integration.status === "warning" && integration.id === "candidate_ingestion") {
      risks.push({
        id: "ingestion-stale",
        severity: "high",
        title: "Stale candidate ingestion",
        detail: integration.detail,
        mitigation: "Run ingestion sync before live paperwork batches.",
      });
    }
  }

  for (const phase of input.automation.phases) {
    if (phase.status === "blocked") {
      risks.push({
        id: `automation-${phase.phase}`,
        severity: "high",
        title: `${phase.label} blocked`,
        detail: phase.detail,
        mitigation: "Fix module errors before server deployment.",
      });
    }
  }

  if (input.continuousEnabled && !input.daemonRunning) {
    risks.push({
      id: "continuous-flag-without-daemon",
      severity: "high",
      title: "Continuous flag enabled without daemon",
      detail: "P154_CONTINUOUS_ENABLED=true but no active daemon process detected.",
      mitigation: "Either disable flag or start monitored p154.7-continuous-runner --daemon.",
    });
  }

  if (input.continuousEnabled && input.daemonRunning) {
    risks.push({
      id: "continuous-active",
      severity: "medium",
      title: "Continuous mode active",
      detail: "Autonomous polling may send paperwork without operator trigger.",
      mitigation: "Use observation mode with caps and monitoring for 24h before unsupervised operation.",
    });
  }

  const flagCheck = input.safety.items.find((i) => i.id === "feature_flags");
  if (flagCheck?.status === "warning") {
    risks.push({
      id: "live-flags-on",
      severity: "medium",
      title: "Live automation flags enabled",
      detail: flagCheck.detail,
      mitigation: "Verify flags match deployment intent; disable unused legacy paths (P147).",
    });
  }

  risks.push({
    id: "manual-batch-operations",
    severity: "medium",
    title: "Manual batch operations required",
    detail: "Production currently relies on operator-triggered capped cycles, not continuous polling.",
    mitigation: "Use P159 Operations Control Center for each live batch until continuous mode approved.",
  });

  risks.push({
    id: "mel-manual",
    severity: "low",
    title: "MEL load is manual",
    detail: "No automated MEL API — recruiters load signed candidates manually.",
    mitigation: "Document MEL handoff SOP for recruiters.",
  });

  risks.push({
    id: "queue-backlog",
    severity: "low",
    title: "Paperwork queue backlog",
    detail: "Eligible candidates may wait for next capped cycle (max 10 sends).",
    mitigation: "Run additional manual batches or raise cap after monitoring.",
  });

  const bucket = (severity: P160RiskItem["severity"]) =>
    risks.filter((r) => r.severity === severity);

  return {
    critical: bucket("critical"),
    high: bucket("high"),
    medium: bucket("medium"),
    low: bucket("low"),
  };
}

export function buildP160Recommendation(input: {
  score: number;
  risks: P160RiskAssessmentSection;
  infrastructure: P160InfrastructureSection;
  integrations: P160IntegrationsSection;
  automation: P160AutomationReadinessSection;
  continuousEnabled: boolean;
}): { recommendation: P160Recommendation; detail: string } {
  const criticalCount = input.risks.critical.length;
  const highCount = input.risks.high.length;
  const blockedIntegrations = input.integrations.items.filter((i) => i.status === "blocked").length;
  const blockedAutomation = input.automation.phases.filter((p) => p.status === "blocked").length;

  if (
    criticalCount > 0 ||
    input.score < 65 ||
    blockedIntegrations > 0 ||
    input.infrastructure.runtimeHealth === "blocked"
  ) {
    return {
      recommendation: "not_ready",
      detail: `${criticalCount} critical and ${highCount} high risks remain. Resolve blockers before deployment.`,
    };
  }

  if (
    input.score >= 85 &&
    blockedAutomation === 0 &&
    input.integrations.overall === "ready" &&
    input.automation.overall === "ready"
  ) {
    return {
      recommendation: "ready_for_controlled_production",
      detail:
        "All automation modules operational. Deploy to server and enable P154 controlled autopilot for capped live batches with P159 monitoring.",
    };
  }

  if (input.score >= 75 && highCount === 0 && !input.continuousEnabled) {
    return {
      recommendation: "ready_for_observation_mode",
      detail:
        "Infrastructure and integrations healthy. Deploy to server, run dry cycles, observe manual batches via P159 before enabling continuous polling.",
    };
  }

  if (input.score >= 70) {
    return {
      recommendation: "ready_for_server_deployment",
      detail:
        "Core platform ready for server install. Complete deployment checklist (PM2, env, build) and verify with P160/P159 artifacts before live sends.",
    };
  }

  return {
    recommendation: "not_ready",
    detail: `Readiness score ${input.score}/100 — address warnings and complete deployment checklist.`,
  };
}

export function buildP160OverallScore(input: {
  infrastructure: P160InfrastructureSection;
  integrations: P160IntegrationsSection;
  automation: P160AutomationReadinessSection;
  safety: P160SafetyChecklistSection;
  deploymentScore: number;
}): number {
  const infraLevels = [
    input.infrastructure.buildStatus,
    input.infrastructure.runtimeHealth,
    ...input.infrastructure.secretsConfigured.map((s) => s.status),
  ];
  const infraBlocked = infraLevels.filter((l) => l === "blocked").length;
  const infraScore =
    infraBlocked > 0 ? 40 : input.infrastructure.runtimeHealth === "warning" ? 75 : 95;

  const integrationScore =
    input.integrations.overall === "ready"
      ? 95
      : input.integrations.overall === "warning"
        ? 70
        : 30;

  const automationReady = input.automation.phases.filter((p) => p.status === "ready").length;
  const automationScore = Math.round((automationReady / input.automation.phases.length) * 100);

  const safetyReady = input.safety.items.filter((i) => i.status === "ready").length;
  const safetyScore = Math.round((safetyReady / input.safety.items.length) * 100);

  return Math.round(
    infraScore * 0.2 +
      integrationScore * 0.25 +
      automationScore * 0.35 +
      safetyScore * 0.1 +
      input.deploymentScore * 0.1,
  );
}
