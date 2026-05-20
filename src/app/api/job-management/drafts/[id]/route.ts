import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { getJobDraft, updateJobDraft } from "@/lib/job-management/job-draft-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "job_draft_read",
  });
  if (isGuardFailure(guard)) return guard;

  const { id } = await context.params;
  const draft = await getJobDraft(id);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "Draft not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, draft });
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "job_draft_update",
  });
  if (isGuardFailure(guard)) return guard;

  const { id } = await context.params;
  let body: Partial<{
    title: string;
    description: string;
    city: string;
    usState: string;
    payRate: string;
    department: string;
    source: string;
  }>;

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const updated = await updateJobDraft(id, body);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Draft not found." }, { status: 404 });
  }
  if (updated.status !== "draft") {
    return NextResponse.json(
      { ok: false, error: "Only draft-status jobs can be edited." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, draft: updated });
}
