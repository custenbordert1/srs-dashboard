import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  loadP74FeatureFlags,
  saveP74FeatureFlags,
} from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import type { OrchestratorExecutionMode, P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseExecutionMode(value: unknown): OrchestratorExecutionMode | null {
  if (value === "off" || value === "preview" || value === "pilot" || value === "production") {
    return value;
  }
  return null;
}

/**
 * GET /api/autonomous-recruiting-orchestrator/controls — read P74 flags
 * POST /api/autonomous-recruiting-orchestrator/controls — update flags (no execution)
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: false,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const flags = await loadP74FeatureFlags();
  return NextResponse.json({ ok: true, previewMode: true, flags });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: false,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as Partial<P74FeatureFlags>;
  const current = await loadP74FeatureFlags();
  const executionMode = parseExecutionMode(body.executionMode) ?? current.executionMode;

  const saved = await saveP74FeatureFlags({
    ...current,
    orchestratorEnabled: body.orchestratorEnabled ?? current.orchestratorEnabled,
    executionMode,
    previewMode: body.previewMode ?? current.previewMode,
    updatedAt: current.updatedAt,
  });

  return NextResponse.json({
    ok: true,
    previewMode: true,
    flags: saved,
    warnings: [
      "Flags saved — orchestrator coordinates engines in preview only from this endpoint.",
      "Production execution requires P74_ORCHESTRATOR_ENABLED, execution mode production, and previewMode disabled.",
    ],
  });
}
