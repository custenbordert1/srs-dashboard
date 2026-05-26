import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  deleteJobDraft,
  getJobDraft,
  updateJobDraft,
  updateJobVariantQueueStatus,
} from "@/lib/job-management/job-draft-store";
import type { JobVariantQueueStatus } from "@/lib/job-management/job-draft-types";
import { canTransitionQueueStatus } from "@/lib/job-management/job-variant-queue";
import { normalizeJobDraftLocationPatch } from "@/lib/job-management/normalize-job-location-fields";
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
    queueStatus: JobVariantQueueStatus;
    queueAction: "approve" | "archive" | "reject" | "reopen";
  }>;

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const existing = await getJobDraft(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Draft not found." }, { status: 404 });
  }

  if (body.queueStatus || body.queueAction) {
    if (!existing.variant) {
      return NextResponse.json({ ok: false, error: "Not a job variant draft." }, { status: 400 });
    }
    const nextStatus: JobVariantQueueStatus =
      body.queueStatus ??
      (body.queueAction === "approve"
        ? "approved"
        : body.queueAction === "archive"
          ? "archived"
          : body.queueAction === "reject"
            ? "rejected"
            : "pending");
    if (!canTransitionQueueStatus(existing.variant.queueStatus, nextStatus)) {
      return NextResponse.json(
        { ok: false, error: `Cannot transition queue status ${existing.variant.queueStatus} → ${nextStatus}.` },
        { status: 409 },
      );
    }
    const updated = await updateJobVariantQueueStatus(id, nextStatus);
    return NextResponse.json({ ok: true, draft: updated });
  }

  const patch = {
    ...(body.title !== undefined ? { title: body.title.trim() } : {}),
    ...(body.description !== undefined ? { description: body.description.trim() } : {}),
    ...(body.city !== undefined ? { city: body.city.trim() } : {}),
    ...(body.usState !== undefined ? { usState: body.usState.trim() } : {}),
    ...(body.payRate !== undefined ? { payRate: body.payRate.trim() } : {}),
    ...(body.department !== undefined ? { department: body.department.trim() } : {}),
    ...(body.source !== undefined ? { source: body.source.trim() } : {}),
  };

  const updated = await updateJobDraft(id, normalizeJobDraftLocationPatch(patch));
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

export async function DELETE(request: Request, context: RouteContext) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "job_draft_delete",
  });
  if (isGuardFailure(guard)) return guard;

  const { id } = await context.params;
  const draft = await getJobDraft(id);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "Draft not found." }, { status: 404 });
  }
  if (draft.status !== "draft") {
    return NextResponse.json(
      { ok: false, error: "Only unpublished drafts can be deleted." },
      { status: 409 },
    );
  }

  const deleted = await deleteJobDraft(id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Failed to delete draft." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deletedId: id });
}
