import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  appendJobPushAudit,
  getJobDraft,
  updateJobDraft,
} from "@/lib/job-management/job-draft-store";
import { createBreezyPositionFromDraft } from "@/lib/job-management/breezy-position-write";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { auditFromSession } from "@/lib/security/audit-log";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "job_draft_push_breezy",
  });
  if (isGuardFailure(guard)) return guard;

  const breezyCheck = await assertBreezyConfigured("/api/job-management/drafts/push");
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  let body: { confirmed?: boolean };
  try {
    body = (await request.json()) as { confirmed?: boolean };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.confirmed !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "Explicit confirmation required. POST with { confirmed: true } after reviewing the modal.",
      },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const draft = await getJobDraft(id);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "Draft not found." }, { status: 404 });
  }
  if (draft.status !== "draft") {
    return NextResponse.json(
      { ok: false, error: "Only draft-status jobs can be pushed to Breezy." },
      { status: 409 },
    );
  }

  const result = await createBreezyPositionFromDraft(draft);
  const auditId = randomUUID();
  const pushedAt = new Date().toISOString();

  if (!result.ok) {
    await updateJobDraft(id, { status: "push_failed", pushError: result.error });
    await appendJobPushAudit({
      id: auditId,
      draftId: id,
      ok: false,
      error: result.error,
      pushedAt,
      pushedBy: guard.session.email,
      title: draft.title,
      city: draft.city,
      usState: draft.usState,
    });
    auditFromSession(guard.session, {
      action: "api_access",
      entityType: "system",
      entityId: id,
      metadata: { push: "failed", error: result.error, rateLimited: result.rateLimited ?? false },
    });
    return NextResponse.json(
      { ok: false, error: result.error, rateLimited: result.rateLimited ?? false },
      { status: result.rateLimited ? 429 : 502 },
    );
  }

  const updated = await updateJobDraft(id, {
    status: "pushed",
    breezyJobId: result.breezyJobId,
    pushedAt: result.fetchedAt,
    pushError: undefined,
  });

  await appendJobPushAudit({
    id: auditId,
    draftId: id,
    ok: true,
    breezyJobId: result.breezyJobId,
    pushedAt: result.fetchedAt,
    pushedBy: guard.session.email,
    title: draft.title,
    city: draft.city,
    usState: draft.usState,
  });

  auditFromSession(guard.session, {
    action: "api_access",
    entityType: "system",
    entityId: id,
    metadata: { push: "success", breezyJobId: result.breezyJobId },
  });

  return NextResponse.json({
    ok: true,
    draft: updated,
    breezyJobId: result.breezyJobId,
    postedAt: result.fetchedAt,
  });
}
