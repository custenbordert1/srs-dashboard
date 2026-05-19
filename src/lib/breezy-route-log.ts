import { hasBreezyApiKey, loadConfig } from "@/lib/config";
import type { AuthSession } from "@/lib/auth/types";

export type BreezyRouteLogContext = {
  route: string;
  role: AuthSession["role"] | "anonymous";
  breezyKeyExists: boolean;
  hasSessionSecret: boolean;
  hasDmDefaultPassword: boolean;
};

export async function logBreezyRouteStart(
  route: string,
  session: AuthSession | null,
): Promise<BreezyRouteLogContext> {
  const config = await loadConfig();
  const ctx: BreezyRouteLogContext = {
    route,
    role: session?.role ?? "anonymous",
    breezyKeyExists: config.breezyApiKey.length > 0,
    hasSessionSecret: Boolean(config.sessionSecret),
    hasDmDefaultPassword: Boolean(config.dmDefaultPassword),
  };
  console.info("[breezy-route] loaded", ctx);
  return ctx;
}

export function logBreezyRouteResult(
  route: string,
  status: number,
  details: Record<string, unknown>,
): void {
  console.info("[breezy-route] response", { route, status, ...details });
}

export async function assertBreezyConfigured(route: string): Promise<
  | { ok: true }
  | { ok: false; error: string; status: number }
> {
  const exists = await hasBreezyApiKey();
  if (!exists) {
    logBreezyRouteResult(route, 503, { breezyKeyExists: false, error: "missing_api_key" });
    return {
      ok: false,
      status: 503,
      error:
        "Breezy API key is not configured. Set BREEZY_API_KEY in .env.local and restart the dev server.",
    };
  }
  return { ok: true };
}
