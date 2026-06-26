import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  loadP73FeatureFlags,
  saveP73FeatureFlags,
} from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import type { CommunicationExecutionMode, P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseExecutionMode(value: unknown): CommunicationExecutionMode | null {
  if (value === "off" || value === "preview" || value === "pilot" || value === "production") {
    return value;
  }
  return null;
}

/**
 * GET /api/autonomous-candidate-communication/controls — read P73 flags
 * POST /api/autonomous-candidate-communication/controls — update flags (no communication execution)
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: false,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const flags = await loadP73FeatureFlags();
  return NextResponse.json({ ok: true, previewMode: true, flags });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: false,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as Partial<P73FeatureFlags>;
  const current = await loadP73FeatureFlags();

  const executionMode = parseExecutionMode(body.executionMode) ?? current.executionMode;

  const saved = await saveP73FeatureFlags({
    ...current,
    communicationEnabled: body.communicationEnabled ?? current.communicationEnabled,
    executionMode,
    emailEnabled: body.emailEnabled ?? current.emailEnabled,
    smsEnabled: body.smsEnabled ?? current.smsEnabled,
    pilotRecruiters: body.pilotRecruiters ?? current.pilotRecruiters,
    pilotDistrictManagers: body.pilotDistrictManagers ?? current.pilotDistrictManagers,
    pilotTerritories: body.pilotTerritories ?? current.pilotTerritories,
    pilotMarkets: body.pilotMarkets ?? current.pilotMarkets,
    pilotStates: body.pilotStates ?? current.pilotStates,
    pilotClients: body.pilotClients ?? current.pilotClients,
    pilotProjects: body.pilotProjects ?? current.pilotProjects,
    updatedAt: current.updatedAt,
  });

  return NextResponse.json({
    ok: true,
    previewMode: true,
    flags: saved,
    warnings: [
      "Flags saved — no live email or SMS delivery from this endpoint.",
      "Production communication requires P73_COMMUNICATION_ENABLED, execution mode production, and channel flags.",
    ],
  });
}
