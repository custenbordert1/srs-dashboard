import { fetchBreezyJobs } from "@/lib/breezy-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state")?.trim() || "published";
  const result = await fetchBreezyJobs(state);
  const status = result.ok ? 200 : result.error.includes("Waiting on Breezy API key") ? 503 : 502;
  return NextResponse.json(result, { status });
}
