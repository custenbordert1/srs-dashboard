import { connection } from "next/server";

export type AppConfig = {
  breezyApiKey: string;
  breezyCompanyId: string;
  sessionSecret: string;
  dmDefaultPassword: string;
  nodeEnv: string;
};

let cachedConfig: AppConfig | null = null;
let configLoadedAt = 0;
const CONFIG_TTL_MS = 5_000;

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBreezyApiKey(raw: string): string {
  const key = raw.trim();
  const normalized = key.toLowerCase();
  if (
    !key ||
    normalized === "your-breezy-access-token" ||
    normalized === "your-breezy-api-key" ||
    normalized === "placeholder"
  ) {
    return "";
  }
  return key;
}

function buildConfigFromEnv(): AppConfig {
  const sessionSecret =
    readEnv("SESSION_SECRET") || readEnv("BREEZY_API_KEY") || "";

  return {
    breezyApiKey: normalizeBreezyApiKey(readEnv("BREEZY_API_KEY")),
    breezyCompanyId: readEnv("BREEZY_COMPANY_ID"),
    sessionSecret,
    dmDefaultPassword: readEnv("DM_DEFAULT_PASSWORD") || "SRS-Dashboard-2026!",
    nodeEnv: readEnv("NODE_ENV") || "development",
  };
}

/**
 * Loads server env at request time (Next.js 16 runtime env pattern).
 * Cached briefly per process to avoid repeated connection() overhead.
 */
export async function loadConfig(): Promise<AppConfig> {
  const now = Date.now();
  if (cachedConfig && now - configLoadedAt < CONFIG_TTL_MS) {
    return cachedConfig;
  }

  await connection();
  cachedConfig = buildConfigFromEnv();
  configLoadedAt = now;
  return cachedConfig;
}

export function loadConfigSync(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = buildConfigFromEnv();
    configLoadedAt = Date.now();
  }
  return cachedConfig;
}

export function invalidateConfigCache(): void {
  cachedConfig = null;
  configLoadedAt = 0;
}

export async function hasBreezyApiKey(): Promise<boolean> {
  const config = await loadConfig();
  return config.breezyApiKey.length > 0;
}

export async function getBreezyApiKey(): Promise<string | undefined> {
  const config = await loadConfig();
  return config.breezyApiKey || undefined;
}

export function getBreezyApiKeySync(): string | undefined {
  const key = loadConfigSync().breezyApiKey;
  return key || undefined;
}

export function getBreezyCompanyIdSync(): string | undefined {
  const id = loadConfigSync().breezyCompanyId;
  return id || undefined;
}
