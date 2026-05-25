import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  subscribeWorkflowRealtime,
  type WorkflowRealtimePayload,
} from "@/lib/workflow-realtime-push";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function encodeSse(data: WorkflowRealtimePayload): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workflows_events_stream",
  });
  if (isGuardFailure(guard)) return guard;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: WorkflowRealtimePayload) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeSse(payload)));
      };

      controller.enqueue(encoder.encode(": connected\n\n"));
      unsubscribe = subscribeWorkflowRealtime(send);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
