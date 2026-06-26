import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  loadP77FeatureFlags,
  saveP77FeatureFlags,
} from "@/lib/autonomous-approval-governance/feature-flags-store";
import type { GovernanceExecutionMode, P77FeatureFlags } from "@/lib/autonomous-approval-governance/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseExecutionMode(value: unknown): GovernanceExecutionMode | null {
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

  const flags = await loadP77FeatureFlags();
  return NextResponse.json({ ok: true, previewMode: true, flags });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: false,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as Partial<P77FeatureFlags>;
  const current = await loadP77FeatureFlags();
  const executionMode = parseExecutionMode(body.executionMode) ?? current.executionMode;

  const saved = await saveP77FeatureFlags({
    ...current,
    governanceEnabled: body.governanceEnabled ?? current.governanceEnabled,
    executionMode,
    previewMode: body.previewMode ?? current.previewMode,
    updatedAt: current.updatedAt,
  });

  return NextResponse.json({
    ok: true,
    previewMode: true,
    flags: saved,
    warnings: ["Flags saved — governance evaluates only, no approval mutations or execution."],
  });
}
