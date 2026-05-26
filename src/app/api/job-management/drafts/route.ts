import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  createJobDraft,
  findOpenDraftByClonedBreezyJobId,
  listJobDrafts,
} from "@/lib/job-management/job-draft-store";
import {
  fetchBreezyJobCatalog,
  jobCatalogRowToDraftInput,
} from "@/lib/job-management/breezy-job-catalog";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "job_drafts_read",
  });
  if (isGuardFailure(guard)) return guard;

  const drafts = await listJobDrafts();
  return NextResponse.json({ ok: true, drafts });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "job_draft_create",
  });
  if (isGuardFailure(guard)) return guard;

  let body: {
    action?: string;
    breezyJobId?: string;
    title?: string;
    description?: string;
    city?: string;
    usState?: string;
    payRate?: string;
    department?: string;
    source?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.action === "clone" && body.breezyJobId) {
    const existing = await findOpenDraftByClonedBreezyJobId(body.breezyJobId);
    if (existing) {
      console.info("[job-drafts] reusing open clone draft", {
        breezyJobId: body.breezyJobId,
        draftId: existing.id,
      });
      return NextResponse.json({ ok: true, draft: existing, reused: true });
    }

    const catalog = await fetchBreezyJobCatalog({ includeDraft: true });
    if (!catalog.ok) {
      console.warn("[job-drafts] breezy catalog fetch failed", { error: catalog.error });
      return NextResponse.json({ ok: false, error: catalog.error }, { status: 503 });
    }
    const row = catalog.jobs.find((j) => j.breezyJobId === body.breezyJobId);
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Breezy job not found in published or draft catalog." },
        { status: 404 },
      );
    }
    const draft = await createJobDraft(jobCatalogRowToDraftInput(row));
    auditFromSession(guard.session, {
      action: "api_access",
      entityType: "system",
      entityId: draft.id,
      metadata: { action: "clone", breezyJobId: body.breezyJobId, pipelineStatus: row.pipelineStatus },
    });
    return NextResponse.json({ ok: true, draft, reused: false });
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ ok: false, error: "title is required for new drafts." }, { status: 400 });
  }

  const draft = await createJobDraft({
    title,
    description: body.description?.trim() ?? "",
    city: body.city?.trim() ?? "",
    usState: body.usState?.trim() ?? "",
    payRate: body.payRate?.trim() ?? "",
    department: body.department?.trim() ?? "",
    source: body.source?.trim() || "SRS Dashboard",
  });

  auditFromSession(guard.session, {
    action: "api_access",
    entityType: "system",
    entityId: draft.id,
    metadata: { action: "create" },
  });

  return NextResponse.json({ ok: true, draft });
}
