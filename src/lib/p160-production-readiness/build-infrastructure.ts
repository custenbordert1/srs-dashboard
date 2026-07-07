import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { P160InfrastructureSection, P160CheckItem } from "@/lib/p160-production-readiness/types";
import { aggregateLevel } from "@/lib/p160-production-readiness/scoring";

const REQUIRED_ENV_VARS = [
  { id: "breezy_api_key", label: "BREEZY_API_KEY", required: true },
  { id: "dropbox_sign_api_key", label: "DROPBOX_SIGN_API_KEY", required: true },
  { id: "session_secret", label: "SESSION_SECRET or BREEZY_API_KEY (auth)", required: true },
] as const;

const OPTIONAL_ENV_VARS = [
  { id: "p154_controlled_autopilot", label: "P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED", required: false },
  { id: "p154_continuous", label: "P154_CONTINUOUS_ENABLED", required: false },
  { id: "p151_advancement", label: "P151_AUTONOMOUS_ADVANCEMENT_ENABLED", required: false },
  { id: "p152_immediate", label: "P152_IMMEDIATE_PAPERWORK_ENABLED", required: false },
  { id: "p158_assignments", label: "P158_AUTOMATIC_ASSIGNMENTS_ENABLED", required: false },
  { id: "p158_transition", label: "P158_WORKFLOW_TRANSITION_ENABLED", required: false },
  { id: "srs_recruiting_data_dir", label: "SRS_RECRUITING_DATA_DIR", required: false },
] as const;

function envConfigured(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

function checkEnv(id: string, label: string, required: boolean): P160CheckItem {
  const key = label.split(" ")[0];
  const configured = envConfigured(key) || (id === "session_secret" && envConfigured("BREEZY_API_KEY"));
  if (!configured && required) {
    return { id, label, status: "blocked", detail: `${label} not configured.` };
  }
  if (!configured) {
    return { id, label, status: "warning", detail: `${label} not set (optional).` };
  }
  const value = process.env[key] ?? (id === "session_secret" ? process.env.BREEZY_API_KEY : "");
  const display = key.includes("KEY") || key.includes("SECRET") ? "configured" : value;
  return { id, label, status: "ready", detail: `${label}: ${display}.` };
}

function parseNodeMajor(version: string): number {
  const match = /^v(\d+)/.exec(version);
  return match ? Number.parseInt(match[1], 10) : 0;
}

async function detectBuildStatus(): Promise<{ level: "ready" | "warning" | "blocked"; detail: string }> {
  try {
    const buildIdPath = path.join(process.cwd(), ".next", "BUILD_ID");
    const buildId = await readFile(buildIdPath, "utf8");
    return {
      level: "ready",
      detail: `Production build present (BUILD_ID ${buildId.trim()}).`,
    };
  } catch {
    return {
      level: "warning",
      detail: "No .next/BUILD_ID found — run npm run build before deployment.",
    };
  }
}

async function detectNodeModules(): Promise<boolean> {
  try {
    await access(path.join(process.cwd(), "node_modules"));
    return true;
  } catch {
    return false;
  }
}

export async function buildP160Infrastructure(): Promise<P160InfrastructureSection> {
  const nodeVersion = process.version;
  const nodeMajor = parseNodeMajor(nodeVersion);
  const nodeCompatible = nodeMajor >= 20;
  const build = await detectBuildStatus();
  const hasNodeModules = await detectNodeModules();

  const environmentVariables: P160CheckItem[] = [
    ...REQUIRED_ENV_VARS.map((v) => checkEnv(v.id, v.label, v.required)),
    ...OPTIONAL_ENV_VARS.map((v) => checkEnv(v.id, v.label, v.required)),
  ];

  const secretsConfigured: P160CheckItem[] = [
    {
      id: "breezy",
      label: "Breezy API token",
      status: envConfigured("BREEZY_API_KEY") ? "ready" : "blocked",
      detail: envConfigured("BREEZY_API_KEY") ? "BREEZY_API_KEY configured." : "Missing BREEZY_API_KEY.",
    },
    {
      id: "dropbox_sign",
      label: "Dropbox Sign API key",
      status: envConfigured("DROPBOX_SIGN_API_KEY") ? "ready" : "blocked",
      detail: envConfigured("DROPBOX_SIGN_API_KEY")
        ? "DROPBOX_SIGN_API_KEY configured."
        : "Missing DROPBOX_SIGN_API_KEY.",
    },
    {
      id: "session",
      label: "Session secret",
      status:
        envConfigured("SESSION_SECRET") || envConfigured("BREEZY_API_KEY") ? "ready" : "warning",
      detail:
        envConfigured("SESSION_SECRET") || envConfigured("BREEZY_API_KEY")
          ? "Auth secret available."
          : "Set SESSION_SECRET for production auth.",
    },
  ];

  const runtimeHealth = aggregateLevel([
    nodeCompatible ? "ready" : "blocked",
    hasNodeModules ? "ready" : "warning",
    build.level,
  ]);

  return {
    buildStatus: build.level,
    buildDetail: build.detail,
    nodeVersion,
    nodeCompatible,
    serverCompatibility: nodeCompatible
      ? "Node 20+ compatible with Next.js 16 — suitable for Linux PM2/systemd deployment."
      : "Upgrade Node to v20+ before server deployment.",
    runtimeHealth,
    environmentVariables,
    secretsConfigured,
  };
}
