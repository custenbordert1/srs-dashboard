import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  loadP76FeatureFlags,
  saveP76FeatureFlags,
} from "@/lib/autonomous-decision-engine/feature-flags-store";
import type { DecisionExecutionMode, P76FeatureFlags } from "@/lib/autonomous-decision-engine/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseExecutionMode(value: unknown): DecisionExecutionMode | null {
  if (value === "off" || value === "preview" || value === "pilot" || value === "production") {
    return value;
  }
  return null;
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: false,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const flags = await loadP76FeatureFlags();
  return NextResponse.json({ ok: true, previewMode: true, flags });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: false,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as Partial<P76FeatureFlags>;
  const current = await loadP76FeatureFlags();
  const executionMode = parseExecutionMode(body.executionMode) ?? current.executionMode;

  const saved = await saveP76FeatureFlags({
    ...current,
    decisionEngineEnabled: body.decisionEngineEnabled ?? current.decisionEngineEnabled,
    executionMode,
    previewMode: body.previewMode ?? current.previewMode,
    updatedAt: current.updatedAt,
  });

  return NextResponse.json({
    ok: true,
    previewMode: true,
    flags: saved,
    warnings: ["Flags saved — decision engine recommends only, no production execution from this endpoint."],
  });
}
