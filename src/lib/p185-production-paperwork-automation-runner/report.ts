import { P185_CANDIDATE_SOURCE_MAPPING } from "@/lib/p185-production-paperwork-automation-runner/candidateSource";
import { getP185StorageHealth } from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import { getP185SchedulerConfig } from "@/lib/p185-production-paperwork-automation-runner/scheduler";
import { isP185SchedulerAuthConfigured } from "@/lib/p185-production-paperwork-automation-runner/health";
import type { P185ValidationReport } from "@/lib/p185-production-paperwork-automation-runner/types";
import { P185_SOURCE_PHASE } from "@/lib/p185-production-paperwork-automation-runner/types";

export function buildP185ValidationReport(input: {
  dryRunCycleResults?: Record<string, unknown>;
  leaseConcurrencySimulation?: string;
  restartRecoveryResults?: string;
  reconciliationResults?: string;
  circuitBreakerResults?: string;
  duplicateSendSimulation?: string;
  timeoutBudgetSimulation?: string;
  productionBlockers?: string[];
  liveEnablementReadiness?: boolean;
  warnings?: string[];
}): P185ValidationReport {
  const storage = getP185StorageHealth();
  const sched = getP185SchedulerConfig();
  const auth = isP185SchedulerAuthConfigured();
  const blockers = [...(input.productionBlockers ?? [])];
  if (!storage.durable) blockers.push("Durable storage not selected for this environment.");
  if (!auth) blockers.push("CRON_SECRET / P185_CRON_SECRET not configured.");
  if (process.env.P185_PRODUCTION_AUTOMATION_ENABLED !== "1") {
    blockers.push("P185_PRODUCTION_AUTOMATION_ENABLED is not set — scheduled live remains gated.");
  }

  return {
    phase: P185_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    storageAdapterSelected: storage.adapter,
    storageDurabilityResult: `${storage.durable ? "durable" : "ephemeral"} — ${storage.detail}`,
    schedulerConfiguration: {
      expression: sched.expression,
      intervalMs: sched.intervalMs,
      maxSendsPerCycle: sched.maxSendsPerCycle,
      path: sched.path,
      vercelCron: true,
      companyServerExample: "*/10 * * * * curl -X POST -H \"Authorization: Bearer $CRON_SECRET\" https://host/api/cron/p185-paperwork-automation",
    },
    authenticationResult: auth
      ? "Scheduler secret configured (header Bearer / x-cron-secret)."
      : "Scheduler secret missing — endpoint rejects requests.",
    leaseConcurrencySimulation:
      input.leaseConcurrencySimulation ?? "See automated tests: overlapping runner prevention.",
    candidateSourceMapping: P185_CANDIDATE_SOURCE_MAPPING,
    dryRunCycleResults: input.dryRunCycleResults ?? {},
    restartRecoveryResults:
      input.restartRecoveryResults ?? "See tests: server restart recovery + stale processing.",
    reconciliationResults:
      input.reconciliationResults ?? "See tests: reconciliation without duplicate resend.",
    circuitBreakerResults: input.circuitBreakerResults ?? "See tests: circuit-breaker activation.",
    duplicateSendSimulation:
      input.duplicateSendSimulation ?? "P184 idempotency keys + P185 envelope records prevent resend.",
    timeoutBudgetSimulation:
      input.timeoutBudgetSimulation ?? "claimCutoffMs stops new work before platform timeout.",
    productionBlockers: [...new Set(blockers)],
    liveEnablementReadiness: input.liveEnablementReadiness ?? false,
    warnings: input.warnings ?? [],
  };
}

export function formatP185Markdown(report: P185ValidationReport): string {
  const lines = [
    `# P185 Production Paperwork Automation Runner — Validation`,
    ``,
    `Generated: ${report.generatedAt}`,
    ``,
    `## Storage`,
    `- Adapter: ${report.storageAdapterSelected}`,
    `- Durability: ${report.storageDurabilityResult}`,
    ``,
    `## Scheduler`,
    "```json",
    JSON.stringify(report.schedulerConfiguration, null, 2),
    "```",
    ``,
    `## Authentication`,
    report.authenticationResult,
    ``,
    `## Candidate source mapping`,
    ...report.candidateSourceMapping.map(
      (m) => `- **${m.source}** → \`${m.target}\` (fallback: ${m.fallback})`,
    ),
    ``,
    `## Simulations`,
    `- Lease concurrency: ${report.leaseConcurrencySimulation}`,
    `- Restart recovery: ${report.restartRecoveryResults}`,
    `- Reconciliation: ${report.reconciliationResults}`,
    `- Circuit breaker: ${report.circuitBreakerResults}`,
    `- Duplicate send: ${report.duplicateSendSimulation}`,
    `- Timeout budget: ${report.timeoutBudgetSimulation}`,
    ``,
    `## Dry-run cycle`,
    "```json",
    JSON.stringify(report.dryRunCycleResults, null, 2),
    "```",
    ``,
    `## Production blockers`,
    ...(report.productionBlockers.length
      ? report.productionBlockers.map((b) => `- ${b}`)
      : ["- None recorded"]),
    ``,
    `## Live enablement readiness`,
    report.liveEnablementReadiness ? "READY (still requires explicit operator enablement)" : "NOT READY",
    ``,
    `## Warnings`,
    ...(report.warnings.length ? report.warnings.map((w) => `- ${w}`) : ["- None"]),
  ];
  return `${lines.join("\n")}\n`;
}
