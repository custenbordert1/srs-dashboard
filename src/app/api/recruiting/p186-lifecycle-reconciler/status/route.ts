import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildConflictDashboard,
  buildWriterInventoryReport,
  readP1864Flags,
  P186_4_SOURCE_PHASE,
} from "@/lib/p186-4-lifecycle-reconciler";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/recruiting/p186-lifecycle-reconciler/status";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "p186_lifecycle_reconciler_status",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const flags = readP1864Flags();
  if (!flags.conflictDashboard && !flags.writerInventoryReport) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      sourcePhase: P186_4_SOURCE_PHASE,
      message: "P186.4 conflict dashboard / inventory flags are off",
      flags,
    });
  }

  const dashboard = buildConflictDashboard({
    forceFlags: {
      writerInventoryReport: flags.writerInventoryReport || flags.conflictDashboard,
      conflictDashboard: flags.conflictDashboard,
      reconcilerExecution: flags.reconcilerExecution,
      schedulerCollisionAnalysis: flags.schedulerCollisionAnalysis,
    },
  });

  const inventory = buildWriterInventoryReport(true);

  return NextResponse.json({
    ok: true,
    enabled: true,
    sourcePhase: P186_4_SOURCE_PHASE,
    readOnly: true,
    dashboard,
    inventorySummary: {
      total: inventory.writers.length,
      authoritative: inventory.writers.filter((w) => w.productionAuthoritative).length,
      shadow: inventory.writers.filter((w) => w.shadowOnly).length,
    },
    // Safety walls — always asserted
    safety: {
      productionMutations: 0,
      paperworkSends: 0,
      melWrites: 0,
      writersDisabled: 0,
      schedulerEnabled: false,
      p186Authoritative: false,
    },
  });
}
