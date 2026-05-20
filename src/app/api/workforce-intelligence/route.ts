import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { getActiveRepStoreMeta, mergeImportedReps } from "@/lib/active-rep-store";
import { buildWorkforceImportStats, parseWorkforceCleanCsv } from "@/lib/workforce-intelligence/workforce-csv-import";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function executiveOnly(guard: ReturnType<typeof guardApiRoute>) {
  if (isGuardFailure(guard)) return guard;
  if (guard.session.role !== "executive") {
    return NextResponse.json({ ok: false, error: "Executive access required" }, { status: 403 });
  }
  return guard;
}

/** GET current workforce store metadata + metrics (no CSV in response). */
export async function GET(request: Request) {
  const guard = executiveOnly(
    guardApiRoute(request, { allowedRoles: ["executive"], auditAction: "workforce_intelligence_read" }),
  );
  if (guard instanceof NextResponse) return guard;

  const meta = await getActiveRepStoreMeta();
  const stats = buildWorkforceImportStats([
    ...meta.activeRoster,
    ...meta.inactiveArchive,
    ...meta.terminatedArchive,
  ]);

  return NextResponse.json({
    ok: true,
    meta: {
      importedAt: meta.importedAt,
      importedBy: meta.importedBy ?? null,
      source: meta.source ?? null,
      activeRosterCount: meta.activeRoster.length,
      inactiveArchiveCount: meta.inactiveArchive.length,
      terminatedArchiveCount: meta.terminatedArchive.length,
      repCount: meta.activeRoster.length,
    },
    stats,
    lastImportSummary: meta.lastImportSummary ?? stats.importSummary,
  });
}

/** POST preview parse only — does not persist. */
export async function POST(request: Request) {
  const guard = executiveOnly(guardApiRoute(request, { allowedRoles: ["executive"] }));
  if (guard instanceof NextResponse) return guard;

  let body: { csv?: string; action?: string; mode?: "replace" | "merge" };
  try {
    body = (await request.json()) as { csv?: string; action?: string; mode?: "replace" | "merge" };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    return NextResponse.json({ ok: false, error: "csv field is required." }, { status: 400 });
  }

  if (body.action === "import") {
    const parsed = parseWorkforceCleanCsv(csv);
    if (parsed.reps.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No valid rows to import.", errors: parsed.errors },
        { status: 400 },
      );
    }
    const mode = body.mode === "merge" ? "merge" : "replace";
    const stored = await mergeImportedReps(parsed.reps, mode, guard.session.email);

    auditFromSession(guard.session, {
      action: "api_access",
      entityType: "system",
      entityId: "workforce_csv_import",
      metadata: { mode, count: parsed.reps.length },
    });

    const allStored = [
      ...stored.activeRoster,
      ...stored.inactiveArchive,
      ...stored.terminatedArchive,
    ];
    return NextResponse.json({
      ok: true,
      importedCount: parsed.reps.length,
      activeImported: stored.lastImportSummary?.activeImported ?? stored.activeRoster.length,
      inactiveArchived: stored.lastImportSummary?.inactiveArchived ?? stored.inactiveArchive.length,
      terminatedArchived: stored.lastImportSummary?.terminatedArchived ?? stored.terminatedArchive.length,
      activeRosterCount: stored.activeRoster.length,
      totalReps: stored.activeRoster.length,
      importedAt: stored.importedAt,
      importedBy: stored.importedBy,
      stats: buildWorkforceImportStats(allStored),
      lastImportSummary: stored.lastImportSummary,
      errors: parsed.errors,
    });
  }

  const preview = parseWorkforceCleanCsv(csv);
  return NextResponse.json({
    ok: preview.ok,
    previewRows: preview.previewRows,
    stats: preview.stats,
    errors: preview.errors,
    validRowCount: preview.reps.length,
  });
}
