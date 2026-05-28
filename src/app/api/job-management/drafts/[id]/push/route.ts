import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { resolveBreezyCompany } from "@/lib/breezy-api";
import {
  appendJobPushAudit,
  getJobDraft,
  updateJobDraft,
} from "@/lib/job-management/job-draft-store";
import { validateJobDraftForBreezyPush } from "@/lib/job-management/breezy-position-payload";
import {
  isJobDraftPendingPush,
  isJobDraftPublished,
  normalizeJobDraftStatus,
} from "@/lib/job-management/job-draft-status";
import { verificationToAuditSnapshot } from "@/lib/job-management/job-draft-reconcile";
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
  republish?: boolean;
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
  try {
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

    const republish = body.republish === true;
    const { id } = await context.params;
    const existing = await getJobDraft(id);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Draft not found." }, { status: 404 });
    }

    if (isJobDraftPendingPush(existing)) {
      return NextResponse.json(
        { ok: false, error: "Push already in progress for this draft. Refresh to check status." },
        { status: 409 },
      );
    }

    if (isJobDraftPublished(existing) && !republish) {
      return NextResponse.json(
        {
          ok: false,
          error: "Push already completed for this variant. Use Republish to create another Breezy posting.",
          alreadyPublished: true,
          breezyJobId: existing.breezyJobId,
        },
        { status: 409 },
      );
    }

    const status = normalizeJobDraftStatus(existing.status);
    if (!republish && status !== "draft" && status !== "push_failed") {
      return NextResponse.json(
        { ok: false, error: "Only draft-status jobs can be pushed to Breezy." },
        { status: 409 },
      );
    }

    if (!republish) {
      const variantBlock = variantPushBlockReason(existing);
      if (variantBlock) {
        return NextResponse.json({ ok: false, error: variantBlock }, { status: 409 });
      }
    }

    const patch = normalizeJobDraftLocationPatch(trimPatch(body));
    if (Object.keys(patch).length > 0) {
      await updateJobDraft(id, patch);
    }

    await updateJobDraft(id, { status: "pending_push", pushError: undefined });

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
      republish,
      savedFieldsFromRequest: Object.keys(patch),
    });

    const validation = validateJobDraftForBreezyPush(draft);
    if (!validation.ok) {
      const rollbackStatus = republish
        ? "published"
        : status === "push_failed"
          ? "push_failed"
          : "draft";
      await updateJobDraft(id, {
        status: rollbackStatus,
        pushError: validation.message,
      });
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
    const breezyJobId = result.ok ? result.breezyJobId.trim() : "";
    const company = await resolveBreezyCompany();

    if (!result.ok || !breezyJobId) {
      const error = !result.ok
        ? result.error
        : "Breezy did not return a position id. The draft was not marked published.";
      await updateJobDraft(id, { status: "push_failed", pushError: error });
      await appendJobPushAudit({
        id: auditId,
        draftId: id,
        ok: false,
        error,
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
        metadata: { push: "failed", error, rateLimited: result.ok ? false : (result.rateLimited ?? false) },
      });
      return NextResponse.json(
        {
          ok: false,
          error,
          rateLimited: result.ok ? false : (result.rateLimited ?? false),
          fieldErrors: result.ok ? undefined : result.fieldErrors,
        },
        { status: result.ok ? 502 : result.rateLimited ? 429 : result.fieldErrors ? 400 : 502 },
      );
    }

    const verificationSnapshot = verificationToAuditSnapshot(result.verification, result.fetchedAt);

    const updated = await updateJobDraft(id, {
      status: "published",
      breezyJobId,
      pushedAt: result.fetchedAt,
      pushedBy: guard.session.email,
      pushError: undefined,
      lastSyncAt: result.fetchedAt,
      lastVerificationResult: verificationSnapshot,
      ...(draft.variant
        ? { variant: { ...draft.variant, queueStatus: "published" as const } }
        : {}),
    });

    await appendJobPushAudit({
      id: auditId,
      draftId: id,
      ok: true,
      breezyJobId,
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
      metadata: { push: "success", breezyJobId, republish },
    });

    return NextResponse.json({
      ok: true,
      draft: updated,
      breezyJobId,
      postedAt: result.fetchedAt,
      verification: result.verification,
      breezyCompanyId: company.ok ? company.companyId : undefined,
      republish,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Push to Breezy failed unexpectedly.";
    console.error("[job-draft-push] unhandled error", {
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    });
    try {
      const { id } = await context.params;
      const stuck = await getJobDraft(id);
      if (stuck && isJobDraftPendingPush(stuck)) {
        await updateJobDraft(id, { status: "push_failed", pushError: message });
      }
    } catch {
      // best-effort rollback
    }
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
