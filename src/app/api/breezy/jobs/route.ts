import { guardBreezyJobsResult } from "@/lib/auth/breezy-territory-guard";
import { getSessionFromRequest } from "@/lib/auth/request-session";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state")?.trim() || "published";
  const result = guardBreezyJobsResult(await fetchBreezyJobs(state), session);
  const status = result.ok ? 200 : result.error.includes("Waiting on Breezy API key") ? 503 : 502;
  return NextResponse.json(result, { status });
}
