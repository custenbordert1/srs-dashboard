import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { mergeImportedReps } from "@/lib/active-rep-store";
import {
  parseRepImportCsv,
  REP_IMPORT_CSV_TEMPLATE,
} from "@/lib/rep-intelligence/rep-import";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
  });
  if (isGuardFailure(guard)) return guard;

  const { searchParams } = new URL(request.url);
  if (searchParams.get("download") === "template") {
    auditFromSession(guard.session, {
      action: "export_download",
      entityType: "export",
      entityId: "rep-import-template",
      metadata: { type: "csv_template" },
    });
    return new NextResponse(REP_IMPORT_CSV_TEMPLATE, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="active-rep-import-template.csv"',
      },
    });
  }

  return NextResponse.json({
    ok: true,
    template: REP_IMPORT_CSV_TEMPLATE,
    headers: REP_IMPORT_CSV_TEMPLATE.split("\n")[0]?.split(","),
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  let body: { csv?: string; mode?: "replace" | "merge" };
  try {
    body = (await request.json()) as { csv?: string; mode?: "replace" | "merge" };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    return NextResponse.json({ ok: false, error: "csv field is required." }, { status: 400 });
  }

  const parsed = parseRepImportCsv(csv);
  if (parsed.reps.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No valid rows imported.", errors: parsed.errors },
      { status: 400 },
    );
  }

  const mode = body.mode === "merge" ? "merge" : "replace";
  const stored = await mergeImportedReps(parsed.reps, mode);

  auditFromSession(session, {
    action: "api_access",
    entityType: "system",
    entityId: "rep_import",
    metadata: { importedCount: parsed.importedCount, mode, errors: parsed.errors.length },
  });

  return NextResponse.json({
    ok: true,
    importedCount: parsed.importedCount,
    totalReps: stored.reps.length,
    errors: parsed.errors,
    updatedAt: stored.updatedAt,
  });
}
