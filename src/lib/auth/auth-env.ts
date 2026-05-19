import { loadConfigSync } from "@/lib/config";

export type AuthEnvStatus = {
  hasSessionSecret: boolean;
  hasBreezyApiKey: boolean;
  hasDmDefaultPassword: boolean;
  sessionSecretSource: "SESSION_SECRET" | "BREEZY_API_KEY" | "none";
};

export function getAuthEnvStatus(): AuthEnvStatus {
  const config = loadConfigSync();
  const sessionSecret = readEnv("SESSION_SECRET");
  const breezyKey = config.breezyApiKey;

  let sessionSecretSource: AuthEnvStatus["sessionSecretSource"] = "none";
  if (sessionSecret) sessionSecretSource = "SESSION_SECRET";
  else if (breezyKey) sessionSecretSource = "BREEZY_API_KEY";

  return {
    hasSessionSecret: Boolean(sessionSecret || breezyKey),
    hasBreezyApiKey: Boolean(breezyKey),
    hasDmDefaultPassword: Boolean(config.dmDefaultPassword),
    sessionSecretSource,
  };
}

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

const DEV_SESSION_FALLBACK = "srs-dashboard-dev-session-not-for-production";

export function resolveSessionSecret(): string | null {
  const config = loadConfigSync();
  const sessionSecret = readEnv("SESSION_SECRET");
  if (sessionSecret) return sessionSecret;
  if (config.breezyApiKey) return config.breezyApiKey;
  if (config.nodeEnv === "development") {
    console.warn(
      "[auth] SESSION_SECRET and BREEZY_API_KEY are unset — using development-only session fallback. Add SESSION_SECRET to .env.local.",
    );
    return DEV_SESSION_FALLBACK;
  }
  return null;
}

export function canCreateSessions(): boolean {
  return resolveSessionSecret() !== null;
}

export function getConfiguredDefaultPassword(): string {
  return loadConfigSync().dmDefaultPassword;
}
