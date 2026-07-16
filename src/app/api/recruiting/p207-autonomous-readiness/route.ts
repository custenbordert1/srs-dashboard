import { NextResponse } from "next/server";
import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { listIngestedCandidates, readIngestionStore, emptyIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listP2041Recommendations } from "@/lib/p204-1-supervised-qualification-pilot/store";
import { listP2042OperatorDecisions } from "@/lib/p204-2-controlled-recommendation-approval/store";
import { readP192Status } from "@/lib/p192-supervised-paperwork-runner/control";
import {
  advanceQuotaHistory,
  buildP207ReadinessSnapshot,
  filterP207DrillDown,
  loadP207AlertState,
  loadP207DropboxDiagnostics,
  persistP207AlertState,
  type P207AiSignal,
} from "@/lib/p207-autonomous-readiness-dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/recruiting/p207-autonomous-readiness";

/**
 * GET /api/recruiting/p207-autonomous-readiness
 * Read-only autonomous readiness dashboard (P207 / P207.1).
 *
 * Query:
 *   ?stage=… or ?drill=… — read-only drill-down
 *   Cache-Control: no-store (force-dynamic; no stale cache presentation)
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "p207_autonomous_readiness",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const stage = url.searchParams.get("stage")?.trim() ?? "";
  const drill = url.searchParams.get("drill")?.trim() ?? "";
  const drillKey = drill || stage;

  const apiStarted = Date.now();
  let storeAvailable = true;
  let ingestion;
  let workflows: Awaited<ReturnType<typeof getCandidateWorkflowState>>;
  try {
    [ingestion, workflows] = await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowState(),
    ]);
  } catch {
    storeAvailable = false;
    ingestion = emptyIngestionStore();
    workflows = {};
  }

  const [recommendations, decisions, p192, alertState] = await Promise.all([
    listP2041Recommendations().catch(() => []),
    listP2042OperatorDecisions().catch(() => []),
    readP192Status().catch(() => null),
    loadP207AlertState().catch(() => ({
      alerts: [],
      quotaHistory: {
        previousQuota: null,
        lastObservedQuota: null,
        pilotInProgress: false,
        productionSendHealthy: false,
      },
    })),
  ]);

  const aiByCandidateId: Record<string, P207AiSignal> = {};
  for (const r of recommendations) {
    aiByCandidateId[r.candidateId] = {
      recommendation: r.recommendation,
      confidence: typeof r.confidence === "number" ? r.confidence : null,
      operatorDecision: r.operatorDecision ?? null,
    };
  }
  for (const d of decisions) {
    const prev = aiByCandidateId[d.candidateId];
    aiByCandidateId[d.candidateId] = {
      recommendation: d.aiRecommendation ?? prev?.recommendation ?? "Unknown",
      confidence: prev?.confidence ?? null,
      operatorDecision: d.decision ?? prev?.operatorDecision ?? null,
    };
  }

  const dropbox = await loadP207DropboxDiagnostics({
    lastSuccessfulSendAt: p192?.lastCycle?.confirmedSent
      ? p192.lastCycle.finishedAt
      : null,
    lastFailedSendAt:
      p192?.lastCycle && (p192.lastCycle.failed ?? 0) > 0
        ? p192.lastCycle.finishedAt
        : null,
    quotaHistory: alertState.quotaHistory,
  });

  // Never return raw Dropbox account payloads — diagnostics are already redacted.
  const snapshot = buildP207ReadinessSnapshot({
    candidates: listIngestedCandidates(ingestion),
    workflows,
    dropbox,
    aiByCandidateId,
    priorAlerts: alertState.alerts,
    storeAvailable,
    statusSyncOk: dropbox.apiStatus !== "error",
    unresolvedSendOps: 0,
  });

  // Persist alert dedupe + quota history only (local operational state; no lifecycle/MEL/Dropbox writes).
  const nextHistory = advanceQuotaHistory(alertState.quotaHistory, dropbox.productionQuota);
  await persistP207AlertState({
    alerts: snapshot.alerts,
    quotaHistory: nextHistory,
  }).catch(() => undefined);

  const apiMs = Date.now() - apiStarted;

  if (drillKey) {
    return NextResponse.json(
      {
        ok: true,
        phase: "P207.1",
        readOnly: true,
        generatedAt: snapshot.generatedAt,
        freshness: snapshot.freshness,
        drill: drillKey,
        rows: filterP207DrillDown(snapshot, drillKey),
        safety: snapshot.safety,
        authorizedRole: guard.session.role,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      phase: "P207.1",
      readOnly: true,
      message:
        "P207.1 Autonomous Readiness Dashboard — read-only; alerts displayed in-dashboard only; no external notifications.",
      generatedAt: snapshot.generatedAt,
      snapshot,
      performance: {
        ...snapshot.performance,
        apiMs,
      },
      route: ROUTE,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
