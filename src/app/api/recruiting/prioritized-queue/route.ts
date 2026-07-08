import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { emptyP156Queue } from "@/lib/app-loading-reliability/api-fallbacks";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import {
  buildPrioritizedQueue,
  parseP156QueueFilters,
} from "@/lib/p156-candidate-prioritization";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/prioritized-queue";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_prioritized_queue",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const url = new URL(request.url);
  const filters = parseP156QueueFilters(url);

  const safe = await buildSafeApiResponse({
    label: "Prioritized queue",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const queue = await buildPrioritizedQueue(filters);
      return { queue, warnings: queue.warnings };
    },
    fallback: () => ({ queue: emptyP156Queue(filters), warnings: ["Degraded empty queue"] }),
    mapWarnings: (p) => p.warnings,
  });

  return NextResponse.json({
    ok: true,
    queue: safe.payload.queue,
    warnings: safe.warnings,
    meta: safe.meta,
  });
}
