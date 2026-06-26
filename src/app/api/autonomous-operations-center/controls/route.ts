import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  loadP75FeatureFlags,
  saveP75FeatureFlags,
} from "@/lib/autonomous-operations-center/feature-flags-store";
import type { OperationsExecutionMode, P75FeatureFlags } from "@/lib/autonomous-operations-center/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseExecutionMode(value: unknown): OperationsExecutionMode | null {
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

  const flags = await loadP75FeatureFlags();
  return NextResponse.json({ ok: true, previewMode: true, flags });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: false,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as Partial<P75FeatureFlags>;
  const current = await loadP75FeatureFlags();
  const executionMode = parseExecutionMode(body.executionMode) ?? current.executionMode;

  const saved = await saveP75FeatureFlags({
    ...current,
    operationsCenterEnabled: body.operationsCenterEnabled ?? current.operationsCenterEnabled,
    executionMode,
    previewMode: body.previewMode ?? current.previewMode,
    updatedAt: current.updatedAt,
  });

  return NextResponse.json({
    ok: true,
    previewMode: true,
    flags: saved,
    warnings: ["Flags saved — operations center detects only, no production execution from this endpoint."],
  });
}
