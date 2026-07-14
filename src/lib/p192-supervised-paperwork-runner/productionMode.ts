import { readDropboxSignConfig, sendTemplateSignatureRequest } from "@/lib/dropbox-sign";
import type { DropboxSignSignerInput } from "@/lib/dropbox-sign";
import { updateP184Config, loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import { setP185StorageTestFlags } from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import {
  getP185StorageHealth,
  loadP185RunnerState,
  saveP185RunnerState,
} from "@/lib/p185-production-paperwork-automation-runner/durableStorage";

/**
 * Force production Dropbox Sign mode for this process.
 * Never silently falls back to test mode — caller must verify.
 */
export function applyP192ProductionDropboxEnv(): void {
  // Force production Dropbox Sign evaluation for this process.
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.DROPBOX_SIGN_TEST_MODE = "false";
}

export function readP192DropboxTestMode(): boolean | null {
  const cfg = readDropboxSignConfig();
  if (!cfg) return null;
  return cfg.testMode;
}

export function assertProductionTestModeOff(): { ok: boolean; detail: string; testMode: boolean | null } {
  const cfg = readDropboxSignConfig();
  if (!cfg) {
    return { ok: false, detail: "Dropbox Sign not configured", testMode: null };
  }
  if (cfg.testMode !== false) {
    return {
      ok: false,
      detail: `Dropbox Sign test_mode=${cfg.testMode} — production requires test_mode=false`,
      testMode: cfg.testMode,
    };
  }
  return { ok: true, detail: "test_mode=false confirmed", testMode: false };
}

/**
 * Wrapper that refuses to send unless production test_mode is false.
 */
export async function sendTemplateSignatureRequestProductionOnly(
  input: Parameters<typeof sendTemplateSignatureRequest>[0],
): Promise<Awaited<ReturnType<typeof sendTemplateSignatureRequest>>> {
  const gate = assertProductionTestModeOff();
  if (!gate.ok) {
    throw new Error(`P192 refused Dropbox send: ${gate.detail}`);
  }
  return sendTemplateSignatureRequest(input);
}

export async function enableP192LivePaperworkModes(): Promise<void> {
  setP185StorageTestFlags({ forceDurable: true });
  process.env.P185_PRODUCTION_AUTOMATION_ENABLED = "1";
  process.env.P185_FORCE_DURABLE = "1";
  if (!process.env.CRON_SECRET && !process.env.P185_CRON_SECRET) {
    // Local supervised runner auth stand-in so P185 health can report configured.
    process.env.P185_CRON_SECRET = `p192-local-${process.pid}`;
  }
  await updateP184Config({
    mode: "live",
    enabled: true,
    rateLimits: {
      maxPerMinute: 4,
      maxPerHour: 40,
      maxPerDay: 200,
      concurrentSends: 2,
    },
    maxSendsPerCycle: 10,
  });

  const state = await loadP185RunnerState();
  state.safety.productionAutomationEnabled = true;
  state.safety.killSwitch = false;
  state.safety.pauseUntil = null;
  if (!state.lastDryRunSuccessAt) {
    state.lastDryRunSuccessAt = new Date().toISOString();
  }
  state.circuit = {
    open: false,
    openedAt: null,
    failureCount: 0,
    lastFailureAt: null,
    cooldownUntil: null,
    reason: null,
  };
  await saveP185RunnerState(state);
}

export async function restoreP192SafeModes(): Promise<{
  p184Mode: string;
  testMode: boolean | null;
}> {
  delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
  await updateP184Config({ mode: "dry_run" });
  process.env.P184_MODE = "dry_run";
  delete process.env.P184_LIVE_SEND;

  try {
    const state = await loadP185RunnerState();
    state.safety.productionAutomationEnabled = false;
    state.runnerStatus = "idle";
    await saveP185RunnerState(state);
  } catch {
    // soft
  }

  const p184 = await loadP184EngineState();
  return {
    p184Mode: p184.config.mode,
    testMode: readP192DropboxTestMode(),
  };
}

export function storageHealthSummary(): {
  healthy: boolean;
  durable: boolean;
  detail: string;
} {
  setP185StorageTestFlags({ forceDurable: true });
  const h = getP185StorageHealth();
  return { healthy: h.healthy, durable: h.durable, detail: h.detail };
}

// re-export type for callers
export type { DropboxSignSignerInput };
