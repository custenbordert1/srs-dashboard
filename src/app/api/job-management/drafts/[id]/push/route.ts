import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  appendJobPushAudit,
  getJobDraft,
  updateJobDraft,
} from "@/lib/job-management/job-draft-store";
import { validateJobDraftForBreezyPush } from "@/lib/job-management/breezy-position-payload";
import { variantPushBlockReason } from "@/lib/job-management/job-variant-push-guard";
import { normalizeJobDraftLocationPatch } from "@/lib/job-management/normalize-job-location-fields";
import { createBreezyPositionFromDraft } from "@/lib/job-management/breezy-position-write";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { auditFromSession } from "@/lib/security/audit-log";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

type PushBody = {
  confirmed?: boolean;
  title?: string;
  description?: string;
  city?: string;
  usState?: string;
  payRate?: string;
  department?: string;
};

function trimPatch(body: PushBody): Partial<{
  title: string;
  description: string;
  city: string;
  usState: string;
  payRate: string;
  department: string;
}> {
  const patch: Partial<{
    title: string;
    description: string;
    city: string;
    usState: string;
    payRate: string;
    department: string;
  }> = {};
  if (body.title !== undefined) patch.title = body.title.trim();
  if (body.description !== undefined) patch.description = body.description.trim();
  if (body.city !== undefined) patch.city = body.city.trim();
  if (body.usState !== undefined) patch.usState = body.usState.trim();
  if (body.payRate !== undefined) patch.payRate = body.payRate.trim();
  if (body.department !== undefined) patch.department = body.department.trim();
  return patch;
}

export async function POST(request: Request, context: RouteContext) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    auditAction: "job_draft_push_breezy",
  });
  if (isGuardFailure(guard)) return guard;

  const breezyCheck = await assertBreezyConfigured("/api/job-management/drafts/push");
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  let body: PushBody;
  try {
    body = (await request.json()) as PushBody;
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
  const existing = await getJobDraft(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Draft not found." }, { status: 404 });
  }
  if (existing.status !== "draft") {
    return NextResponse.json(
      { ok: false, error: "Only draft-status jobs can be pushed to Breezy." },
      { status: 409 },
    );
  }

  const variantBlock = variantPushBlockReason(existing);
  if (variantBlock) {
    return NextResponse.json({ ok: false, error: variantBlock }, { status: 409 });
  }

  const patch = normalizeJobDraftLocationPatch(trimPatch(body));
  if (Object.keys(patch).length > 0) {
    await updateJobDraft(id, patch);
  }

  const draft = await getJobDraft(id);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "Draft not found after save." }, { status: 404 });
  }

  console.info("[job-draft-push] using latest draft", {
    draftId: draft.id,
    title: draft.title,
    city: draft.city,
    usState: draft.usState,
    descriptionLength: draft.description.length,
    updatedAt: draft.updatedAt,
    savedFieldsFromRequest: Object.keys(patch),
  });

  const validation = validateJobDraftForBreezyPush(draft);
  if (!validation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: validation.message,
        fieldErrors: validation.errors,
      },
      { status: 400 },
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
      {
        ok: false,
        error: result.error,
        rateLimited: result.rateLimited ?? false,
        fieldErrors: result.fieldErrors,
      },
      { status: result.rateLimited ? 429 : result.fieldErrors ? 400 : 502 },
    );
  }

  const updated = await updateJobDraft(id, {
    status: "pushed",
    breezyJobId: result.breezyJobId,
    pushedAt: result.fetchedAt,
    pushError: undefined,
    ...(draft.variant
      ? { variant: { ...draft.variant, queueStatus: "published" as const } }
      : {}),
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
    verification: result.verification,
  });
}
