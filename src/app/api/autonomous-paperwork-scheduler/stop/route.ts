import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { stopScheduler } from "@/lib/p136-autonomous-paperwork-scheduler";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, { allowedRoles: ["executive"], auditAction: "recruiting_intelligence" });
  if (isGuardFailure(guard)) return guard;
  const state = await stopScheduler();
  return NextResponse.json({ ok: true, schedulerStatus: state.schedulerStatus, schedulerMode: state.schedulerMode });
}
