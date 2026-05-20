import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { blockMelWriteRoute } from "@/lib/security/read-only";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "mel_projects_read",
  });
  if (isGuardFailure(guard)) return guard;

  const data = await fetchMelProjectsSheet();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
    },
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
  });
  if (isGuardFailure(guard)) return guard;
  return blockMelWriteRoute(request, guard.session) ?? NextResponse.json({ ok: false }, { status: 405 });
}

export async function PATCH(request: Request) {
  return POST(request);
}

export async function DELETE(request: Request) {
  return POST(request);
}
