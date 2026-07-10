import { access } from "node:fs/promises";
import path from "node:path";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import type { P160DeploymentChecklistSection } from "@/lib/p160-production-readiness/types";
import { aggregateLevel, checklistScore } from "@/lib/p160-production-readiness/scoring";

function envConfigured(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(process.cwd(), relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function buildP160DeploymentChecklist(): Promise<P160DeploymentChecklistSection> {
  const hasNodeModules = await fileExists("node_modules");
  const hasBuild = await fileExists(".next/BUILD_ID");
  const hasEnvExample = await fileExists(".env.local.example");
  const envReady =
    envConfigured("BREEZY_API_KEY") && envConfigured("DROPBOX_SIGN_API_KEY");

  const items = [
    {
      id: "clone",
      step: "Clone repository on company server",
      status: "pending" as const,
      detail: "git clone + checkout deployment branch.",
    },
    {
      id: "install",
      step: "npm install",
      status: hasNodeModules ? ("complete" as const) : ("pending" as const),
      detail: hasNodeModules ? "node_modules present locally." : "Run npm install on server.",
    },
    {
      id: "build",
      step: "npm run build",
      status: hasBuild ? ("complete" as const) : ("pending" as const),
      detail: hasBuild ? ".next/BUILD_ID present." : "Run npm run build before start.",
    },
    {
      id: "env",
      step: "Configure environment variables (.env.local)",
      status: envReady ? ("complete" as const) : ("partial" as const),
      detail: envReady
        ? "Required secrets configured in current environment."
        : "Copy .env.local.example and set BREEZY_API_KEY, DROPBOX_SIGN_API_KEY, SESSION_SECRET.",
    },
    {
      id: "pm2",
      step: "PM2/systemd configuration",
      status: "pending" as const,
      detail: "Configure process manager for next start + p154.7-continuous-runner --daemon (when approved).",
    },
    {
      id: "continuous",
      step: "Continuous runner setup",
      status: isP154ContinuousEnabled() ? ("partial" as const) : ("pending" as const),
      detail: isP154ContinuousEnabled()
        ? "P154_CONTINUOUS_ENABLED=true — deploy daemon with monitoring."
        : "Intentionally disabled — enable only after observation period.",
    },
    {
      id: "health",
      step: "Health endpoints",
      status: "complete" as const,
      detail:
        "GET /api/recruiting/production-readiness, /api/recruiting/operations-control-center, /api/recruiting/autopilot/status.",
    },
    {
      id: "verify",
      step: "Post-deploy verification",
      status: hasEnvExample ? ("partial" as const) : ("pending" as const),
      detail:
        "Run npx tsx scripts/p159-operations-control-center.ts and p160-production-readiness.ts; confirm dry cycle.",
    },
  ];

  const score = checklistScore(items);
  const overall =
    score >= 85 ? "ready" : score >= 60 ? "warning" : ("blocked" as const);

  return { overall, items };
}
