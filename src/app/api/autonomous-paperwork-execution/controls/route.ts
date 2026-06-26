import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  DEFAULT_P71_FEATURE_FLAGS,
  loadP71FeatureFlags,
  saveP71FeatureFlags,
} from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import type { P71FeatureFlags, PaperworkExecutionMode } from "@/lib/autonomous-paperwork-execution-engine/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseExecutionMode(value: unknown): PaperworkExecutionMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "off" || normalized === "preview" || normalized === "pilot" || normalized === "production") {
    return normalized;
  }
  return null;
}

function parseStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

/**
 * GET — read automation control flags (no execution).
 * POST — update flags only; never triggers Dropbox Sign or live sends from this route.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const flags = await loadP71FeatureFlags();
  return NextResponse.json({
    ok: true,
    previewMode: true,
    flags,
    defaults: DEFAULT_P71_FEATURE_FLAGS,
    warnings: [
      "Automation OFF and execution mode Preview by default.",
      "Production sends require automation, production mode, and P71_DROPBOX_EXECUTION.",
    ],
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const current = await loadP71FeatureFlags();
  const next: P71FeatureFlags = { ...current };

  if (typeof body.automationEnabled === "boolean") next.automationEnabled = body.automationEnabled;
  const mode = parseExecutionMode(body.executionMode);
  if (mode) next.executionMode = mode;
  if (typeof body.dropboxExecution === "boolean") next.dropboxExecution = body.dropboxExecution;

  const recruiterList = parseStringList(body.pilotRecruiters);
  if (recruiterList) next.pilotRecruiters = recruiterList;
  const dmList = parseStringList(body.pilotDistrictManagers);
  if (dmList) next.pilotDistrictManagers = dmList;
  const marketList = parseStringList(body.pilotMarkets);
  if (marketList) next.pilotMarkets = marketList;
  const stateList = parseStringList(body.pilotStates);
  if (stateList) next.pilotStates = stateList;
  const clientList = parseStringList(body.pilotClients);
  if (clientList) next.pilotClients = clientList;
  const projectList = parseStringList(body.pilotProjects);
  if (projectList) next.pilotProjects = projectList;
  const territoryList = parseStringList(body.pilotTerritories);
  if (territoryList) next.pilotTerritories = territoryList;

  const saved = await saveP71FeatureFlags(next);

  return NextResponse.json({
    ok: true,
    flags: saved,
    warnings: [
      "Flag update saved — no packets sent from this endpoint.",
      saved.dropboxExecution && saved.executionMode === "production"
        ? "Production execution flags enabled — verify safeguards before enabling automation."
        : "Execution remains in safe preview/disabled mode.",
    ],
  });
}
