import { fetchBreezyCandidates } from "@/lib/breezy-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("position_id")?.trim() || undefined;
  const state = searchParams.get("state")?.trim() || undefined;

  const result = await fetchBreezyCandidates({ positionId, state });
  const status = result.ok ? 200 : result.error.includes("BREEZY_API_KEY") ? 503 : 502;
  return NextResponse.json(result, { status });
}
