import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { formatP175Markdown } from "@/lib/p175-breezy-export-import/format-report";
import { runBreezyExportImport } from "@/lib/p175-breezy-export-import/execute-export-import";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/breezy-export-import";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    auditAction: "read",
  });
  if (isGuardFailure(guard)) return guard;

  const plan = await runBreezyExportImport({
    confirmImport: false,
    byUserId: guard.session.userId,
  });

  return NextResponse.json({
    ok: true,
    dryRun: true,
    plan,
    markdown: formatP175Markdown(plan),
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    auditAction: "write",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  let body: { confirmImport?: boolean; workbookPath?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // optional body
  }

  const confirmImport =
    body.confirmImport === true ||
    url.searchParams.get("confirmImport") === "true" ||
    url.searchParams.get("confirmImport") === "1";

  if (!confirmImport) {
    return NextResponse.json(
      {
        ok: false,
        error: "Controlled import requires confirmImport=true in the request body or query string.",
        route: ROUTE,
      },
      { status: 400 },
    );
  }

  const result = await runBreezyExportImport({
    confirmImport: true,
    workbookPath: body.workbookPath,
    byUserId: guard.session.userId,
  });

  return NextResponse.json({
    ok: result.ok,
    imported: result.imported,
    added: result.added,
    merged: result.merged,
    postIngestionCount: result.postIngestionCount,
    rollbackPath: result.rollbackPath,
    auditEntryId: result.auditEntryId,
    preImport: result.preImport,
    spotlight: result.spotlight,
    markdown: formatP175Markdown(result),
  });
}
