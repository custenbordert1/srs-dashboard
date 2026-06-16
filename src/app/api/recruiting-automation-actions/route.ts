import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { ExecutiveRouteTimer } from "@/lib/executive-routes/executive-route-profiling";
import { respondExecutiveIntelligenceRoute } from "@/lib/executive-routes/executive-intelligence-route";
import {
  approveAutomation,
  buildAutomationControlCenterSnapshot,
  cancelAutomation,
  executeAutomation,
  getAutomationSafetyMode,
  listAutomationRecords,
  markAutomationCompleted,
  markAutomationFailed,
  previewAutomation,
  submitAutomationForApproval,
  syncAutomationDrafts,
  upsertAutomationRecords,
} from "@/lib/recruiting-automation-actions";
import type { AutomationControlCenterSnapshot } from "@/lib/recruiting-automation-actions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting-automation-actions";

function emptySnapshot(fetchedAt: string): AutomationControlCenterSnapshot {
  return buildAutomationControlCenterSnapshot({
    records: [],
    safetyMode: "requires-approval",
    generatedAt: fetchedAt,
  });
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "dm"],
    auditAction: "recruiting_automation_actions_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const timer = new ExecutiveRouteTimer(ROUTE);
  return respondExecutiveIntelligenceRoute({
    route: ROUTE,
    session,
    request,
    timer,
    bundleOptions: {
      unscopedForAdmin: session.role === "admin" || session.role === "executive",
      scopeRepsToTerritory: session.role === "dm",
    },
    build: async ({ bundle, deferExpensive }) => {
      if (deferExpensive) {
        return {
          snapshot: emptySnapshot(bundle.fetchedAt),
          logExtras: { deferred: true, phase: "automation_control_center" },
        };
      }

      const existing = await listAutomationRecords();
      const synced = syncAutomationDrafts({ bundle, existing, session });
      await upsertAutomationRecords(synced);
      const safetyMode = await getAutomationSafetyMode();
      const snapshot = buildAutomationControlCenterSnapshot({
        records: synced,
        safetyMode,
        generatedAt: bundle.fetchedAt,
      });
      return {
        snapshot,
        logExtras: {
          draftCount: snapshot.summary.draft,
          pendingCount: snapshot.summary.pendingApproval,
          phase: "automation_control_center",
        },
      };
    },
  });
}

type ActionBody = {
  action?:
    | "submit"
    | "approve"
    | "execute"
    | "preview"
    | "cancel"
    | "mark-failed"
    | "mark-completed";
  automationId?: string;
  reason?: string;
};

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "dm"],
    auditAction: "recruiting_automation_actions_write",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const automationId = body.automationId?.trim() ?? "";
  if (!automationId) {
    return NextResponse.json({ ok: false, error: "automationId is required" }, { status: 400 });
  }

  const action = body.action ?? "preview";
  let result: { ok: boolean; record?: unknown; error?: string; preview?: string; adapterMessage?: string };

  switch (action) {
    case "submit":
      result = await submitAutomationForApproval(session, automationId);
      break;
    case "approve":
      result = await approveAutomation(session, automationId);
      break;
    case "execute":
      result = await executeAutomation(session, automationId);
      break;
    case "preview":
      result = await previewAutomation(session, automationId);
      break;
    case "cancel":
      result = await cancelAutomation(session, automationId, body.reason);
      break;
    case "mark-failed":
      result = await markAutomationFailed(session, automationId, body.reason ?? "Marked failed");
      break;
    case "mark-completed":
      result = await markAutomationCompleted(session, automationId);
      break;
    default:
      return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    record: result.record,
    preview: "preview" in result ? result.preview : undefined,
    adapterMessage: "adapterMessage" in result ? result.adapterMessage : undefined,
  });
}
