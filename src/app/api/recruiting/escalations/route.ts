import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { listRecruiterEscalations } from "@/lib/operational-escalation/operational-escalation-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    auditAction: "recruiter_escalations_read",
  });
  if (isGuardFailure(guard)) return guard;

  const items = await listRecruiterEscalations();
  return NextResponse.json({ ok: true, items });
}
