import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildRoutePlan } from "@/lib/coverage-optimization";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "coverage_optimization_route_plan",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as { opportunityIds?: string[] };
  const opportunityIds = Array.isArray(body.opportunityIds)
    ? body.opportunityIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (opportunityIds.length === 0) {
    return NextResponse.json({ ok: false, error: "opportunityIds required" }, { status: 400 });
  }

  const melResult = await fetchMelProjectsSheet();
  if (!melResult.ok) {
    return NextResponse.json({ ok: false, error: melResult.error }, { status: 503 });
  }

  const opportunities = parseMelOpportunities(melResult.rows);
  const plan = buildRoutePlan(opportunityIds, opportunities);
  if (!plan) {
    return NextResponse.json({ ok: false, error: "No matching opportunities" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, plan });
}
