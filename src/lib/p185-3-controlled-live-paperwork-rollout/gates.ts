import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import { loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import {
  getP185StorageHealth,
  isP185SchedulerAuthConfigured,
  loadP185RunnerState,
  p185DataDir,
} from "@/lib/p185-production-paperwork-automation-runner";
import { evaluateProductionStorageGate } from "@/lib/p185-4-configure-production-gates-canary/storageGate";
import type { P1853GateStatus } from "@/lib/p185-3-controlled-live-paperwork-rollout/types";
import path from "node:path";

export function evaluateP1853LiveGates(input?: {
  authorizeCanary?: boolean;
}): { gates: P1853GateStatus; blockers: string[]; setupInstructions: string[] } {
  const storage = getP185StorageHealth();
  const dataDir = path.resolve(p185DataDir());
  const durableNotTmp =
    storage.durable &&
    storage.healthy &&
    !dataDir.startsWith("/tmp/") &&
    process.env.P185_FORCE_EPHEMERAL !== "1";
  const storageGate = evaluateProductionStorageGate({ storage });

  const dropbox = Boolean(readDropboxSignConfig());
  const templateConfigured = Boolean(
    process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET?.trim(),
  );
  const cronConfigured = isP185SchedulerAuthConfigured();
  const prodFlag = process.env.P185_PRODUCTION_AUTOMATION_ENABLED === "1";

  const gates: P1853GateStatus = {
    cronSecretConfigured: cronConfigured,
    productionAutomationEnabled: prodFlag,
    durableStorageHealthy: storage.healthy && storage.durable,
    durableStorageNotTmp: durableNotTmp,
    dropboxSignConfigured: dropbox,
    templateConfigured,
    p184EnabledForLive: false,
    p184ModeLive: false,
    killSwitchInactive: true,
    circuitBreakerClosed: true,
    leaseAvailable: true,
    canaryAuthorized: Boolean(input?.authorizeCanary),
    productionStorageConfirmed: storageGate.approvedForLiveSend,
  };

  return { gates, blockers: [], setupInstructions: [] };
}

export async function evaluateP1853LiveGatesAsync(input?: {
  authorizeCanary?: boolean;
}): Promise<{ gates: P1853GateStatus; blockers: string[]; setupInstructions: string[] }> {
  const base = evaluateP1853LiveGates(input);
  const p184 = await loadP184EngineState();
  const p185 = await loadP185RunnerState();
  const storage = getP185StorageHealth();
  const dataDir = path.resolve(p185DataDir());

  base.gates.p184EnabledForLive = p184.config.enabled === true;
  base.gates.p184ModeLive = p184.config.mode === "live";
  base.gates.killSwitchInactive = !p185.safety.killSwitch;
  // Also honor P185.3 local kill in caller
  base.gates.circuitBreakerClosed = !p185.circuit.open;
  base.gates.leaseAvailable = !p185.lease || Date.parse(p185.lease.expiresAt) <= Date.now();
  base.gates.durableStorageHealthy = storage.healthy && storage.durable;
  base.gates.durableStorageNotTmp =
    base.gates.durableStorageHealthy && !dataDir.startsWith("/tmp/");

  const storageGate = evaluateProductionStorageGate({ storage });
  base.gates.productionStorageConfirmed = storageGate.approvedForLiveSend;

  const blockers: string[] = [...storageGate.blockers];
  const setup: string[] = [...storageGate.setup];

  if (!base.gates.cronSecretConfigured) {
    blockers.push("CRON_SECRET / P185_CRON_SECRET is not configured.");
    setup.push(
      "Add CRON_SECRET (or P185_CRON_SECRET) to deployment secrets / .env.local — never commit it. Use Authorization: Bearer <secret> for cron.",
    );
  }
  if (!base.gates.productionAutomationEnabled) {
    blockers.push("P185_PRODUCTION_AUTOMATION_ENABLED is not set to 1.");
    setup.push("Set P185_PRODUCTION_AUTOMATION_ENABLED=1 in the production environment after canary authorization.");
  }
  if (!base.gates.durableStorageHealthy || !base.gates.durableStorageNotTmp) {
    blockers.push("Durable storage is unhealthy or ephemeral (/tmp).");
    setup.push(
      "Set P185_DURABLE_DATA_DIR (or SRS_RECRUITING_DATA_DIR) to a durable absolute path (e.g. /mnt/...), never /tmp on serverless.",
    );
  }
  if (!base.gates.dropboxSignConfigured) {
    blockers.push("Dropbox Sign credentials are missing.");
    setup.push("Configure DROPBOX_SIGN_API_KEY in deployment secrets.");
  }
  if (!base.gates.templateConfigured) {
    blockers.push("Required Dropbox Sign template env is missing.");
    setup.push("Configure DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET (and related template IDs).");
  }
  if (!base.gates.killSwitchInactive) {
    blockers.push("Kill switch is active.");
  }
  if (!base.gates.circuitBreakerClosed) {
    blockers.push("Circuit breaker is open.");
  }
  if (!base.gates.leaseAvailable) {
    blockers.push("Execution lease is held by another runner.");
  }

  // Live enablement of P184 is a separate operator step — report but don't require for readiness dry-run
  if (!base.gates.p184EnabledForLive || !base.gates.p184ModeLive) {
    setup.push(
      "When ready for canary: set P184 enabled=true and mode=live via authorized operator control (not via cron body).",
    );
  }

  base.blockers = blockers;
  base.setupInstructions = setup;
  return base;
}

/** All gates required to execute a real canary (including P184 live + auth + authorize flag). */
export function canaryExecutionAllowed(
  gates: P1853GateStatus,
  p1853KillSwitch: boolean,
  p1853CircuitOpen: boolean,
): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!gates.cronSecretConfigured) blockers.push("Cron secret missing.");
  if (!gates.productionAutomationEnabled) blockers.push("Production automation flag off.");
  if (!gates.durableStorageHealthy || !gates.durableStorageNotTmp) {
    blockers.push("Durable storage not ready.");
  }
  if (!gates.productionStorageConfirmed) {
    blockers.push("Production storage not confirmed for live sends.");
  }
  if (!gates.dropboxSignConfigured) blockers.push("Dropbox Sign not configured.");
  if (!gates.templateConfigured) blockers.push("Template not configured.");
  if (!gates.p184EnabledForLive) blockers.push("P184 enabled is false.");
  if (!gates.p184ModeLive) blockers.push("P184 mode is not live.");
  if (!gates.killSwitchInactive || p1853KillSwitch) blockers.push("Kill switch active.");
  if (!gates.circuitBreakerClosed || p1853CircuitOpen) blockers.push("Circuit breaker open.");
  if (!gates.canaryAuthorized) blockers.push("Canary not explicitly authorized.");
  return { ok: blockers.length === 0, blockers };
}
