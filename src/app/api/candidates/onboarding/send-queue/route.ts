import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildOnboardingSendQueueMetrics,
  listOnboardingSendAttemptLogs,
  loadOnboardingSendQueueConfig,
  processOnboardingSendQueue,
  saveOnboardingSendQueueConfig,
  startOnboardingSendQueue,
  stopOnboardingSendQueue,
} from "@/lib/candidate-onboarding-send-queue";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const includeLogs = url.searchParams.get("logs") === "1";
  const metrics = await buildOnboardingSendQueueMetrics();
  const logs = includeLogs ? await listOnboardingSendAttemptLogs(100) : undefined;

  return NextResponse.json({ ok: true, metrics, logs });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = typeof body.action === "string" ? body.action.trim() : "process";

  if (action === "start") {
    const result = await startOnboardingSendQueue({
      enqueuePending: body.enqueuePending !== false,
    });
    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: "onboarding_send_queue",
      metadata: { action: "start", enqueued: result.enqueued },
    });
    const metrics = await buildOnboardingSendQueueMetrics();
    return NextResponse.json({ ok: true, ...result, metrics });
  }

  if (action === "stop") {
    const result = await stopOnboardingSendQueue();
    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: "onboarding_send_queue",
      metadata: { action: "stop" },
    });
    const metrics = await buildOnboardingSendQueueMetrics();
    return NextResponse.json({ ok: true, ...result, metrics });
  }

  if (action === "config") {
    const current = await loadOnboardingSendQueueConfig();
    const next = {
      ...current,
      ...(typeof body.maxConcurrentSends === "number" ? { maxConcurrentSends: body.maxConcurrentSends } : {}),
      ...(typeof body.batchSize === "number" ? { batchSize: body.batchSize } : {}),
      ...(typeof body.delayBetweenSendsMs === "number"
        ? { delayBetweenSendsMs: body.delayBetweenSendsMs }
        : {}),
      ...(typeof body.delayBetweenBatchesMs === "number"
        ? { delayBetweenBatchesMs: body.delayBetweenBatchesMs }
        : {}),
      ...(typeof body.maxRetries === "number" ? { maxRetries: body.maxRetries } : {}),
      ...(typeof body.retryBackoffBaseMs === "number"
        ? { retryBackoffBaseMs: body.retryBackoffBaseMs }
        : {}),
    };
    const saved = await saveOnboardingSendQueueConfig(next);
    return NextResponse.json({ ok: true, config: saved });
  }

  const result = await processOnboardingSendQueue({
    force: body.force === true,
    enqueuePending: body.enqueuePending === true,
    byUserId: session.userId,
  });

  if (result.processed > 0) {
    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: "onboarding_send_queue",
      metadata: {
        action: "tick",
        processed: result.processed,
        sent: result.sent,
        retryScheduled: result.retryScheduled,
        failed: result.failed,
      },
    });
  }

  return NextResponse.json({ ok: true, ...result });
}
